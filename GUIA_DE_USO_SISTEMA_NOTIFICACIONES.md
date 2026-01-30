# Guía de Uso — SocketOi (Notificaciones + Presencia + Salas + Stress)

**Proyecto:** SocketOi  
**Stack:** NestJS + Socket.IO + Bull + Redis  
**Objetivo:** notificaciones asíncronas en tiempo real + presencia (secciones/chats) + métricas + stress testing.

---

## 1) Conceptos clave (para entender cómo funciona)

### 1.1 Componentes

- **API REST (NestJS)**: recibe requests, valida DTOs y **encola jobs** en Bull.
- **Bull (cola)**: administra jobs en Redis (waiting/active/delayed/completed/failed).
- **Processor/Worker**: consume jobs y llama al Gateway para emitir eventos.
- **Gateway (Socket.IO)**: mantiene conexiones, rooms (salas) y emite eventos a clientes conectados.
- **Redis**: backend de Bull y store de presencia.

### 1.2 ¿Qué es un “job”?

Un **job** es una tarea encolada (por ejemplo “enviar notificación a user123”).  
Bull crea un `jobId` incremental y el worker lo procesa. Cuando termina sin errores, Bull lo marca como **completed**.

### 1.3 Rooms (“salas”) que usa el sistema

Este proyecto usa convenciones de nombre para rooms:

- **Room por usuario:** `user:{userId}`
  - Ej: `user:123`
  - Sirve para enviar mensajes directos a un usuario, incluso con varias pestañas (multi-socket).

- **Room por sección (presencia web):** `section:{sectionId}`
  - Ej: `section:home`, `section:chat`, `section:settings`
  - Sirve para saber “quién está en qué sección” y emitir eventos por sección.

- **Room por chat:** `chat:{chatId}`
  - Ej: `chat:room-1`, `chat:order-123`, `chat:support-xyz`
  - Sirve para chat grupal o 1:1 (si tu app lo modela así).

---

## 2) Requisitos y preparación

### 2.1 Requisitos

- Node.js >= 18
- Redis 7+ (recomendado con Docker)

### 2.2 Variables de entorno

1. Copia el ejemplo:

```bash
cp .env.example .env
```

2. Variables más importantes:

- **Redis**: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
- **Bull limiter** (muy importante en carga): `BULL_LIMITER_MAX`, `BULL_LIMITER_DURATION`
- **Concurrencia del processor**: `PROCESSOR_CONCURRENCY_SINGLE`, `PROCESSOR_CONCURRENCY_BATCH`
- **Logs**: `LOG_LEVEL` (`debug` genera muchísimos logs por job)
- **Auth**: `AUTH_REQUIRED=false` (en dev) / `true` (exige header Authorization)
- **Presencia**: `PRESENCE_SOCKET_TTL_SECONDS`

---

## 3) Cómo ejecutar Redis

### 3.1 Con Docker Compose (recomendado)

Desde la raíz del repo (donde está `docker-compose.yml`):

```bash
docker compose up -d redis
```

Detener:

```bash
docker compose stop redis
```

Bajar y borrar contenedor:

```bash
docker compose down
```

Bajar y **borrar datos** (volumen):

```bash
docker compose down -v
```

### 3.2 Problemas comunes con Docker

- Si ves **“Cannot connect to the Docker daemon … /var/run/docker.sock”**:
  - Abre **Docker Desktop** y espera que esté “Running”.

---

## 4) Cómo ejecutar el servidor

### 4.1 Desarrollo

```bash
npm install
npm run start:dev
```

Servidor: `http://localhost:3000`

### 4.2 Producción (docker)

```bash
docker compose up --build
```

---

## 5) Healthcheck

### `GET /health`

Verifica que Bull/Redis esté operativo (usa `queue.isReady()`).

```bash
curl -sS http://localhost:3000/health
```

---

## 6) API REST — Notificaciones (Bull)

> Importante: Los endpoints de envío responden **202 Accepted** porque el envío real es asíncrono (se encola y el worker procesa).

### 6.1 Auth (si está activado)

Si `AUTH_REQUIRED=true` debes enviar:

`Authorization: Bearer <token>`

En dev puedes dejar `AUTH_REQUIRED=false`.

### 6.2 `POST /notifications/send` (1 usuario)

Encola un job tipo `single`.

```bash
curl -X POST "http://localhost:3000/notifications/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev" \
  -d '{
    "userId":"user123",
    "event":"new_message",
    "data":{"message":"Hola"},
    "priority":5
  }'
```

### 6.3 `POST /notifications/send-multiple` (varios usuarios)

