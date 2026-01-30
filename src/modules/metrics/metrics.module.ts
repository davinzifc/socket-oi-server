import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { PresenceModule } from '../presence/presence.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PresenceModule, NotificationModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule { }

