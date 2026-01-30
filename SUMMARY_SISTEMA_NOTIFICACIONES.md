# 📌 Sistema de Notificaciones en Tiempo Real — Documento Summary

**Fuente:** `ESPECIFICACION_TECNICA_SISTEMA_NOTIFICACIONES.md`  
**Versión:** 1.0.0  
**Fecha:** 30 de Enero, 2026  
**Stack:** NestJS + Socket.IO + Bull + Redis

---

## 1) Visión general

### Objetivo

Construir un sistema de notificaciones en tiempo real **escalable y robusto**, capaz de soportar **100,000+ notificaciones/minuto**, sin degradar el rendimiento del servidor.

### Problema

Evitar el patrón síncrono \(N notificaciones × M usuarios = N\*M operaciones\) que colapsa el servidor y provoca **timeouts** y **pérdida de notificaciones**.

### Solución (idea central)

Arquitectura **asíncrona** basada en **colas**:

- La API **encola** jobs rápidamente y responde (objetivo: **<50ms**).
- Workers consumen jobs desde Redis/Bull y emiten por **Socket.IO**.

Beneficios esperados:

- **Asincronía** (API rápida)
- **Escalado horizontal** (más instancias/workers)
- **Reintentos** automáticos
- **Persistencia** de jobs ante reinicios
- **Monitoreo** del estado de colas y envíos

---

## 2) Arquitectura del sistema

### Componentes principales

- **Cliente**: consume REST y/o WebSocket.
- **API NestJS**: valida requests, encola jobs (Bull).
- **Redis**:
  - Backend de Bull (colas y estados).
  - (Opcional) Pub/Sub para Socket.IO con Redis Adapter (multi-instancia).
- **Workers (Bull Processor)**: procesan jobs (concurrencia configurable).
- **Socket.IO Gateway**: gestiona conexiones, rooms por usuario y emisión de eventos.
- **Load Balancer**: distribuye tráfico a múltiples instancias NestJS.

### Flujo: envío de notificación (alto nivel)

1. Cliente → `POST /notifications/send`
2. Controller valida DTO
3. Service encola job en **Redis Queue (Bull)**
4. API responde **202 Accepted** inmediatamente
5. Worker consume job
6. Worker emite por Socket.IO al usuario (room `user:{userId}`)

### Flujo: conexión WebSocket

1. Cliente conecta al WS
2. Gateway valida/extrae `userId` (por query/auth; token “TODO”)
3. Gateway registra socket y lo une al room `user:{userId}`
4. Gateway emite evento `connected`

### Estrategia de escalabilidad

- **Horizontal**: múltiples instancias NestJS detrás de LB.
- **Redis**: escalado vertical y/o cluster según demanda.
- **Workers**: concurrencia por instancia; procesamiento paralelo controlado.
- **Rate limiting**: control por usuario/endpoint.

---

## 3) Requisitos técnicos (resumen)

### Versiones

- Node.js >= 18 LTS
- Redis >= 7.0
- NestJS >= 10.x
- TypeScript >= 5.0

### Infra mínima / recomendada

- NestJS: **2 vCPU / 2GB** → recomendado **4 vCPU / 8GB**
- Redis: **1 vCPU / 512MB** → recomendado **2 vCPU / 2GB**
- Disco: **20GB SSD** → recomendado **50GB SSD**
- Red: **100 Mbps** → recomendado **1 Gbps**

### Dependencias clave

NestJS WebSockets + Socket.IO, Bull, Redis (ioredis/redis), class-validator, class-transformer.

---

## 4) Historias de usuario y roadmap (alto nivel)

### Epics y US principales

- **EPIC 1 (Sprint 1)**: Setup base
  - US-001: inicializar proyecto NestJS y estructura
  - US-002: configurar Redis + Bull + healthcheck `/health`
- **EPIC 2 (Sprint 1–2)**: WebSocket
  - US-003: Gateway Socket.IO (rooms, multi-socket por usuario, conexión/desconexión)
  - US-004: Redis Adapter Socket.IO (comunicación multi-instancia)
- **EPIC 3 (Sprint 2)**: Colas Bull
  - US-005: NotificationService (encolar single/multiple/broadcast; batching)
  - US-006: Processor (consumir jobs; sub-batching; reintentos/backoff; hooks)
- **EPIC 4 (Sprint 2)**: API REST
  - US-007: Controller + DTOs + validación
- **EPIC 5 (Sprint 2)**: Integración final
  - US-008: NotificationModule integrando todo

### Estimación total

**28 story points** en **2 sprints**.

---

## 5) API REST (contrato resumido)

