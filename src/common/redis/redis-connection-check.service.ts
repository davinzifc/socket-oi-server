import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

@Injectable()
export class RedisConnectionCheckService implements OnModuleInit {
  private readonly logger = new Logger(RedisConnectionCheckService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) { }

  async onModuleInit(): Promise<void> {
    const required =
      (process.env.REDIS_REQUIRED || 'true').toLowerCase() !== 'false';

    if (!required) {
      this.logger.warn('REDIS_REQUIRED=false; skipping Redis startup check');
      return;
    }

    const timeoutMs = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10);

    const client = this.redisService.getClient();

    try {
      await Promise.race([
        client.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('redis_connect_timeout')), timeoutMs),
        ),
      ]);

      this.logger.log('Redis connection check OK');
    } catch (err: any) {
      const url = this.configService.get<string | undefined>('redis.url');
      const host = this.configService.get<string>('redis.host');
      const port = this.configService.get<number>('redis.port');
      const target = url || `${host}:${port}`;

      this.logger.error(
        `Redis connection check FAILED (${target}). ` +
        `Revisa REDIS_URL/REDIS_HOST/REDIS_PORT/TLS/VPC. Error: ${err?.message || err}`,
      );

      // Fail-fast: si Redis no conecta, el sistema no debe levantar (Bull/Presence dependen de Redis)
      throw err;
    }
  }
}

