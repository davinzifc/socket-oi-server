export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  bull: {
    limiterMax: parseInt(process.env.BULL_LIMITER_MAX || '50', 10),
    limiterDuration: parseInt(process.env.BULL_LIMITER_DURATION || '1000', 10),
    maxAttempts: parseInt(process.env.BULL_MAX_ATTEMPTS || '3', 10),
    backoffDelay: parseInt(process.env.BULL_BACKOFF_DELAY || '2000', 10),
  },
  socket: {
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT || '60000', 10),
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL || '25000', 10),
    redisAdapterEnabled:
      (process.env.SOCKET_REDIS_ADAPTER_ENABLED || '').toLowerCase() === 'true',
  },
  processor: {
    concurrencySingle: parseInt(process.env.PROCESSOR_CONCURRENCY_SINGLE || '10', 10),
    concurrencyBatch: parseInt(process.env.PROCESSOR_CONCURRENCY_BATCH || '5', 10),
    subBatchSize: parseInt(process.env.SUB_BATCH_SIZE || '50', 10),
    subBatchDelayMs: parseInt(process.env.SUB_BATCH_DELAY_MS || '10', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
  },
  auth: {
    required:
      (process.env.AUTH_REQUIRED || 'true').toLowerCase() !== 'false',
    jwt: {
      // HS256
      secret: process.env.AUTH_JWT_SECRET || '',
      issuer: process.env.AUTH_JWT_ISSUER || undefined,
      audience: process.env.AUTH_JWT_AUDIENCE || undefined,
    },
    // Lista simple para operaciones admin via WS (broadcast/presence:watch)
    adminUserIds: (process.env.AUTH_ADMIN_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  ws: {
    // Rate limiting básico (in-memory) para eventos iniciados por cliente
    rateLimit: {
      max: parseInt(process.env.WS_RATE_LIMIT_MAX || '60', 10),
      windowMs: parseInt(process.env.WS_RATE_LIMIT_WINDOW_MS || '10000', 10),
      broadcastMax: parseInt(process.env.WS_RATE_LIMIT_BROADCAST_MAX || '5', 10),
    },
    payloadMaxBytes: parseInt(process.env.WS_PAYLOAD_MAX_BYTES || '65536', 10), // 64KB por mensaje
    // Whitelist opcional de nombres de eventos emitidos por cliente (section/broadcast)
    allowedClientEmitEvents: (process.env.WS_ALLOWED_CLIENT_EMIT_EVENTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  presence: {
    socketTtlSeconds: parseInt(process.env.PRESENCE_SOCKET_TTL_SECONDS || '600', 10),
    idleAfterSeconds: parseInt(process.env.PRESENCE_IDLE_AFTER_SECONDS || '60', 10),
    offlineAfterSeconds: parseInt(process.env.PRESENCE_OFFLINE_AFTER_SECONDS || '', 10) || undefined,
    sweepLockTtlMs: parseInt(process.env.PRESENCE_SWEEP_LOCK_TTL_MS || '15000', 10),
  },
});