**Regla general:** endpoints de envío responden **202** (encolado), no bloquean por procesamiento.

| Método | Endpoint                       | Descripción                     | Auth | Status |
| ------ | ------------------------------ | ------------------------------- | ---- | ------ |
| POST   | `/notifications/send`          | Notificación a 1 usuario        | Sí   | 202    |
| POST   | `/notifications/send-multiple` | Notificación a varios usuarios  | Sí   | 202    |
| POST   | `/notifications/bulk`          | Varias notificaciones distintas | Sí   | 202    |
| POST   | `/notifications/broadcast`     | Broadcast a todos               | Sí   | 202    |
| GET    | `/notifications/stats`         | Stats de la cola                | Sí   | 200    |
| POST   | `/notifications/clean`         | Limpieza de jobs antiguos       | Sí   | 200    |
| GET    | `/health`                      | Health check Redis/Bull         | No   | 200    |

---

## 6) WebSocket (eventos resumidos)

### Cliente → Servidor

- **connect**: conexión al WS
  - Query param típico: `userId`

### Servidor → Cliente

- **connected**: confirmación
  - payload: `{ socketId, userId, timestamp }`
- **notification**: notificación genérica
  - payload: `{ event, data }`
- **error**: errores WS
  - payload: `{ message, timestamp }`

**Rooms:** `user:{userId}` (soporta múltiples sockets por usuario).

---

## 7) Procesamiento asíncrono (Bull)

### Cola y nombres de job

- **Queue**: `notifications`
- **Job names**:
  - `send-notification`: envíos single/multiple/broadcast
  - `batch-notifications`: batch de “notificaciones distintas” (bulk)

### Contrato de datos (payload)

Modelo conceptual (resumen):

- **NotificationJob**
  - `type`: `'single' | 'multiple' | 'broadcast'`
  - `event`: string (nombre de evento a emitir por Socket.IO)
  - `data`: objeto con el payload
  - `userId?`: string (para `single`)
  - `userIds?`: string[] (para `multiple`)
  - `priority?`: number (1–10, según DTOs)
  - `metadata?`: timestamps y datos de batching (ej. `queuedAt`, `batchIndex`, etc.)

- **QueueStats**
  - `waiting | active | completed | failed | delayed`: number
  - `paused`: boolean

### Reglas de encolado (NotificationService)

- **sendToUser(userId, event, data)**:
  - Encola 1 job `send-notification` con `type: 'single'`.
  - Defaults típicos: `priority: 5`, `attempts: 3`, `backoff: exponential (delay 2000ms)`,
    `removeOnComplete: true`, `removeOnFail: false`.
- **sendToUsers(userIds, event, data)**:
  - Si el volumen es pequeño (**< 10** usuarios): encola 1 job `type: 'multiple'`.
  - Si el volumen es grande: divide en lotes de **100** y usa `addBulk` (1 job por lote).
- **sendBulkNotifications(notifications[])**:
  - Encola 1 job `batch-notifications` con un array de items (cada item: evento + payload + userIds).
- **broadcast(event, data)**:
  - Encola 1 job `type: 'broadcast'` (en el ejemplo, prioridad alta: `priority: 1`).

### Reglas de consumo (NotificationProcessor)

- **handleNotification** (`send-notification`):
  - `concurrency: 10` (procesa hasta 10 jobs en paralelo).
  - Switch por `type`:
    - `single`: `gateway.sendToUser(userId, event, data)`
    - `multiple`: sub-batching para evitar saturar
    - `broadcast`: `gateway.broadcast(event, data)`
- **Sub-batching para `multiple`**:
  - Divide en sub-lotes de **50** usuarios
  - Espera **10ms** entre sub-lotes
- **handleBatchNotifications** (`batch-notifications`):
  - `concurrency: 5`
  - Procesa items del batch y acumula `processed/failed`

### Reintentos y resiliencia

- Bull reintenta automáticamente hasta `attempts` (default: **3**) con backoff exponencial.
- El processor “relanza” el error si aún quedan intentos, para que Bull ejecute el retry.

### Operación de la cola (mantenimiento)

- **Stats**: endpoint `/notifications/stats` usa `getQueueStats()` (waiting/active/completed/failed/delayed/paused).
- **Limpieza**: `/notifications/clean` limpia jobs antiguos; default de ejemplo: **1 hora** (\(3,600,000ms\)).
- **Pausar/Reanudar** (métodos): `pauseQueue()` / `resumeQueue()`.

---

## 8) Configuración (variables de entorno)

Variables clave (según la especificación):