Encola tipo `multiple`.  
El service hace batching interno (100 por job cuando es grande).

```bash
curl -X POST "http://localhost:3000/notifications/send-multiple" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev" \
  -d '{
    "userIds":["user1","user2","user3"],
    "event":"system_announcement",
    "data":{"title":"Aviso","message":"Mensaje global"}
  }'
```

### 6.4 `POST /notifications/broadcast` (todos los conectados)

Encola tipo `broadcast`.

```bash
curl -X POST "http://localhost:3000/notifications/broadcast" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev" \
  -d '{
    "event":"order_update",
    "data":{"orderId":"123","status":"shipped"},
    "priority":1
  }'
```

### 6.5 `POST /notifications/bulk` (múltiples notificaciones distintas)

Encola `batch-notifications` (un job con un array de items).

```bash
curl -X POST "http://localhost:3000/notifications/bulk" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev" \
  -d '{
    "notifications":[
      {"userIds":["user1","user2"],"event":"order_update","data":{"orderId":"123","status":"packed"}},
      {"userIds":["user3"],"event":"payment_received","data":{"amount":100,"currency":"USD"}}
    ]
  }'
```

### 6.6 Estado de cola y mantenimiento

#### `GET /notifications/stats`

Te dice si hay backlog:

- `waiting`: pendientes inmediatos
- `active`: procesándose
- `delayed`: programados (rate limit / backoff)

```bash
curl -sS "http://localhost:3000/notifications/stats" -H "Authorization: Bearer dev"
```

#### `POST /notifications/clean`

Limpia jobs **completed** y **failed** antiguos (por defecto > 1 hora).

```bash
curl -X POST "http://localhost:3000/notifications/clean" -H "Authorization: Bearer dev"
```

> Nota: `clean` NO borra `delayed`. Para reset total en dev, reinicia Redis o baja el volumen.

---

## 7) WebSocket (Socket.IO) — Conexión y uso

### 7.1 Conexión básica (room por usuario)

El gateway extrae `userId` desde query param:

- Si falta `userId`, rechaza la conexión.

**Cliente JS:**

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  query: { userId: "user123" },
});

socket.on("connected", (payload) => console.log("connected", payload));
socket.on("error", (e) => console.log("error", e));

socket.on("new_message", (data) => {
  console.log("new_message", data);
});
```

### 7.2 Entrar a una sección al conectar (presencia)

Puedes pasar `sectionId` al conectar:

```js
const socket = io("http://localhost:3000", {
  query: { userId: "user123", sectionId: "home" },
});
```

Esto hace:

- `client.join("user:user123")`
- `client.join("section:home")`
- registra presencia en Redis.

### 7.3 Cambiar de sección (tracking “en qué página está”)

Evento:

- **cliente → servidor:** `presence:setSection` `{ sectionId }`

```js
socket.emit("presence:setSection", { sectionId: "chat" }, (ack) => {
  console.log("ack", ack);
});
```

> Recomendación: invoca esto cada vez que el usuario navega entre secciones (router).

### 7.4 Unirse a un chat

Eventos:

- **cliente → servidor:** `chat:join` `{ chatId }`
- **cliente → servidor:** `chat:leave` `{ chatId }`

```js
socket.emit("chat:join", { chatId: "room-1" });

