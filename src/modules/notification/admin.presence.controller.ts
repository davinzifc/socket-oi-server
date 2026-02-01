import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PresenceService } from '../presence/presence.service';
import { NotificationGateway } from './notification.gateway';

@ApiTags('Admin Presence')
@ApiBearerAuth()
@Controller('admin/presence')
@UseGuards(AuthGuard)
export class AdminPresenceController {
  constructor(
    private readonly presenceService: PresenceService,
    private readonly gateway: NotificationGateway,
  ) { }

  @Post('disconnect/:userId')
  @ApiOperation({ summary: 'Desconectar (kick) todas las sesiones WS de un usuario' })
  @ApiParam({ name: 'userId', example: 'user123' })
  async disconnect(@Param('userId') userId: string) {
    this.gateway.disconnectUser(userId, true);
    return { ok: true };
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Dump de presencia de un usuario (status + sockets + version)' })
  @ApiParam({ name: 'userId', example: 'user123' })
  async dump(@Param('userId') userId: string) {
    const [status, lastSeenAt, presenceVersion, state] = await Promise.all([
      this.presenceService.getUserStatus(userId),
      this.presenceService.getUserLastSeenAt(userId),
      this.presenceService.getPresenceVersion(userId),
      this.presenceService.getUserState(userId),
    ]);
    return { userId, status, lastSeenAt, presenceVersion, state };
  }
}

