import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Gauge, Registry } from 'prom-client';
import { PresenceService } from '../presence/presence.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  private readonly onlineUsersGauge = new Gauge({
    name: 'presence_online_users',
    help: 'Usuarios online (según PresenceService/Redis)',
    registers: [this.registry],
    collect: async () => {
      const n = await this.presenceService.getOnlineCount();
      this.onlineUsersGauge.set(n);
    },
  });

  private readonly bullWaitingGauge = new Gauge({
    name: 'bull_notifications_waiting',
    help: 'Jobs waiting en cola notifications',
    registers: [this.registry],
    collect: async () => {
      const stats = await this.notificationService.getQueueStats();
      this.bullWaitingGauge.set(stats.waiting);
    },
  });

  private readonly bullActiveGauge = new Gauge({
    name: 'bull_notifications_active',
    help: 'Jobs active en cola notifications',
    registers: [this.registry],
    collect: async () => {
      const stats = await this.notificationService.getQueueStats();
      this.bullActiveGauge.set(stats.active);
    },
  });

  private readonly bullFailedGauge = new Gauge({
    name: 'bull_notifications_failed',
    help: 'Jobs failed en cola notifications',
    registers: [this.registry],
    collect: async () => {
      const stats = await this.notificationService.getQueueStats();
      this.bullFailedGauge.set(stats.failed);
    },
  });

  constructor(
    private readonly presenceService: PresenceService,
    private readonly notificationService: NotificationService,
  ) {
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return await this.registry.metrics();
  }
}

