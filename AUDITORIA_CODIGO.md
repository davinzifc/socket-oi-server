# Auditoría de Código - SocketOi

**Fecha:** 2026-02-01
**Revisado por:** Desarrollador Senior
**Proyecto:** SocketOi (NestJS + Socket.IO + Bull + Redis)

---

## Resumen Ejecutivo

El código tiene una base sólida pero presenta **problemas críticos de seguridad, performance y malas prácticas** que deben corregirse antes de ir a producción. A continuación se detallan los hallazgos organizados por severidad.

### Estado (post-ajustes)

- **Bloqueadores de producción (AUTH-001..AUTH-005)**: ✅ **Corregidos**
- **Seguridad adicional (SEC-001..SEC-003)**: ✅ **Implementada** (rate limiting/payload/event hardening en WS)
- **Performance (PERF-001..PERF-006)**: ✅ Corregido lo de mayor impacto; ⚠️ `PERF-004` requiere rediseño
- **Arquitectura / refactors grandes**: ⚠️ No aplicados si introducen riesgo/ciclo o requieren decisión de despliegue multi-instancia

---

## 1. PROBLEMAS CRÍTICOS (Bloquean producción)

### 1.1 SEGURIDAD: AuthGuard NO valida tokens - Solo verifica existencia del header

**Archivo:** `src/common/guards/auth.guard.ts:18-27`

```typescript
canActivate(context: ExecutionContext): boolean {
  const required = this.configService.get<boolean>('auth.required') ?? true;
  if (!required) return true;

  const request = context.switchToHttp().getRequest();
  const token = request?.headers?.authorization;
  if (!token) {
    throw new UnauthorizedException('Missing Authorization header');
  }
  return true; // <-- PROBLEMA: Solo verifica que exista, NO valida el token
}
```

**Impacto:** Cualquier valor en el header `Authorization` (incluso `Bearer fake123`) permite acceso total a la API.

**Estado:** ✅ **HECHO** (ahora valida JWT HS256 real, exp/nbf, issuer/audience opcional; setea `request.user`).

**Solución requerida:**

```typescript
// Implementar validación real de JWT:
// 1. Extraer token del header "Bearer <token>"
// 2. Verificar firma con secret/public key
// 3. Validar expiración (exp claim)
// 4. Validar issuer/audience si aplica
// 5. Extraer userId/roles del payload
```

---

### 1.2 SEGURIDAD: WebSocket NO tiene autenticación real

**Archivo:** `src/modules/notification/notification.gateway.ts:290-301`

```typescript
private extractUserId(client: Socket): string | null {
  const token = (client.handshake as any)?.auth?.token;
  if (token) {
    // TODO: Validar token y extraer userId <-- NUNCA IMPLEMENTADO
  }

  const userId = (client.handshake.query as any)?.userId;
  if (typeof userId === 'string' && userId.trim()) {
    return userId.trim(); // <-- PROBLEMA: Acepta cualquier userId sin validar
  }
  return null;
}
```

**Impacto:** Cualquier cliente puede conectarse como cualquier usuario simplemente pasando `?userId=admin` o `?userId=victima123`. Esto permite:

- Recibir notificaciones de otros usuarios
- Suplantar identidad en chats
- Enviar mensajes como otro usuario

**Estado:** ✅ **HECHO** (si `AUTH_REQUIRED=true` se exige `handshake.auth.token`; `query.userId` queda solo para dev con `AUTH_REQUIRED=false`).

**Solución requerida:**

```typescript
// 1. Requerir token en auth.token del handshake
// 2. Validar JWT y extraer userId del payload
// 3. NO confiar en query params para identificación
```

---

### 1.3 SEGURIDAD: Endpoints de presencia sin autenticación

**Archivo:** `src/modules/presence/presence.controller.ts`

El controlador NO tiene `@UseGuards(AuthGuard)`, exponiendo información sensible:

- Lista de todos los usuarios online
- En qué sección está cada usuario
- En qué chats participan
- Estado detallado de cada usuario

**Estado:** ✅ **HECHO** (`PresenceController` ahora requiere `AuthGuard`).

**Solución requerida:**

```typescript
@ApiTags('Presence')
@ApiBearerAuth()
@Controller('presence')
@UseGuards(AuthGuard) // <-- AGREGAR
export class PresenceController {
```

---

### 1.4 SEGURIDAD: Broadcast desde cliente sin restricciones

**Archivo:** `src/modules/notification/notification.gateway.ts:505-524`

```typescript
@SubscribeMessage('broadcast:emit')
async broadcastEmit(
  @ConnectedSocket() client: Socket,
  @MessageBody() body: { event: string; data: any },
) {
  // PROBLEMA: Cualquier cliente puede hacer broadcast a TODOS
  client.broadcast.emit(event, payload);
  return { ok: true, ts: payload.ts };
}
```

**Impacto:** Un usuario malicioso puede enviar mensajes a todos los usuarios conectados (spam, phishing, etc).

**Estado:** ✅ **HECHO** (bloqueado para no-admin; control por `AUTH_ADMIN_USER_IDS`).

**Solución requerida:**

```typescript
// 1. Verificar roles/permisos del usuario (ej: solo admins)
// 2. O eliminar este endpoint de producción
// 3. Rate limiting por usuario
```

---

### 1.5 SEGURIDAD: section:emit sin validación de permisos

**Archivo:** `src/modules/notification/notification.gateway.ts:470-499`

El usuario puede emitir eventos a secciones arbitrarias si pasa `sectionId` en el body, no solo a su sección actual.

**Estado:** ✅ **HECHO** (por defecto solo sección actual; override a otra sección solo admins).

**Solución requerida:**

- Validar que el usuario tenga permiso para emitir a esa sección
- O solo permitir emitir a la sección actual del socket

---

## 2. PROBLEMAS DE PERFORMANCE (Alto impacto en producción)

### 2.1 PERFORMANCE: getOnlineCount() lee TODOS los usuarios

**Archivo:** `src/modules/presence/presence.service.ts:552-555`

```typescript
async getOnlineCount(): Promise<number> {
  const online = await this.getOnlineUsers(100000); // Lee hasta 100K usuarios
  return online.length;
}
```

**Impacto:** Con muchos usuarios, esta operación:

- Hace SMEMBERS de todos los usuarios
- Hace EXISTS por cada uno (N operaciones Redis)
- Carga todo en memoria

**Estado:** ✅ **HECHO** (ahora usa `SCARD`).

**Solución requerida:**

```typescript
async getOnlineCount(): Promise<number> {
  const redis = this.redisService.getClient();
  return await redis.scard(this.onlineUsersKey()); // O(1) en Redis
}
```

---

### 2.2 PERFORMANCE: Múltiples llamadas a getQueueStats() en metrics

**Archivo:** `src/modules/metrics/metrics.service.ts:40-68`

```typescript
// Cada gauge llama a getQueueStats() independientemente
// 3 gauges = 3 llamadas al endpoint /metrics = 9 llamadas a Bull
collect: async () => {
  const stats = await this.notificationService.getQueueStats();
  this.bullWaitingGauge.set(stats.waiting);
},
// ... se repite para active y failed
```

**Impacto:** Cada request a `/metrics` hace 6+ llamadas a Redis/Bull innecesarias.

**Estado:** ✅ **HECHO** (cache de stats por 5s).

**Solución requerida:**

```typescript
// Cachear stats por 5-10 segundos o usar un solo collect que setee todos los gauges
private lastStats: QueueStats | null = null;
private lastStatsTime = 0;

async getMetrics(): Promise<string> {
  if (Date.now() - this.lastStatsTime > 5000) {
    this.lastStats = await this.notificationService.getQueueStats();
    this.lastStatsTime = Date.now();
  }
  // usar this.lastStats
}
```

---

### 2.3 PERFORMANCE: onlineDetailed hace N\*3 llamadas a Redis

**Archivo:** `src/modules/presence/presence.controller.ts:25-41`

