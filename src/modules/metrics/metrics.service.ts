import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Gauge, Registry } from 'prom-client';
import { PresenceService } from '../presence/presence.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  private lastQueueStats:
    | { waiting: number; active: number; failed: number; delayed?: number; completed?: number }
    | null = null;
  private lastQueueStatsAtMs = 0;
  private readonly queueStatsTtlMs = 5000;

  private async getCachedQueueStats() {
    const now = Date.now();
    if (this.lastQueueStats && now - this.lastQueueStatsAtMs < this.queueStatsTtlMs) {
      return this.lastQueueStats;
    }
    const stats = await this.notificationService.getQueueStats();
    this.lastQueueStats = stats;
    this.lastQueueStatsAtMs = now;
    return stats;
  }

  private readonly onlineUsersGauge = new Gauge({
    name: 'presence_online_users',
    help: 'Usuarios online (según PresenceService/Redis)',
    registers: [this.registry],
    collect: async () => {
      const n = await this.presenceService.getOnlineCount();
      this.onlineUsersGauge.set(n);
    },
  });

  private readonly activeSectionsGauge = new Gauge({
    name: 'presence_active_sections',
    help: 'Cantidad de secciones activas (con al menos 1 usuario)',
    registers: [this.registry],
    collect: async () => {
      const n = await this.presenceService.getActiveSectionsCount();
      this.activeSectionsGauge.set(n);
    },
  });

  private readonly activeChatsGauge = new Gauge({
    name: 'presence_active_chats',
    help: 'Cantidad de chats activos (con al menos 1 usuario)',
    registers: [this.registry],
    collect: async () => {
      const n = await this.presenceService.getActiveChatsCount();
      this.activeChatsGauge.set(n);
    },
  });

  private readonly bullWaitingGauge = new Gauge({
    name: 'bull_notifications_waiting',
    help: 'Jobs waiting en cola notifications',
    registers: [this.registry],
    collect: async () => {
      const stats = await this.getCachedQueueStats();
      this.bullWaitingGauge.set(stats.waiting);
    },
  });

  private readonly bullActiveGauge = new Gauge({
    name: 'bull_notifications_active',
    help: 'Jobs active en cola notifications',
    registers: [this.registry],
    collect: async () => {
      const stats = await this.getCachedQueueStats();
      this.bullActiveGauge.set(stats.active);
    },
  });

  private readonly bullFailedGauge = new Gauge({
    name: 'bull_notifications_failed',
    help: 'Jobs failed en cola notifications',
    registers: [this.registry],
    collect: async () => {
      const stats = await this.getCachedQueueStats();
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

