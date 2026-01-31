import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;

  constructor(private readonly configService: ConfigService) { }

  private parseRedisUrl(url: string): {
    host: string;
    port: number;
    password?: string;
    tls: boolean;
  } {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 6379,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      tls: u.protocol === 'rediss:',
    };
  }

  getClient(): Redis {
    if (this.client) return this.client;

    const redisUrl = this.configService.get<string | undefined>('redis.url');
    const tlsEnabled = this.configService.get<boolean>('redis.tlsEnabled') ?? false;

    const parsed = redisUrl ? this.parseRedisUrl(redisUrl) : undefined;

    const host = parsed?.host || this.configService.get<string>('redis.host') || 'localhost';
    const port = parsed?.port || this.configService.get<number>('redis.port') || 6379;
    const password = parsed?.password || this.configService.get<string | undefined>('redis.password');
    const db = this.configService.get<number>('redis.db') || 0;
    const tls = (parsed?.tls ?? false) || tlsEnabled;

    const client = new Redis({
      host,
      port,
      password,
      db,
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      ...(tls ? { tls: {} } : {}),
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

