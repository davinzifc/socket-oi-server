import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisConnectionCheckService } from './redis-connection-check.service';

@Module({
  providers: [RedisService, RedisConnectionCheckService],
  exports: [RedisService, RedisConnectionCheckService],
})
export class CommonRedisModule { }

