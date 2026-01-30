import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

export interface PresenceState {
  userId: string;
  sockets: Array<{
    socketId: string;
    sectionId?: string;
    connectedAt?: string;
  }>;
}

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  // TTL “de seguridad” para limpiar estado si el proceso muere sin disconnect
  private readonly SOCKET_TTL_SECONDS = parseInt(process.env.PRESENCE_SOCKET_TTL_SECONDS || '600', 10);

  constructor(private readonly redisService: RedisService) { }

  private socketKey(socketId: string) {
    return `presence:socket:${socketId}`;
  }

  private userSocketsKey(userId: string) {
    return `presence:user:${userId}:sockets`;
  }

  private onlineUsersKey() {
    return `presence:online:users`;
  }

  private sectionCountsKey(sectionId: string) {
    return `presence:section:${sectionId}:userCounts`;
  }

  private sectionUsersKey(sectionId: string) {
    return `presence:section:${sectionId}:users`;
  }

  async onConnect(params: {
    userId: string;
    socketId: string;
    sectionId?: string;
  }): Promise<void> {
    const redis = this.redisService.getClient();
    const { userId, socketId, sectionId } = params;

    const sk = this.socketKey(socketId);
    const usk = this.userSocketsKey(userId);

    const connectedAt = new Date().toISOString();
    const pipeline = redis.pipeline();

    pipeline.hset(sk, {
      userId,
      sectionId: sectionId || '',
      connectedAt,
      lastSeenAt: connectedAt,
    });
    pipeline.expire(sk, this.SOCKET_TTL_SECONDS);
    pipeline.sadd(usk, socketId);
    pipeline.expire(usk, this.SOCKET_TTL_SECONDS);
    pipeline.sadd(this.onlineUsersKey(), userId);

    if (sectionId) {
      pipeline.hincrby(this.sectionCountsKey(sectionId), userId, 1);
      pipeline.sadd(this.sectionUsersKey(sectionId), userId);
      // Mantener TTL por seguridad
      pipeline.expire(this.sectionCountsKey(sectionId), this.SOCKET_TTL_SECONDS);
      pipeline.expire(this.sectionUsersKey(sectionId), this.SOCKET_TTL_SECONDS);
    }

    await pipeline.exec();
  }

  async onDisconnect(socketId: string): Promise<void> {
    const redis = this.redisService.getClient();
    const sk = this.socketKey(socketId);

    const data = await redis.hgetall(sk);
    if (!data?.userId) {
      // ya expiró o nunca se registró
      return;
    }

    const userId = data.userId;
    const sectionId = data.sectionId || undefined;

    const pipeline = redis.pipeline();
    pipeline.del(sk);
    pipeline.srem(this.userSocketsKey(userId), socketId);

    if (sectionId) {
      pipeline.hincrby(this.sectionCountsKey(sectionId), userId, -1);
    }

    await pipeline.exec();

    // Si decrementamos sección, normalizar: si <=0, limpiar user de sección
    if (sectionId) {
      const count = await redis.hget(this.sectionCountsKey(sectionId), userId);
      const n = parseInt(count || '0', 10);
      if (n <= 0) {
        await redis
          .pipeline()
          .hdel(this.sectionCountsKey(sectionId), userId)
          .srem(this.sectionUsersKey(sectionId), userId)
          .exec();
      }
    }

    const remainingSockets = await redis.scard(this.userSocketsKey(userId));
    if (remainingSockets <= 0) {
      await redis
        .pipeline()
        .srem(this.onlineUsersKey(), userId)
        .del(this.userSocketsKey(userId))
        .exec();
    }
  }

  async setSection(params: { socketId: string; sectionId: string }): Promise<{ previousSectionId?: string }> {
    const redis = this.redisService.getClient();
    const { socketId, sectionId } = params;
    const sk = this.socketKey(socketId);

    const prev = await redis.hget(sk, 'sectionId');
    const prevSectionId = prev && prev.trim() ? prev : undefined;

    if (prevSectionId === sectionId) {
      await redis.expire(sk, this.SOCKET_TTL_SECONDS);
      return { previousSectionId: prevSectionId };
    }

    const socketData = await redis.hget(sk, 'userId');
    if (!socketData) {
      throw new Error('socket_not_registered');
    }
    const userId = socketData;

    const pipeline = redis.pipeline();
    pipeline.hset(sk, { sectionId, lastSeenAt: new Date().toISOString() });
    pipeline.expire(sk, this.SOCKET_TTL_SECONDS);

    // Decrementar sección previa
    if (prevSectionId) {
      pipeline.hincrby(this.sectionCountsKey(prevSectionId), userId, -1);
    }
    // Incrementar nueva sección
    pipeline.hincrby(this.sectionCountsKey(sectionId), userId, 1);
    pipeline.sadd(this.sectionUsersKey(sectionId), userId);

    pipeline.expire(this.sectionCountsKey(sectionId), this.SOCKET_TTL_SECONDS);
    pipeline.expire(this.sectionUsersKey(sectionId), this.SOCKET_TTL_SECONDS);

    await pipeline.exec();

    // Normalizar prev section
    if (prevSectionId) {
      const count = await redis.hget(this.sectionCountsKey(prevSectionId), userId);
      const n = parseInt(count || '0', 10);
      if (n <= 0) {
        await redis
          .pipeline()
          .hdel(this.sectionCountsKey(prevSectionId), userId)
          .srem(this.sectionUsersKey(prevSectionId), userId)
          .exec();
      }
    }

    return { previousSectionId: prevSectionId };
  }

  async getOnlineUsers(limit: number = 200): Promise<string[]> {
    const redis = this.redisService.getClient();
    const users = await redis.smembers(this.onlineUsersKey());
    return users.slice(0, limit);
  }

  async getOnlineCount(): Promise<number> {
    const redis = this.redisService.getClient();
    return await redis.scard(this.onlineUsersKey());
  }

  async getSectionUsers(sectionId: string, limit: number = 500): Promise<string[]> {
    const redis = this.redisService.getClient();
    const users = await redis.smembers(this.sectionUsersKey(sectionId));
    return users.slice(0, limit);
  }

  async getUserState(userId: string): Promise<PresenceState> {
    const redis = this.redisService.getClient();
    const socketIds = await redis.smembers(this.userSocketsKey(userId));
    const pipeline = redis.pipeline();
    for (const sid of socketIds) {
      pipeline.hgetall(this.socketKey(sid));
    }
    const results = await pipeline.exec();

    // socketId no estaba almacenado explícitamente; lo reconstruimos desde la lista
    const normalized = socketIds.map((sid, idx) => ({
      socketId: sid,
      sectionId: (results?.[idx]?.[1] as any)?.sectionId || undefined,
      connectedAt: (results?.[idx]?.[1] as any)?.connectedAt || undefined,
    }));

    return { userId, sockets: normalized };
  }
}