```typescript
const detailed = await Promise.all(
  users.map(async (userId) => {
    const [status, lastSeenAt, presenceVersion] = await Promise.all([
      this.presenceService.getUserStatus(userId), // 2 Redis calls
      this.presenceService.getUserLastSeenAt(userId), // 1 Redis call
      this.presenceService.getPresenceVersion(userId), // 1 Redis call
    ]);
    return { userId, status, lastSeenAt, presenceVersion };
  }),
);
```

**Impacto:** Con 200 usuarios = 800+ llamadas a Redis en un solo request.

**Estado:** ✅ **HECHO** (pipeline en `PresenceService.getUsersPresenceDetails()`).

**Solución requerida:**

```typescript
// Usar pipeline de Redis para batch todas las operaciones
// O crear un método getOnlineUsersDetailed() que use MGET
```

---

### 2.4 PERFORMANCE: cleanupUsersFromMemberships tiene complejidad O(users _ sections _ chats)

**Archivo:** `src/modules/presence/presence.service.ts:263-306`

```typescript
for (const userId of userIds) {
  for (const sectionId of activeSections) {
    p.srem(this.sectionUsersKey(sectionId), userId);
    p.hdel(this.sectionCountsKey(sectionId), userId);
  }
  for (const chatId of activeChats) {
    p.srem(this.chatUsersKey(chatId), userId);
    p.hdel(this.chatCountsKey(chatId), userId);
  }
}
```

**Impacto:** Con 100 usuarios, 50 secciones y 100 chats = 30,000 operaciones en el pipeline.

**Estado:** ⚠️ **NO APLICADO** (requiere índice inverso y cambios coordinados en join/leave + pruebas de regresión).

**Solución requerida:**

- Mantener índice inverso: qué secciones/chats tiene cada usuario
- Solo limpiar las membresías reales, no todas las posibles

---

### 2.5 PERFORMANCE: Sweeper emite eventos globales sin filtrar

**Archivo:** `src/modules/notification/notification.gateway.ts:88-98`

```typescript
for (const userId of offlineUsers) {
  const presenceVersion = await this.presenceService.bumpPresenceVersion(userId);
  // PROBLEMA: Emite a TODOS los clientes conectados
  this.server.emit('presence:user_offline', { userId, ts, reason: 'ttl', presenceVersion });
```

**Impacto:** Si hay 1000 usuarios conectados y 10 se desconectan, cada uno de los 1000 recibe 10 eventos.

**Estado:** ✅ **HECHO** (eventos de presencia se emiten solo a sockets suscritos con `presence:subscribe`; no fanout global).

**Solución requerida:**

- Solo emitir a clientes suscritos a presencia
- O usar rooms específicas para eventos de presencia

---

### 2.6 PERFORMANCE: chatLeave hace operaciones secuenciales no pipelined

**Archivo:** `src/modules/presence/presence.service.ts:629-655`

```typescript
await redis.set(...);
await redis.srem(...);
await redis.hincrby(...);
const count = await redis.hget(...);
if (n <= 0) {
  await redis.pipeline()...
}
const remainingInChat = await redis.scard(...);
if (remainingInChat <= 0) {
  await redis.srem(...);
}
```

**Impacto:** 5-7 round trips a Redis por cada `chat:leave`.

**Estado:** ✅ **HECHO** (reducción de round trips usando pipelines).

**Solución requerida:** Usar pipeline/transaction para todas las operaciones.

---

## 3. MALAS PRÁCTICAS DE CÓDIGO

### 3.1 Variables de entorno leídas fuera del ConfigService

**Archivos múltiples:**

- `notification.gateway.ts:18-22`
- `notification.processor.ts:13-16`
- `presence.service.ts:20-21`

```typescript
const PING_TIMEOUT = parseInt(process.env.SOCKET_PING_TIMEOUT || "60000", 10);
const PRESENCE_SWEEP_INTERVAL_MS = parseInt(
  process.env.PRESENCE_SWEEP_INTERVAL_MS || "10000",
  10,
);
```

**Problema:**

- No hay validación de tipos
- No usa el sistema de configuración de NestJS
- Inconsistente con el resto del código

**Solución:** Usar `ConfigService` inyectado para todas las variables.

