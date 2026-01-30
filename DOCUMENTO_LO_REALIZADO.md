# Documento de lo Realizado — Sistema de Notificaciones (Evaluación)

**Proyecto:** SocketOi  
**Fecha:** 30 Ene 2026  
**Base:** `ESPECIFICACION_TECNICA_SISTEMA_NOTIFICACIONES.md`  
**Stack:** NestJS + Socket.IO + Bull + Redis

---

## 1) Objetivo cumplido

Se implementó un sistema de notificaciones **asíncrono** que:

- Expone **API REST** para encolar notificaciones (responde 202).
- Procesa notificaciones en **Bull** (Redis) con **reintentos** y **backoff**.
- Emite eventos en tiempo real mediante **Socket.IO** usando rooms por usuario (`user:{userId}`).
- Incluye **healthcheck**, **docker**, **config por env**, y **tests**.

---

## 2) Alcance implementado vs. especificación (trazabilidad)

### EPIC 1: Configuración Base

- **US-001 (Setup NestJS/estructura)**: Implementado.
  - Bootstrap `src/main.ts` con `ValidationPipe` global y CORS.
  - Configuración centralizada con `@nestjs/config`.
- **US-002 (Redis y Bull + healthcheck)**: Implementado.
  - `BullModule.forRootAsync` con Redis y `defaultJobOptions`.
  - Healthcheck `GET /health` verificando `queue.isReady()`.

### EPIC 2: WebSocket y Gateway

- **US-003 (Gateway Socket.IO)**: Implementado.
  - Conexión valida `userId` (query param), registra sockets, une a room `user:{userId}`.
  - Manejo de múltiples sockets por usuario mediante `Map<userId, Set<socketId>>`.
  - Métodos de envío: `sendToUser`, `sendToUsers`, `broadcast`.
  - Filtro WS `WsExceptionFilter` emitiendo evento `error`.
- **US-004 (Redis Adapter Socket.IO)**: Implementado (opcional por env).
  - Activación via `SOCKET_REDIS_ADAPTER_ENABLED=true`.
  - Configurado con `@socket.io/redis-adapter` y `redis` clients pub/sub.

### EPIC 3: Sistema de Colas (Bull)

- **US-005 (NotificationService)**: Implementado.
  - Encolado `sendToUser`, `sendToUsers` con batching, `broadcast`, `sendBulkNotifications`.
  - Estadísticas de cola `getQueueStats`, limpieza `cleanQueue`, pause/resume.
- **US-006 (NotificationProcessor)**: Implementado.
  - Procesa `send-notification` y `batch-notifications`.
  - Concurrencia configurable por env (defaults: 10 y 5).
  - Sub-batching para múltiples usuarios (default 50) y delay (default 10ms).
  - Hooks Bull: `OnQueueActive`, `OnQueueCompleted`, `OnQueueFailed`.

### EPIC 4: API REST

- **US-007 (Controller + DTOs)**: Implementado.
  - Endpoints: `/notifications/send`, `/send-multiple`, `/bulk`, `/broadcast`, `/stats`, `/clean`.
  - DTOs con `class-validator` y pipe de validación.
  - Respuestas alineadas a la spec (202 para encolado, 200 para stats/clean).

### EPIC 5: Integración

- **US-008 (NotificationModule)**: Implementado.
  - `NotificationModule` integra controller/service/processor/gateway + registro de cola.

---

## 3) Estructura de archivos generada

Principales archivos agregados:

- **Config/Bootstrap**
  - `src/main.ts`
  - `src/app.module.ts`
  - `src/config/configuration.ts`
  - `src/health.controller.ts`
- **Common**
  - `src/common/filters/ws-exception.filter.ts`
  - `src/common/guards/auth.guard.ts` (placeholder de auth REST)
- **Notification module**
  - `src/modules/notification/notification.module.ts`
  - `src/modules/notification/notification.controller.ts`
  - `src/modules/notification/notification.service.ts`
  - `src/modules/notification/notification.processor.ts`
  - `src/modules/notification/notification.gateway.ts`
  - `src/modules/notification/dto/notification.dto.ts`
- **Infra/Docs**
  - `docker-compose.yml`
  - `Dockerfile`
  - `.env.example`
  - `README.md`
  - `SUMMARY_SISTEMA_NOTIFICACIONES.md` (resumen de la especificación)

---

## 4) Contratos implementados (endpoints y comportamiento)

### REST

- `POST /notifications/send` → **202** (encola job tipo `single`)
- `POST /notifications/send-multiple` → **202** (encola job tipo `multiple` o batching)
- `POST /notifications/bulk` → **202** (encola `batch-notifications`)
- `POST /notifications/broadcast` → **202** (encola job tipo `broadcast`)
- `GET /notifications/stats` → **200** (stats Bull)
- `POST /notifications/clean` → **200** (limpia jobs antiguos)
- `GET /health` → **200** (estado redis/queue)

