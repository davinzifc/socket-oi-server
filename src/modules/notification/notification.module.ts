import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { NotificationProcessor } from './notification.processor';
import { NotificationController } from './notification.controller';
import { PresenceModule } from '../presence/presence.module';
import { AdminPresenceController } from './admin.presence.controller';

@Module({
  imports: [
    PresenceModule,
    BullModule.registerQueueAsync({
      name: 'notifications',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        limiter: {
          max: configService.get<number>('bull.limiterMax') ?? 50,
          duration: configService.get<number>('bull.limiterDuration') ?? 1000,
        },
        settings: {
          stalledInterval: 30000,
          maxStalledCount: 1,
        },
      }),
    }),
  ],
  controllers: [NotificationController, AdminPresenceController],
  providers: [NotificationGateway, NotificationService, NotificationProcessor],
  exports: [BullModule, NotificationService, NotificationGateway],
})
export class NotificationModule { }