**Estado:** ✅/⚠️ **PARCIAL** (Presencia + auth/ws ya usan `ConfigService`; quedan lecturas en inicialización estática de gateway/processor).

---

### 3.2 Tipo `any` usado extensivamente

**Archivos múltiples:**

```typescript
// notification.gateway.ts
const token = (client.handshake as any)?.auth?.token;
const userId = (client.handshake.query as any)?.userId;

// notification.service.ts
data: any;

// notification.dto.ts
data!: Record<string, any>;
```

**Solución:** Definir interfaces tipadas para todos los payloads.

---

### 3.3 Empty catch blocks que silencian errores

**Archivo:** `src/modules/notification/notification.gateway.ts:377-378, 400-401`

```typescript
try {
  await this.presenceService.chatJoin({ socketId: client.id, chatId });
} catch {} // <-- Error silenciado completamente
```

**Solución:** Al menos loguear el error:

```typescript
} catch (e) {
  this.logger.warn(`chatJoin failed: ${e?.message}`);
}
```

**Estado:** ✅ **HECHO** (gateway ya loguea errores en `chat:join` / `chat:leave`).

---

### 3.4 Duplicación de código: chunkArray() definido múltiples veces

**Archivos:**

- `notification.service.ts:260-266`
- `notification.processor.ts:175-181`

**Solución:** Extraer a un utility compartido.

**Estado:** ✅ **HECHO** (`src/common/utils/array.ts`).

---

### 3.5 Health endpoint no devuelve HTTP status code correcto

**Archivo:** `src/health.controller.ts:10-26`

```typescript
@Get()
async check() {
  try {
    // ...
    return { status: 'ok', ... };
  } catch (error: any) {
    return { status: 'error', ... }; // <-- Devuelve 200 OK con status: 'error'
  }
}
```

**Solución:**

```typescript
catch (error: any) {
  throw new ServiceUnavailableException({
    status: 'error',
    redis: 'disconnected',
    error: error?.message ?? 'unknown_error',
  });
}
```

**Estado:** ✅ **HECHO** (ahora devuelve 503 con `ServiceUnavailableException`).

---

### 3.6 RedisService usa lazy initialization sin manejo de reconexión

**Archivo:** `src/common/redis/redis.service.ts:12-34`

```typescript
getClient(): Redis {
  if (this.client) return this.client;
  // ... crea cliente
  client.on('error', (err) => this.logger.error('Redis client error', err));
  // No hay lógica de reconexión, no hay circuit breaker
}
```

**Solución:** Implementar reconnection strategy y health checks.

**Estado:** ✅ **HECHO** (se agregaron `retryStrategy`, `reconnectOnError` y eventos de conexión).

---

## 4. PROBLEMAS EN DOCUMENTACIÓN

### 4.1 .env.example tiene valores placeholder genéricos

**Archivo:** `.env.example`

```env
REDIS_HOST=xxxxx
REDIS_PORT=xxxxx
```

**Problema:** No proporciona valores de ejemplo útiles para desarrollo.

**Solución:**

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

---

### 4.2 README menciona docker-compose.redis.yml que no existe

**Archivo:** `GUIA_DE_USO_SISTEMA_NOTIFICACIONES.md:98-107`

```markdown
docker compose -f docker-compose.yml -f docker-compose.redis.yml up -d
```

**Problema:** El archivo `docker-compose.redis.yml` no existe en el repositorio.

---

### 4.3 Documentación inconsistente sobre AUTH_REQUIRED

El README dice:

> Por defecto en `.env.example` `AUTH_REQUIRED=false`

Pero el `.env.example` tiene `AUTH_REQUIRED=xxxxx` sin valor por defecto.

---

## 5. PROBLEMAS DE ARQUITECTURA

### 5.1 Presencia duplicada: Maps en memoria + Redis

**Archivo:** `src/modules/notification/notification.gateway.ts:43-45`

```typescript
private readonly userSockets = new Map<string, Set<string>>();
private readonly socketUsers = new Map<string, string>();
private readonly socketSection = new Map<string, string>();
```

**Problema:** El gateway mantiene estado en memoria Y en Redis (via PresenceService). Esto causa:

