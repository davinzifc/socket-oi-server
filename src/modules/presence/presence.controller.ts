import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PresenceService } from './presence.service';

@ApiTags('Presence')
@Controller('presence')
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) { }

  @Get('online')
  @ApiOperation({ summary: 'Listar usuarios online (según presencia en Redis)' })
  @ApiQuery({ name: 'limit', required: false, example: 200 })
  async online(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 200;
    const [count, users] = await Promise.all([
      this.presenceService.getOnlineCount(),
      this.presenceService.getOnlineUsers(n),
    ]);
    return { count, users };
  }

  @Get('section/:sectionId')
  @ApiOperation({ summary: 'Listar usuarios presentes en una sección' })
  @ApiParam({ name: 'sectionId', example: 'home' })
  @ApiQuery({ name: 'limit', required: false, example: 500 })
  async sectionUsers(
    @Param('sectionId') sectionId: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 500;
    const users = await this.presenceService.getSectionUsers(sectionId, n);
    return { sectionId, count: users.length, users };
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Obtener estado de presencia de un usuario (sockets + secciones)' })
  @ApiParam({ name: 'userId', example: 'user123' })
  async userState(@Param('userId') userId: string) {
    return await this.presenceService.getUserState(userId);
  }
}

