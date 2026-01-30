import { Controller, Get } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';

@Controller('health')
export class HealthController {
  constructor(@InjectQueue('notifications') private notificationQueue: Queue) { }

  @Get()
  async check() {
    try {
      const isReady = await this.notificationQueue.isReady();
      return {
        status: 'ok',
        redis: isReady ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        status: 'error',
        redis: 'disconnected',
        error: error?.message ?? 'unknown_error',
        timestamp: new Date().toISOString(),
      };
    }
  }
}

