import {
  Process,
  Processor,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { NotificationGateway } from './notification.gateway';
import type { NotificationJob } from './notification.service';

const CONCURRENCY_SINGLE = parseInt(process.env.PROCESSOR_CONCURRENCY_SINGLE || '10', 10);
const CONCURRENCY_BATCH = parseInt(process.env.PROCESSOR_CONCURRENCY_BATCH || '5', 10);
const SUB_BATCH_SIZE = parseInt(process.env.SUB_BATCH_SIZE || '50', 10);
const SUB_BATCH_DELAY_MS = parseInt(process.env.SUB_BATCH_DELAY_MS || '10', 10);

@Processor('notifications')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly gateway: NotificationGateway) { }

  @Process({
    name: 'send-notification',
    concurrency: CONCURRENCY_SINGLE,
  })
  async handleNotification(
    job: Job<NotificationJob>,
  ): Promise<{ success: boolean; processed?: number; error?: string }> {
    const { type, event, data, userIds, userId } = job.data;

    this.logger.debug(
      `Processing job ${job.id} of type ${type} (attempt ${job.attemptsMade + 1}/${job.opts.attempts})`,
    );

    try {
      switch (type) {
        case 'single':
          await this.processSingleNotification(userId!, event, data);
          break;
        case 'multiple':
          await this.processMultipleNotifications(userIds!, event, data);
          break;
        case 'broadcast':
          await this.processBroadcast(event, data);
          break;
        default:
          throw new Error(`Unknown notification type: ${type}`);
      }

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Error processing job ${job.id}: ${error.message}`, error.stack);

      if (job.attemptsMade < (job.opts.attempts || 3)) {
        throw error;
      }

      return { success: false, error: error.message };
    }
  }

  @Process({
    name: 'batch-notifications',
    concurrency: CONCURRENCY_BATCH,
  })
  async handleBatchNotifications(
    job: Job<NotificationJob[]>,
  ): Promise<{ success: boolean; processed: number; failed: number }> {
    const notifications = job.data;
    this.logger.log(`Processing batch of ${notifications.length} notifications`);

    let processed = 0;
    let failed = 0;

    for (const notification of notifications) {
      try {
        if (notification.type === 'multiple' && notification.userIds) {
          await this.processMultipleNotifications(
            notification.userIds,
            notification.event,
            notification.data,
          );
          processed++;
        } else {
          this.logger.warn(`Skipping invalid notification in batch`);
          failed++;
        }
      } catch (error: any) {
        this.logger.error(`Error processing notification in batch: ${error.message}`);
        failed++;
      }
    }

    this.logger.log(`Batch processing completed: ${processed} successful, ${failed} failed`);
    return { success: failed === 0, processed, failed };
  }

  private async processSingleNotification(
    userId: string,
    event: string,
    data: any,
  ): Promise<void> {
    this.gateway.sendToUser(userId, event, data);
    this.logger.debug(`Sent ${event} to user ${userId}`);
  }

  private async processMultipleNotifications(
    userIds: string[],
    event: string,
    data: any,
  ): Promise<void> {
    if (userIds.length <= SUB_BATCH_SIZE) {
      this.gateway.sendToUsers(userIds, event, data);
      this.logger.debug(`Sent ${event} to ${userIds.length} users`);
      return;
    }

    const subBatches = this.chunkArray(userIds, SUB_BATCH_SIZE);

    for (let i = 0; i < subBatches.length; i++) {
      const batch = subBatches[i];
      this.gateway.sendToUsers(batch, event, data);
      this.logger.debug(
        `Sent ${event} to batch ${i + 1}/${subBatches.length} (${batch.length} users)`,
      );

      if (i < subBatches.length - 1) {
        await this.delay(SUB_BATCH_DELAY_MS);
      }
    }

    this.logger.debug(
      `Completed sending ${event} to ${userIds.length} users in ${subBatches.length} batches`,
    );
  }

  private async processBroadcast(event: string, data: any): Promise<void> {
    this.gateway.broadcast(event, data);
    this.logger.debug(`Broadcast ${event} sent to all users`);
  }

  @OnQueueActive()
  onActive(job: Job): void {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job): void {
    this.logger.debug(`Job ${job.id} completed successfully`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

