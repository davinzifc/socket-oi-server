import { Module } from '@nestjs/common';
import { CommonRedisModule } from '../../common/redis/redis.module';
import { PresenceService } from './presence.service';
import { PresenceController } from './presence.controller';

@Module({
  imports: [CommonRedisModule],
  providers: [PresenceService],
  controllers: [PresenceController],
  exports: [PresenceService],
})
export class PresenceModule { }

