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

  @Get('online/detailed')
  @ApiOperation({ summary: 'Listar usuarios online con estado (ONLINE/IDLE) y lastSeen' })
  @ApiQuery({ name: 'limit', required: false, example: 200 })
  async onlineDetailed(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 200;
    const users = await this.presenceService.getOnlineUsers(n);

    const detailed = await Promise.all(
      users.map(async (userId) => {
        const [status, lastSeenAt, presenceVersion] = await Promise.all([
          this.presenceService.getUserStatus(userId),
          this.presenceService.getUserLastSeenAt(userId),
          this.presenceService.getPresenceVersion(userId),
        ]);
        return { userId, status, lastSeenAt, presenceVersion };
      }),
    );

    return { count: detailed.length, users: detailed };
  }

  @Get('sections')
  @ApiOperation({ summary: 'Listar secciones activas (con al menos 1 usuario)' })
  @ApiQuery({ name: 'limit', required: false, example: 200 })
  async activeSections(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 200;
    const sections = await this.presenceService.getActiveSections(n);
    return { count: sections.length, sections };
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

  @Get('chats')
  @ApiOperation({ summary: 'Listar chats activos (con al menos 1 usuario)' })
  @ApiQuery({ name: 'limit', required: false, example: 200 })
  async activeChats(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 200;
    const chats = await this.presenceService.getActiveChats(n);
    return { count: chats.length, chats };
  }

  @Get('chat/:chatId')
  @ApiOperation({ summary: 'Listar usuarios presentes en un chat' })
  @ApiParam({ name: 'chatId', example: 'room-1' })
  @ApiQuery({ name: 'limit', required: false, example: 500 })
  async chatUsers(@Param('chatId') chatId: string, @Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 500;
    const users = await this.presenceService.getChatUsers(chatId, n);
    return { chatId, count: users.length, users };
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Obtener estado de presencia de un usuario (sockets + secciones)' })
  @ApiParam({ name: 'userId', example: 'user123' })
  async userState(@Param('userId') userId: string) {
    return await this.presenceService.getUserState(userId);
  }
}

