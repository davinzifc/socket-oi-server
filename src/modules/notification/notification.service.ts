import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, JobOptions } from 'bull';
import { ConfigService } from '@nestjs/config';

export interface NotificationJob {
  type: 'single' | 'multiple' | 'broadcast';
  event: string;
  data: any;
  userIds?: string[];
  userId?: string;
  priority?: number;
  metadata?: Record<string, any>;
}

export interface BulkNotificationRequest {
  userIds: string[];
  event: string;
  data: any;
  priority?: number;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly BATCH_SIZE = 100;
  private readonly SMALL_BATCH_THRESHOLD = 10;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('notifications')
    private readonly notificationQueue: Queue<NotificationJob | NotificationJob[]>,
  ) { }

  async sendToUser(
    userId: string,
    event: string,
    data: any,
    options?: Partial<JobOptions>,
  ): Promise<void> {
    const attempts = options?.attempts ?? (this.configService.get<number>('bull.maxAttempts') ?? 3);
    const backoffDelay =
      this.configService.get<number>('bull.backoffDelay') ?? 2000;

    const job: NotificationJob = {
      type: 'single',
      userId,
      event,
      data,
      metadata: { queuedAt: new Date().toISOString() },
    };

    await this.notificationQueue.add('send-notification', job, {
      priority: options?.priority ?? 5,
      attempts,
      backoff: { type: 'exponential', delay: backoffDelay },
      removeOnComplete: true,
      removeOnFail: false,
      ...options,
    });

    this.logger.debug(`Queued notification for user ${userId}`);
  }

  async sendToUsers(
    userIds: string[],
    event: string,
    data: any,
    options?: Partial<JobOptions>,
  ): Promise<void> {
    if (!userIds?.length) {
      this.logger.warn('sendToUsers called with empty userIds array');
      return;
    }

    if (userIds.length < this.SMALL_BATCH_THRESHOLD) {
      const job: NotificationJob = {
        type: 'multiple',
        userIds,
        event,
        data,
        metadata: {
          queuedAt: new Date().toISOString(),
          userCount: userIds.length,
        },
      };

      await this.notificationQueue.add('send-notification', job, {
        priority: options?.priority ?? 5,
        removeOnComplete: true,
        removeOnFail: false,
        ...options,
      });

      this.logger.debug(`Queued notification for ${userIds.length} users`);
      return;
    }

    const batches = this.chunkArray(userIds, this.BATCH_SIZE);
    const jobs = batches.map((batch, index) => ({
      name: 'send-notification',
      data: {
        type: 'multiple' as const,
        userIds: batch,
        event,
        data,
        metadata: {
          queuedAt: new Date().toISOString(),
          batchIndex: index,
          batchSize: batch.length,
          totalBatches: batches.length,
        },
      },
      opts: {
        priority: options?.priority ?? 5,
        removeOnComplete: true,
        removeOnFail: false,
        ...options,
      },
    }));

    await this.notificationQueue.addBulk(jobs);
    this.logger.log(`Queued ${batches.length} batches for ${userIds.length} users`);
  }

  async sendBulkNotifications(
    notifications: BulkNotificationRequest[],
  ): Promise<number> {
    if (!notifications?.length) return 0;

    const jobs: NotificationJob[] = notifications.map((notif) => ({
      type: 'multiple',
      userIds: notif.userIds,
      event: notif.event,
      data: notif.data,
      priority: notif.priority,
      metadata: { queuedAt: new Date().toISOString() },
    }));

    await this.notificationQueue.add('batch-notifications', jobs, {
      priority: 3,
      attempts: this.configService.get<number>('bull.maxAttempts') ?? 3,
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.log(`Queued bulk batch with ${notifications.length} notifications`);
    return notifications.length;
  }

  async broadcast(
    event: string,
    data: any,
    options?: Partial<JobOptions>,
  ): Promise<void> {
    const job: NotificationJob = {
      type: 'broadcast',
      event,
      data,
      metadata: { queuedAt: new Date().toISOString() },
    };

    await this.notificationQueue.add('send-notification', job, {
      priority: options?.priority ?? 1,
      removeOnComplete: true,
      removeOnFail: false,
      ...options,
    });

    this.logger.log(`Queued broadcast notification: ${event}`);
  }

  async getQueueStats(): Promise<QueueStats> {
    const [waiting, active, completed, failed, delayed, paused] =
      await Promise.all([
        this.notificationQueue.getWaitingCount(),
        this.notificationQueue.getActiveCount(),
        this.notificationQueue.getCompletedCount(),
        this.notificationQueue.getFailedCount(),
        this.notificationQueue.getDelayedCount(),
        this.notificationQueue.isPaused(),
      ]);

    return { waiting, active, completed, failed, delayed, paused };
  }

  async cleanQueue(olderThanMs: number = 60 * 60 * 1000): Promise<void> {
    await this.notificationQueue.clean(olderThanMs, 'completed');
    await this.notificationQueue.clean(olderThanMs, 'failed');
    this.logger.log(`Cleaned jobs older than ${olderThanMs}ms from queue`);
  }

  async pauseQueue(): Promise<void> {
    await this.notificationQueue.pause();
    this.logger.warn('Notification queue paused');
  }

  async resumeQueue(): Promise<void> {
    await this.notificationQueue.resume();
    this.logger.log('Notification queue resumed');
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