- Inconsistencia en multi-instancia
- Duplicación de lógica
- Memory leaks potenciales si no se limpia correctamente

**Solución:** Usar solo Redis como source of truth, o implementar sync entre instancias.

**Estado:** ⚠️ **NO APLICADO** (no bloquea producción en single instancia; requiere decisión si habrá multi-instancia + adapter Redis como source of truth).

---

### 5.2 AdminPresenceController en el módulo de Notification

**Archivo:** `src/modules/notification/notification.module.ts:29`

```typescript
controllers: [NotificationController, AdminPresenceController],
```

**Problema:** Rompe cohesión. Admin de presencia debería estar en PresenceModule.

**Estado:** ⚠️ **NO APLICADO** (moverlo hoy introduce dependencia circular porque el controller usa `NotificationGateway`).

---

### 5.3 Circular dependency potential: NotificationModule ↔ PresenceModule

El NotificationGateway usa PresenceService, pero el sweeper de presencia necesita emitir eventos via Gateway.

**Estado:** ⚠️ **NO APLICADO** (riesgo latente, pero no se forzó un refactor que rompa módulos; mitigado parcialmente al reducir fanout de presencia).

---

## 6. VULNERABILIDADES ADICIONALES

### 6.1 Sin rate limiting en WebSocket events

Un cliente malicioso puede hacer flood de eventos (`chat:sendMessage`, `dm:send`, etc.) sin restricción.

**Solución:** Implementar throttling por socket/usuario.

---

### 6.2 Sin validación de tamaño de payload

**Archivo:** `notification.gateway.ts:32`

```typescript
maxHttpBufferSize: 1e6, // 1MB - pero no hay validación en handlers
```

Los handlers de mensajes no validan el tamaño de `data`.

---

### 6.3 Event names aceptan cualquier string

```typescript
const event = body?.event?.trim?.() ? body.event.trim() : "";
```

Un atacante podría emitir eventos internos del sistema.

**Solución:** Whitelist de eventos permitidos.

---

## 7. MEJORAS RECOMENDADAS (No críticas)

### 7.1 Agregar logging estructurado (JSON)

Actualmente los logs son texto plano, difíciles de parsear en sistemas como ELK/Datadog.

### 7.2 Agregar tracing (OpenTelemetry)

Para correlacionar requests HTTP → Jobs Bull → Eventos WS.

### 7.3 Agregar tests de integración para flujos completos

Los tests E2E actuales son básicos. Faltan tests para:

- Flujo completo de notificación (REST → Bull → WS)
- Presencia multi-socket
- Cleanup de usuarios

### 7.4 Implementar graceful shutdown

```typescript
// main.ts
app.enableShutdownHooks();
```

Y manejar cleanup de conexiones en `onModuleDestroy`.

### 7.5 Agregar validación de mensajes entrantes en WebSocket

Usar class-validator en los handlers de WebSocket como se hace en REST.

---

## 8. LISTA DE TAREAS PARA CURSOR

### CRÍTICAS (Hacer primero):

1. [x] **AUTH-001**: Implementar validación real de JWT en `AuthGuard` (**HECHO**: HS256 + exp/nbf + issuer/audience opcional; setea `request.user`)
2. [x] **AUTH-002**: Implementar autenticación de WebSocket con JWT (no query params) (**HECHO**: si `AUTH_REQUIRED=true` exige `handshake.auth.token`; query `userId` queda solo en dev)
3. [x] **AUTH-003**: Agregar `@UseGuards(AuthGuard)` a `PresenceController` (**HECHO**)
4. [x] **AUTH-004**: Restringir `broadcast:emit` a roles admin o eliminar (**HECHO**: permitido solo para `AUTH_ADMIN_USER_IDS`)
5. [x] **AUTH-005**: Validar permisos en `section:emit` (**HECHO**: por defecto solo sección actual; override a otra sección solo admin)

### PERFORMANCE (Hacer después):

