import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;

  constructor(private readonly configService: ConfigService) { }

  getClient(): Redis {
    if (this.client) return this.client;

    const host = this.configService.get<string>('redis.host') || 'localhost';
    const port = this.configService.get<number>('redis.port') || 6379;
    const password = this.configService.get<string | undefined>('redis.password');
    const db = this.configService.get<number>('redis.db') || 0;

    const client = new Redis({
      host,
      port,
      password,
      db,
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
    });

    client.on('connect', () => this.logger.log('Redis client connected'));
    client.on('error', (err) => this.logger.error('Redis client error', err));

    this.client = client;
    return client;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