### WebSocket

- Room por usuario: `user:{userId}`
- Evento server→client: `connected` al conectarse correctamente
- Eventos de notificación: se emiten usando `event` (ej. `new_message`)

---

## 5) Configuración por entorno

Se agregó `.env.example` con variables requeridas por la spec y algunas extensiones:

- `SOCKET_REDIS_ADAPTER_ENABLED` para activar Redis Adapter
- `AUTH_REQUIRED` para activar/desactivar auth REST (por defecto en ejemplo: `false` para facilitar dev)

---

## 6) Tests ejecutados

Se agregaron tests:

- **Unit**: `src/modules/notification/notification.service.spec.ts`
  - Valida encolado de `sendToUser`, batching de `sendToUsers`, y stats.
- **E2E (mocked)**: `test/notifications.e2e-spec.ts`
  - Levanta un módulo mínimo con `NotificationController` + `NotificationService` mock.
  - Override de `AuthGuard` para simplificar.

Comandos:

- `npm run build` (compila `dist/`)
- `npm test` (unit)
- `npm run test:e2e` (e2e con mocks)

---

## 7) Decisiones técnicas tomadas

- **Healthcheck**: se implementó vía `queue.isReady()` para reflejar disponibilidad Redis/Bull.
- **Auth REST**: se dejó un `AuthGuard` mínimo que exige header `Authorization` si `AUTH_REQUIRED=true`.
  - La validación real de JWT quedó marcada como pendiente (fuera de alcance del snippet).
- **Redis Adapter**: opcional por env para no obligar a Redis Pub/Sub en dev single instancia.
- **Concurrencia/Batching**: se respetaron valores por defecto de la spec (10/5 y 100/50/10ms).

---

## 8) Pendientes (conscientes) / mejoras recomendadas

- **Autenticación WS real**: extraer `userId` desde token y autorizar room (evitar query param en prod).
- **Notificaciones offline**: la spec menciona “pendientes”; falta persistencia y reentrega.
- **Observabilidad avanzada**: métricas Prometheus/OpenTelemetry (no incluida).
- **Rate limiting real**: integrar `@nestjs/throttler` (en la spec es sugerido).
- **Bull Board**: panel para monitoreo de colas (opcional).

---

## 10) Extensión “robusta” agregada: Presencia + Salas por Sección + Chats + Métricas + Stress

Se agregó un sistema de **presencia robusta** soportado por Redis para resolver:

- “¿Qué usuarios están en qué sección de la web?”
- “¿Cuántos usuarios están online?”
- “Rooms para chats” (ej. `chat:{chatId}`) además de rooms por usuario y por sección.

### Presencia (Redis, multi-instancia)

Persistencia de presencia:

- Por socket: `presence:socket:{socketId}` (hash: `userId`, `sectionId`, timestamps)
- Por usuario: `presence:user:{userId}:sockets` (set de sockets)
- Usuarios online: `presence:online:users` (set)
- Por sección (ref-count robusto):
  - `presence:section:{sectionId}:userCounts` (hash userId → sockets en la sección)
  - `presence:section:{sectionId}:users` (set userId presentes)

Incluye TTL de seguridad: `PRESENCE_SOCKET_TTL_SECONDS`.

### WebSocket rooms implementadas

- **Room por usuario**: `user:{userId}` (ya existía)
- **Room por sección**: `section:{sectionId}`
  - Se une al conectar si llega `sectionId` por query
  - O se cambia con evento `presence:setSection { sectionId }`
- **Room por chat**: `chat:{chatId}`
  - `chat:join { chatId }`
  - `chat:leave { chatId }`

### API de presencia

Se agregaron endpoints de consulta:

- `GET /presence/online`
- `GET /presence/section/:sectionId`
- `GET /presence/user/:userId`

### Métricas (Prometheus)

Se agregó `GET /metrics` con:

- métricas default del proceso (CPU/mem/event loop, etc.)
- gauges:
  - `presence_online_users`
  - `bull_notifications_waiting`
  - `bull_notifications_active`
  - `bull_notifications_failed`

### Stress tests (validación de carga + “hardware”)

Scripts incluidos:

- `npm run stress:http` (autocannon contra `/notifications/send`)
  - variables: `CONNECTIONS`, `DURATION`, `PIPELINE`, `AUTH`, `URL`
- `npm run stress:ws` (muchos clientes Socket.IO)
  - variables: `CLIENTS`, `SECTIONS`, `CHANGE_EVERY_MS`

Recomendación de medición durante stress:

- contenedores: `docker stats`
- local: Activity Monitor / `ps` + consulta a `GET /metrics`

---

## 9) Cómo ejecutar (resumen)

Desarrollo:

```bash
cp .env.example .env
docker compose up -d redis
npm install
npm run start:dev
```

Producción (docker):

```bash
docker compose up --build
```