6. [x] **PERF-001**: Optimizar `getOnlineCount()` para usar SCARD (**HECHO**)
7. [x] **PERF-002**: Cachear stats en MetricsService (**HECHO**: cache 5s para evitar llamadas duplicadas a Bull/Redis)
8. [x] **PERF-003**: Usar pipeline Redis en `onlineDetailed` (**HECHO**: `PresenceService.getUsersPresenceDetails()` con pipeline)
9. [ ] **PERF-004**: Optimizar `cleanupUsersFromMemberships` con índice inverso (**NO APLICADO**: cambio arquitectónico grande; requiere rediseñar join/leave para mantener índice inverso y pruebas)
10. [x] **PERF-005**: Emitir eventos de presencia solo a suscritos (**HECHO**: presencia se emite solo a sockets que hagan `presence:subscribe`)
11. [x] **PERF-006**: Pipelinear operaciones en `chatLeave` (**HECHO**: reduce round trips usando pipelines)

### CÓDIGO (Refactoring):

12. [x] **CODE-001**: Mover lectura de env vars a ConfigService (**PARCIAL**: se movió Presencia a `ConfigService` + se agregó configuración auth/ws; quedan lecturas directas en `@WebSocketGateway({...})`/processor por ser inicialización estática)
13. [ ] **CODE-002**: Reemplazar `any` por tipos específicos (**NO APLICADO**: mejora de calidad sin impacto funcional inmediato; recomendable pero amplia)
14. [x] **CODE-003**: Agregar logging a catch blocks vacíos (**HECHO**: `chatJoin/chatLeave` en gateway ya loguean)
15. [x] **CODE-004**: Extraer `chunkArray` a utility compartido (**HECHO**: `src/common/utils/array.ts`)
16. [x] **CODE-005**: Health endpoint debe devolver 503 en error (**HECHO**)
17. [x] **CODE-006**: Agregar reconnection strategy a RedisService (**HECHO**: `retryStrategy` + eventos + `reconnectOnError`)
18. [ ] **CODE-007**: Mover AdminPresenceController a PresenceModule (**NO RECOMENDADO AHORA**: introduce dependencia circular (PresenceModule ↔ NotificationModule) porque el controller depende de `NotificationGateway`)

### SEGURIDAD ADICIONAL:

19. [x] **SEC-001**: Implementar rate limiting en WebSocket events (**HECHO**: best-effort in-memory con configuración `WS_RATE_LIMIT_*`)
20. [x] **SEC-002**: Validar tamaño de payload en handlers WS (**HECHO**: límite por bytes (`WS_PAYLOAD_MAX_BYTES`))
21. [x] **SEC-003**: Whitelist de event names permitidos (**HECHO**: validación + bloqueo de prefijos internos + whitelist opcional `WS_ALLOWED_CLIENT_EMIT_EVENTS`)

### DOCUMENTACIÓN:

22. [x] **DOC-001**: Actualizar .env.example con valores de ejemplo reales (**HECHO**)
23. [x] **DOC-002**: Crear o eliminar referencia a docker-compose.redis.yml (**HECHO**: se corrigió a `docker compose up -d redis`)
24. [x] **DOC-003**: Corregir documentación de AUTH_REQUIRED (**HECHO**: README actualizado + nuevas variables JWT)

---

## 9. Priorización Sugerida

| Fase       | Tareas              | Descripción                               |
| ---------- | ------------------- | ----------------------------------------- |
| **Fase 1** | AUTH-001 a AUTH-005 | Seguridad básica - **BLOQUEA PRODUCCIÓN** |
| **Fase 2** | SEC-001 a SEC-003   | Seguridad avanzada                        |
| **Fase 3** | PERF-001 a PERF-006 | Optimización de performance               |
| **Fase 4** | CODE-001 a CODE-007 | Calidad de código                         |
| **Fase 5** | DOC-001 a DOC-003   | Documentación                             |

---

## 10. Conclusión

El proyecto tiene una arquitectura razonable pero **NO está listo para producción** debido a las vulnerabilidades de seguridad identificadas. La prioridad absoluta debe ser implementar autenticación real tanto en REST como en WebSocket antes de cualquier despliegue.

Una vez resueltos los problemas de seguridad, las optimizaciones de performance permitirán escalar a miles de usuarios concurrentes sin problemas.
