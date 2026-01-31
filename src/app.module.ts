import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import configuration from './config/configuration';
import { NotificationModule } from './modules/notification/notification.module';
import { PresenceModule } from './modules/presence/presence.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { HealthController } from './health.controller';
import { CommonRedisModule } from './common/redis/redis.module';

function parseRedisUrl(url: string): {
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // Bull usa ioredis internamente; pasamos opciones compatibles con ElastiCache
        redis: {
          ...(configService.get<string | undefined>('redis.url')
            ? (() => {
              const parsed = parseRedisUrl(configService.get<string>('redis.url')!);
              const tlsEnabled = (configService.get<boolean>('redis.tlsEnabled') ?? false) || parsed.tls;
              return {
                host: parsed.host,
                port: parsed.port,
                password: parsed.password,
                ...(tlsEnabled ? { tls: {} } : {}),
              };
            })()
            : {
              host: configService.get<string>('redis.host'),
              port: configService.get<number>('redis.port'),
              password: configService.get<string | undefined>('redis.password'),
              ...(configService.get<boolean>('redis.tlsEnabled') ? { tls: {} } : {}),
            }),
          db: configService.get<number>('redis.db'),
          maxRetriesPerRequest: 3,
          enableReadyCheck: false,
        },
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: configService.get<number>('bull.maxAttempts') ?? 3,
          backoff: {
            type: 'exponential',
            delay: configService.get<number>('bull.backoffDelay') ?? 2000,
          },
        },
      }),
    }),
    NotificationModule,
    PresenceModule,
    MetricsModule,
    // Incluye el check de conexión Redis (fail-fast)
    CommonRedisModule,
  ],
  controllers: [HealthController],
})
export class AppModule { }