// escuchar mensajes del chat (tu app define el evento)
socket.on("chat_message", (msg) => console.log("chat_message", msg));
```

> Para enviar mensajes de chat en este proyecto tienes dos opciones:
>
> - Enviar por REST y emitir con el event que definas.
> - Emitir desde el servidor a `chat:{chatId}` usando el gateway (ver más abajo).

---

## 8) Distribución por salas (cómo “enviar según sala”)

Este repo expone métodos en `NotificationGateway` para emitir por:

- usuario: `sendToUser(userId, event, data)`
- usuarios: `sendToUsers(userIds, event, data)`
- broadcast: `broadcast(event, data)`
- sección: `sendToSection(sectionId, event, data)`
- chat: `sendToChat(chatId, event, data)`

### 8.1 Flujo típico “sección web”

1. El cliente conecta con `sectionId` (o la setea con `presence:setSection`)
2. El servidor puede emitir a esa sección:
   - Room `section:home` para todos los que están viendo “home”
3. Puedes consultar quienes están ahí con `/presence/section/home`

### 8.2 Flujo típico “chat”

1. Cliente se une a `chat:room-1`
2. Servidor emite `chat_message` a `chat:room-1`
3. Todos los sockets que estén en esa room lo reciben

> Nota: Para exponer esto vía REST (ej. `POST /chats/:id/message`) se puede añadir un controller específico de chat. Hoy el repo ya soporta el concepto de room `chat:{chatId}` y join/leave.

---

## 9) Presencia (API) — Saber quién está dónde

### 9.1 Usuarios online

`GET /presence/online`

```bash
curl -sS "http://localhost:3000/presence/online"
```

### 9.2 Usuarios en una sección

`GET /presence/section/:sectionId`

```bash
curl -sS "http://localhost:3000/presence/section/home"
```

### 9.3 Estado de un usuario (sockets + secciones)

`GET /presence/user/:userId`

```bash
curl -sS "http://localhost:3000/presence/user/user123"
```

---

## 10) Métricas (observabilidad)

### `GET /metrics`

Exposición en formato Prometheus.

```bash
curl -sS http://localhost:3000/metrics | head -n 50
```

Métricas útiles:

- `presence_online_users`
- `bull_notifications_waiting`
- `bull_notifications_active`
- `bull_notifications_failed`

---

## 10.1 Casos de uso (enviar notificaciones desde un backend)

Esta sección responde a: “Tengo otro backend y necesito notificar a clientes conectados”.

Hay **dos estrategias** típicas:

- **Estrategia A (recomendada para desacoplar):** tu backend llama por HTTP a este servicio (SocketOi) y SocketOi se encarga de encolar y distribuir por WS.
- **Estrategia B (si estás dentro del mismo monolito NestJS):** desde tu propio módulo/servicio llamas a `NotificationService` o `NotificationGateway`.

### Caso 1 — Notificar a un usuario (1:1)

**A) Desde un backend externo (HTTP)**

```bash
curl -X POST "http://localhost:3000/notifications/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev" \
  -d '{
    "userId":"user123",
    "event":"new_message",
    "data":{"message":"Hola user123"},
    "priority":5
  }'
```

**B) Desde otro módulo NestJS (código)**

```ts
// inyecta NotificationService y encola
await this.notificationService.sendToUser(
  "user123",
  "new_message",
  { message: "Hola user123" },
  { priority: 5 },
);
```

### Caso 2 — Notificar a una lista de usuarios (N usuarios específicos)

**A) Desde un backend externo (HTTP)**

```bash
curl -X POST "http://localhost:3000/notifications/send-multiple" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev" \
  -d '{
    "userIds":["user1","user2","user3"],
    "event":"system_announcement",
    "data":{"title":"Aviso","message":"Mensaje para lista"}
  }'
```

**B) Desde otro módulo NestJS (código)**

```ts
await this.notificationService.sendToUsers(
  ["user1", "user2", "user3"],
  "system_announcement",
  { title: "Aviso", message: "Mensaje para lista" },
  { priority: 5 },
);
```

> Nota: Si la lista es grande, el service hace **batching** (100 por job) automáticamente.

### Caso 3 — Notificar a TODOS los usuarios conectados (broadcast)

**A) Desde un backend externo (HTTP)**

```bash
curl -X POST "http://localhost:3000/notifications/broadcast" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev" \
  -d '{
    "event":"system_maintenance",
    "data":{"message":"Mantenimiento programado"},
    "priority":1
  }'
```

**B) Desde otro módulo NestJS (código)**

```ts
await this.notificationService.broadcast(
  "system_maintenance",
  { message: "Mantenimiento programado" },
  { priority: 1 },
);
```

### Caso 4 — Notificar a todos los que están en una sección (room `section:{id}`)

Este caso es útil para “usuarios viendo la pantalla X”.

**Pre-requisito**: los clientes deben unirse a la sección (al conectar con `sectionId` o usando `presence:setSection`).

**Opción 1 (recomendada):** emitir directo a la room de sección (sin pasar por Bull).
Esto es ideal para eventos “en vivo” que no necesitas persistir como job.

```ts
this.notificationGateway.sendToSection("home", "section_ping", {
  message: "Hola a todos los que están en HOME",
});
```

**Opción 2 (HTTP + Bull, ya soportado):** encolar una notificación a una sección específica.

Endpoint:

- `POST /notifications/send-section`

```bash
curl -X POST "http://localhost:3000/notifications/send-section" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev" \
  -d '{
    "sectionId":"home",
    "event":"section_ping",
    "data":{"message":"Hola HOME"},
    "priority":4
  }'
