import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { PresenceService } from './presence.service';

@Controller('presence')
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) { }

  @Get('online')
  async online(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 200;
    const [count, users] = await Promise.all([
      this.presenceService.getOnlineCount(),
      this.presenceService.getOnlineUsers(n),
    ]);
    return { count, users };
  }

  @Get('section/:sectionId')
  async sectionUsers(
    @Param('sectionId') sectionId: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 500;
    const users = await this.presenceService.getSectionUsers(sectionId, n);
    return { sectionId, count: users.length, users };
  }

  @Get('user/:userId')
  async userState(@Param('userId') userId: string) {
    return await this.presenceService.getUserState(userId);
  }
}

