import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import configuration from './config/configuration';
import { NotificationModule } from './modules/notification/notification.module';
import { PresenceModule } from './modules/presence/presence.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string | undefined>('redis.password'),
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
  ],
  controllers: [HealthController],
})
export class AppModule { }