```

### Caso 5 — Chat: enviar a todos los miembros de un chat (room `chat:{chatId}`)

**Pre-requisito**: los clientes deben hacer `chat:join { chatId }`.

Desde NestJS:

```ts
this.notificationGateway.sendToChat("room-1", "chat_message", {
  from: "user123",
  text: "hola chat",
  ts: new Date().toISOString(),
});
```

Si quieres hacerlo desde un backend externo por HTTP, lo habitual es exponer un endpoint
`POST /chats/:chatId/message` que internamente llame `sendToChat(...)`.

**HTTP + Bull (ya soportado en este proyecto):**

Endpoint:

- `POST /notifications/send-chat`

```bash
curl -X POST "http://localhost:3000/notifications/send-chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev" \
  -d '{
    "chatId":"room-1",
    "event":"chat_message",
    "data":{"from":"user123","text":"hola chat","ts":"2026-01-30T00:00:00.000Z"},
    "priority":4
  }'
```

### Caso 6 — “Backend central” → SocketOi (patrón recomendado)

Si tienes un backend “principal” (orders/payments/etc.) y SocketOi es un servicio aparte:

1. Tu backend decide el target:
   - userId (directo)
   - userIds[] (lista)
   - broadcast
2. Llama a SocketOi por HTTP (los endpoints de notificación).
3. SocketOi encola y entrega por WS.

Ventajas:

- desacople
- puedes escalar workers independientemente
- trazabilidad por colas/metrics

---

## 11) Logs y cómo interpretarlos

### 11.1 Por qué ves muchos logs en DEBUG

En carga, cada request encola jobs y el worker imprime:

- “Processing job …”
- “Sent event …”
- “Job … completed successfully”

### 11.2 Controlar ruido de logs

En `.env` usa:

- `LOG_LEVEL=info` (recomendado para pruebas de carga)
- `LOG_LEVEL=debug` (solo si estás investigando algo puntual)

Reinicia el server para aplicar.

---

## 12) Pruebas de estrés (stress testing)

### 12.1 Stress HTTP (encolado masivo)

Script: `npm run stress:http` (autocannon)

Ejemplo:

```bash
CONNECTIONS=50 DURATION=20 npm run stress:http
```

Qué mide:

- latencia del endpoint REST
- requests/segundo

Qué NO mide directamente:

- entrega WS (eso lo mide el stress de WS)

> Importante: si el throughput de encolado es mayor que el throughput de procesamiento (limiter/concurrencia), verás `delayed` alto en `/notifications/stats`.

### 12.2 Stress WebSocket (muchos clientes)

Script: `npm run stress:ws`

Ejemplo (1000 clientes, 4 secciones):

```bash
CLIENTS=1000 SECTIONS=home,feed,chat,settings npm run stress:ws
```

Ejemplo con cambio continuo de secciones:

```bash
CLIENTS=1000 CHANGE_EVERY_MS=2000 npm run stress:ws
```

### 12.3 Medir “hardware” durante stress

- **Docker**: `docker stats`
- **Local**:
  - Activity Monitor
  - `GET /metrics`
  - `ps -o %cpu,%mem -p <PID>`

---

## 13) Multi-instancia (escala horizontal)

Si levantas más de una instancia de NestJS detrás de un balanceador, para que los eventos WS se propaguen entre instancias necesitas:

- Redis accesible por todas las instancias
- Activar el adapter:
  - `SOCKET_REDIS_ADAPTER_ENABLED=true`

Así, si un usuario está conectado en instancia A, y la instancia B emite a `user:{userId}`, Redis Pub/Sub propaga y el usuario lo recibe.

---

## 14) Troubleshooting rápido

### 14.1 `delayed` muy alto en `/notifications/stats`

Normal cuando:

- `BULL_LIMITER_MAX` es bajo (ej. 50/seg) y encolas miles por segundo.
  Qué hacer:
- subir `BULL_LIMITER_MAX`
- subir `PROCESSOR_CONCURRENCY_SINGLE`
- bajar el rate de encolado (stress)
- bajar logs (`LOG_LEVEL=info`)

### 14.2 “docker.sock no existe”

Docker Desktop no está corriendo. Abrir Docker Desktop.

### 14.3 “missing userId” en WS

Conecta con `query: { userId: "..." }`.

---

## 15) Archivos relevantes del repo

- Notificaciones REST: `src/modules/notification/notification.controller.ts`
- Service Bull: `src/modules/notification/notification.service.ts`
- Worker: `src/modules/notification/notification.processor.ts`
- Gateway WS/rooms: `src/modules/notification/notification.gateway.ts`
- Presencia Redis: `src/modules/presence/presence.service.ts`
- API presencia: `src/modules/presence/presence.controller.ts`
- Métricas: `src/modules/metrics/metrics.controller.ts`
