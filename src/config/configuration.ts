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
  },
});

