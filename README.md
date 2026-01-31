# SocketOi — Sistema de Notificaciones (NestJS + Socket.IO + Bull + Redis)

Implementación basada en la especificación `ESPECIFICACION_TECNICA_SISTEMA_NOTIFICACIONES.md`.

## Requisitos

- Node.js >= 18
- Redis >= 7 (o Docker)

## Setup rápido (desarrollo)

1. Copia variables de entorno:

```bash
cp .env.example .env
```

2. Levanta Redis con Docker:

```bash
docker compose up -d redis
```

3. Instala dependencias y levanta el server:

```bash
npm install
npm run start:dev
```

Servidor: `http://localhost:3000`

## Endpoints principales

> Nota: Por defecto en `.env.example` `AUTH_REQUIRED=false`. Si lo activas, debes enviar header `Authorization`.

- `GET /health`
- `POST /notifications/send`
- `POST /notifications/send-multiple`
- `POST /notifications/bulk`
- `POST /notifications/broadcast`
- `GET /notifications/stats`
- `POST /notifications/clean`

Ejemplo (1 usuario):

```bash
curl -X POST "http://localhost:3000/notifications/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token" \
  -d '{"userId":"user123","event":"new_message","data":{"message":"Hello"},"priority":5}'
```

## WebSocket / Socket.IO

- Conexión: `ws://localhost:3000`
- Identificación (demo): query param `userId`
- Room: `user:{userId}`

### Presencia por secciones (rooms)

- Puedes pasar `sectionId` al conectar (ej. `home`, `chat`, `settings`)
  - Room: `section:{sectionId}`
- O cambiar de sección en runtime con:
  - Evento cliente→servidor: `presence:setSection` `{ sectionId }`

### Chats (rooms)

- Unirte a un chat:
  - Evento `chat:join` `{ chatId }` → room `chat:{chatId}`
- Salir de un chat:
  - Evento `chat:leave` `{ chatId }`
- Enviar mensaje a un chat (Política A: no-echo al emisor):
  - Evento `chat:sendMessage` `{ chatId, text|data, clientMessageId? }`
  - El server emite `chat_message` a todos en `chat:{chatId}` **menos** al socket emisor.

### DM (1:1)

- Enviar mensaje directo (Política A: no-echo):
  - Evento `dm:send` `{ toUserId, data, event? }`
  - El server emite al room `user:{toUserId}` (solo destinatario).

### Emitir a sección / broadcast desde cliente (Política A)

- A sección actual (sin echo):
  - Evento `section:emit` `{ event, data, sectionId? }` → se emite a `section:{sectionId}`
- Broadcast global (sin echo):
  - Evento `broadcast:emit` `{ event, data }` → se emite a todos los conectados menos al emisor

Ejemplo (pseudo):

```js
import { io } from "socket.io-client";
const socket = io("http://localhost:3000", {
  query: { userId: "user123", sectionId: "home" },
});
socket.on("connected", (payload) => console.log("connected", payload));
socket.on("new_message", (data) => console.log("new_message", data));
socket.on("error", (e) => console.log("error", e));

// cambiar sección
socket.emit("presence:setSection", { sectionId: "chat" }, (ack) =>
  console.log("ack", ack),
);

// unirse a un chat
socket.emit("chat:join", { chatId: "room-1" });

// enviar mensaje al chat (no te vuelve a llegar a ti)
socket.emit("chat:sendMessage", { chatId: "room-1", text: "hola" }, (ack) =>
  console.log(ack),
);

// dm a otro usuario (solo lo recibe el destinatario)
socket.emit("dm:send", { toUserId: "user456", data: { text: "hola" } });
```

## Tests

```bash
npm run test
npm run test:cov
npm run test:e2e
```

## Docker (app + redis)

```bash
docker compose up --build
```

### Docker (modo desarrollo con hot-reload)

```bash
docker compose -f docker-compose.dev.yml up --build
```

## Presencia (API)

- `GET /presence/online` (usuarios online)
- `GET /presence/sections` (secciones activas)
- `GET /presence/section/:sectionId` (usuarios presentes en una sección)
- `GET /presence/chats` (chats activos)
- `GET /presence/chat/:chatId` (usuarios presentes en un chat)
- `GET /presence/user/:userId` (sockets/secciones del usuario)

## Presencia (config recomendada)

Para que “online/offline” se actualice rápido ante cierres abruptos:

- `SOCKET_PING_TIMEOUT` / `SOCKET_PING_INTERVAL`: define cuánto tarda Socket.IO en detectar que el cliente ya no responde.
- `PRESENCE_SOCKET_TTL_SECONDS`: TTL de presencia en Redis (recomendado **ligeramente mayor** al ping timeout).
- `PRESENCE_SWEEP_INTERVAL_MS`: intervalo del sweeper que emite `presence:user_offline` cuando expira el TTL.

Valores típicos en dev:

- `SOCKET_PING_TIMEOUT=20000`
- `SOCKET_PING_INTERVAL=5000`
- `PRESENCE_SOCKET_TTL_SECONDS=45`
- `PRESENCE_SWEEP_INTERVAL_MS=5000`

## Métricas (Prometheus)

- `GET /metrics`
  - incluye `presence_active_sections` y `presence_active_chats`

## Stress tests

### HTTP (autocannon)

```bash
CONNECTIONS=100 DURATION=30 npm run stress:http
```

### WS (muchos clientes)

```bash
CLIENTS=500 npm run stress:ws
# o cambiando secciones continuamente:
CLIENTS=500 CHANGE_EVERY_MS=2000 npm run stress:ws
```

Para medir “hardware” durante stress:

- Si corres en docker: `docker stats`
- Si corres local: Activity Monitor o `ps -o %cpu,%mem -p <PID>` y consulta `/metrics`