- **Server**
  - `NODE_ENV` (development/production)
  - `PORT` (default 3000)
  - `CORS_ORIGIN` (default `*`)
- **Redis**
  - `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
- **Bull Queue**
  - `BULL_LIMITER_MAX` (ej. 50 dev / 100 prod)
  - `BULL_LIMITER_DURATION` (ms, ej. 1000)
  - `BULL_MAX_ATTEMPTS` (ej. 3)
  - `BULL_BACKOFF_DELAY` (ms, ej. 2000)
- **Socket.IO**
  - `SOCKET_PING_TIMEOUT` (ms, ej. 60000)
  - `SOCKET_PING_INTERVAL` (ms, ej. 25000)
- **Processor**
  - `PROCESSOR_CONCURRENCY_SINGLE` (ej. 10)
  - `PROCESSOR_CONCURRENCY_BATCH` (ej. 5)
  - `SUB_BATCH_SIZE` (ej. 50)
  - `SUB_BATCH_DELAY_MS` (ej. 10)
- **Logging**
  - `LOG_LEVEL` (ej. debug/info)

Notas de entorno:

- En **producción** se sugiere `LOG_LEVEL=info`, `BULL_LIMITER_MAX=100` y **contraseña fuerte** para Redis.

---

## 9) Estándares de código y estructura

### Convenciones

- **Clases**: PascalCase (ej. `NotificationService`)
- **Métodos**: camelCase (ej. `sendToUsers`)
- **Constantes**: UPPER_SNAKE_CASE (ej. `BATCH_SIZE`)
- **Interfaces**: PascalCase (ej. `NotificationJob`)
- **Archivos**: kebab-case (ej. `notification.processor.ts`)

### Organización sugerida

- `src/modules/notification/`: controller, service, processor, gateway, module, `dto/`
- `src/common/`: filters/guards/interceptors
- `src/config/`: `configuration.ts`
- `src/health.controller.ts`

### Validación

- `ValidationPipe` global con: `whitelist`, `transform`, `forbidNonWhitelisted`.
- DTOs con `class-validator`/`class-transformer`.

---

## 10) Testing (estrategia)

- **Unit tests**: cobertura mínima **85%**
- **Integration tests**: todos los endpoints
- **E2E**: flujos críticos
- **Load tests**: objetivo **1000 notificaciones/segundo**

Comandos (según spec):

- `npm run test`
- `npm run test:e2e`
- `npm run test:cov`
- `npm run test:watch`

---

## 11) Deployment (resumen operativo)

### Docker

- Imagen base recomendada: `node:18-alpine`
- Build: `npm ci --only=production` + `npm run build`
- Exposición: puerto `3000`

### docker-compose (app + redis)

- Servicio `redis` con `redis:7-alpine` y `appendonly yes`
- Servicio `app` dependiente de Redis, con variables de entorno apuntando a `redis`

### Multi-instancia (WebSockets)

- Se propone **Socket.IO Redis Adapter** (Pub/Sub en Redis) para propagar emisiones entre nodos cuando el usuario esté conectado a otra instancia.

---

## 12) Monitoreo y observabilidad

Métricas clave sugeridas:

- Notificaciones enviadas/segundo
- Latencia promedio de procesamiento
- Tasa de errores
- Usuarios conectados (únicos)
- Estado de cola: `waiting/active/failed/...`

Logging recomendado:

- `log` para eventos de negocio (encolado/broadcast/batch completado)
- `debug` para trazas de jobs y envíos
- `warn` para backlog alto / inputs anómalos
- `error` para fallos con stacktrace

---

## 13) Seguridad (controles mínimos)

- **Autenticación REST**: Guard (ej. JWT) validando `Authorization`.
- **Autenticación WS**:
  - Rechazar conexión si falta `userId`.
  - La validación por token está marcada como **TODO** en el ejemplo (pendiente extraer `userId` desde token).
- **Rate limiting**: sugerido vía `ThrottlerGuard` (ej. 10 req/min por usuario/IP).
- **Validación de entrada**: DTOs + sanitización de datos antes de procesar.

---

## 14) Pendientes y consideraciones (riesgos/decisiones)

- **Notificaciones offline**: el flujo menciona “enviar notificaciones pendientes”, pero no se detalla un mecanismo de persistencia/reentrega (sería una extensión a diseñar).
- **Auth WS real**: el ejemplo acepta `userId` por query; para producción debe derivarse del token y autorizar el acceso al room.
- **Estandarización de eventos**: el gateway permite emitir eventos arbitrarios por `event`; si se decide un solo evento `notification`, conviene fijar un “envelope” consistente `{ event, data }`.
