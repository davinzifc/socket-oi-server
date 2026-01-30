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

## Presencia (API)

- `GET /presence/online` (usuarios online)
- `GET /presence/section/:sectionId` (usuarios presentes en una sección)
- `GET /presence/user/:userId` (sockets/secciones del usuario)

## Métricas (Prometheus)

- `GET /metrics`

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
