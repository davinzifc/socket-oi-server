import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import {
  SendNotificationDto,
  SendMultipleNotificationsDto,
  BulkNotificationsDto,
  BroadcastNotificationDto,
  SendSectionNotificationDto,
  SendChatNotificationDto,
} from './dto/notification.dto';
import { AuthGuard } from '../../common/guards/auth.guard';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(AuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly notificationService: NotificationService) { }

  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Encolar notificación a un usuario' })
  @ApiResponse({ status: 202, description: 'Notification queued successfully' })
  async sendNotification(@Body() dto: SendNotificationDto): Promise<{
    message: string;
    timestamp: string;
  }> {
    this.logger.log(`Received request to send notification to user ${dto.userId}`);

    await this.notificationService.sendToUser(dto.userId, dto.event, dto.data, {
      priority: dto.priority,
    });

    return {
      message: 'Notification queued successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('send-multiple')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Encolar notificación a múltiples usuarios' })
  @ApiResponse({ status: 202, description: 'Notifications queued successfully' })
  async sendMultipleNotifications(@Body() dto: SendMultipleNotificationsDto): Promise<{
    message: string;
    userCount: number;
    timestamp: string;
  }> {
    this.logger.log(`Received request to send notification to ${dto.userIds.length} users`);

    await this.notificationService.sendToUsers(dto.userIds, dto.event, dto.data, {
      priority: dto.priority,
    });

    return {
      message: 'Notifications queued successfully',
      userCount: dto.userIds.length,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('bulk')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Encolar lote de notificaciones (bulk)' })
  @ApiResponse({ status: 202, description: 'Bulk notifications queued successfully' })
  async sendBulkNotifications(@Body() dto: BulkNotificationsDto): Promise<{
    message: string;
    notificationCount: number;
    timestamp: string;
  }> {
    this.logger.log(`Received bulk notification request with ${dto.notifications.length} notifications`);

    const count = await this.notificationService.sendBulkNotifications(dto.notifications);

    return {
      message: 'Bulk notifications queued successfully',
      notificationCount: count,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('broadcast')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Encolar broadcast a todos los conectados' })
  @ApiResponse({ status: 202, description: 'Broadcast queued successfully' })
  async broadcast(@Body() dto: BroadcastNotificationDto): Promise<{
    message: string;
    timestamp: string;
  }> {
    this.logger.log(`Received broadcast request for event: ${dto.event}`);

    await this.notificationService.broadcast(dto.event, dto.data, {
      priority: dto.priority ?? 1,
    });

    return {
      message: 'Broadcast queued successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('send-section')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Encolar notificación a una sección (room section:{sectionId})' })
  @ApiResponse({ status: 202, description: 'Section notification queued successfully' })
  async sendToSection(@Body() dto: SendSectionNotificationDto): Promise<{
    message: string;
    sectionId: string;
    timestamp: string;
  }> {
    this.logger.log(`Received request to send notification to section ${dto.sectionId}`);
    await this.notificationService.sendToSection(dto.sectionId, dto.event, dto.data, {
      priority: dto.priority,
    });
    return {
      message: 'Section notification queued successfully',
      sectionId: dto.sectionId,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('send-chat')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Encolar notificación a un chat (room chat:{chatId})' })
  @ApiResponse({ status: 202, description: 'Chat notification queued successfully' })
  async sendToChat(@Body() dto: SendChatNotificationDto): Promise<{
    message: string;
    chatId: string;
    timestamp: string;
  }> {
    this.logger.log(`Received request to send notification to chat ${dto.chatId}`);
    await this.notificationService.sendToChat(dto.chatId, dto.event, dto.data, {
      priority: dto.priority,
    });
    return {
      message: 'Chat notification queued successfully',
      chatId: dto.chatId,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener estadísticas de la cola Bull' })
  @ApiResponse({ status: 200, description: 'Queue stats' })
  async getStats(): Promise<{ queue: any; timestamp: string }> {
    this.logger.log('Fetching queue statistics');
    const stats = await this.notificationService.getQueueStats();
    return { queue: stats, timestamp: new Date().toISOString() };
  }

  @Post('clean')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Limpiar jobs antiguos (completed/failed)' })
  @ApiResponse({ status: 200, description: 'Queue cleaned successfully' })
  async cleanQueue(): Promise<{ message: string; timestamp: string }> {
    this.logger.log('Cleaning old jobs from queue');
    await this.notificationService.cleanQueue();
    return { message: 'Queue cleaned successfully', timestamp: new Date().toISOString() };
  }
}

