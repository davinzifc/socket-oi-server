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

  private userLastSeenKey(userId: string) {
    return `presence:user:${userId}:lastSeen`;
  }

  private sectionCountsKey(sectionId: string) {
    return `presence:section:${sectionId}:userCounts`;
  }

  private sectionUsersKey(sectionId: string) {
    return `presence:section:${sectionId}:users`;
  }

  private activeSectionsKey() {
    return `presence:sections:active`;
  }

  private socketChatsKey(socketId: string) {
    return `presence:socket:${socketId}:chats`;
  }

  private chatCountsKey(chatId: string) {
    return `presence:chat:${chatId}:userCounts`;
  }

  private chatUsersKey(chatId: string) {
    return `presence:chat:${chatId}:users`;
  }

  private activeChatsKey() {
    return `presence:chats:active`;
  }

  /**
   * Detecta usuarios online "stale" (sin lastSeen) y los remueve del set online.
   * Devuelve los userIds que realmente fueron removidos (útil para emitir eventos una sola vez).
   */
  async cleanupStaleOnlineUsers(): Promise<string[]> {
    const redis = this.redisService.getClient();
    const users = await redis.smembers(this.onlineUsersKey());
    if (!users.length) return [];

    const existsPipeline = redis.pipeline();
    for (const u of users) existsPipeline.exists(this.userLastSeenKey(u));
    const exists = await existsPipeline.exec();

    const stale: string[] = [];
    users.forEach((u, idx) => {
      const ok = (exists?.[idx]?.[1] as number) === 1;
      if (!ok) stale.push(u);
    });
    if (!stale.length) return [];

    // Remover stale y liberar llaves auxiliares. SREM nos permite "claim" y evitar duplicados entre instancias.
    const cleanupPipeline = redis.pipeline();
    for (const u of stale) {
      cleanupPipeline.srem(this.onlineUsersKey(), u);
      cleanupPipeline.del(this.userSocketsKey(u));
    }
    const res = await cleanupPipeline.exec();

    // res tiene 2 entradas por usuario (srem, del). Tomamos solo los que realmente fueron removidos del set online.
    const removed: string[] = [];
    for (let i = 0; i < stale.length; i++) {
      const sremIdx = i * 2;
      const sremRemoved = (res?.[sremIdx]?.[1] as number) || 0;
      if (sremRemoved === 1) removed.push(stale[i]);
    }

    if (removed.length) {
      this.logger.debug(`cleanupStaleOnlineUsers removed=${removed.length}`);
    }
    return removed;
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
    // lastSeen por usuario (TTL) para evitar "usuarios pegados" si no llega disconnect
    pipeline.set(this.userLastSeenKey(userId), connectedAt, 'EX', this.SOCKET_TTL_SECONDS);

    if (sectionId) {
      pipeline.hincrby(this.sectionCountsKey(sectionId), userId, 1);
      pipeline.sadd(this.sectionUsersKey(sectionId), userId);
      pipeline.sadd(this.activeSectionsKey(), sectionId);
      // Mantener TTL por seguridad
      pipeline.expire(this.sectionCountsKey(sectionId), this.SOCKET_TTL_SECONDS);
      pipeline.expire(this.sectionUsersKey(sectionId), this.SOCKET_TTL_SECONDS);
      pipeline.expire(this.activeSectionsKey(), this.SOCKET_TTL_SECONDS);
    }

    await pipeline.exec();
  }

  /**
   * Heartbeat: renueva TTLs y lastSeen.
   * Útil para desconexiones abruptas (sin disconnect) y para que presencia no quede stale.
   */
  async heartbeat(params: { socketId: string; sectionId?: string }): Promise<void> {
    const redis = this.redisService.getClient();
    const { socketId, sectionId } = params;
    const sk = this.socketKey(socketId);

    const userId = await redis.hget(sk, 'userId');
    if (!userId) throw new Error('socket_not_registered');

    const now = new Date().toISOString();
    const pipeline = redis.pipeline();
    pipeline.hset(sk, { lastSeenAt: now, ...(sectionId ? { sectionId } : {}) });
    pipeline.expire(sk, this.SOCKET_TTL_SECONDS);
    pipeline.expire(this.userSocketsKey(userId), this.SOCKET_TTL_SECONDS);
    pipeline.set(this.userLastSeenKey(userId), now, 'EX', this.SOCKET_TTL_SECONDS);

    // si viene sectionId, también mantenemos membership activo
    if (sectionId) {
      pipeline.sadd(this.sectionUsersKey(sectionId), userId);
      pipeline.sadd(this.activeSectionsKey(), sectionId);
      pipeline.expire(this.sectionUsersKey(sectionId), this.SOCKET_TTL_SECONDS);
      pipeline.expire(this.activeSectionsKey(), this.SOCKET_TTL_SECONDS);
    }

    // mantener socketChatsKey (si existe)
    pipeline.expire(this.socketChatsKey(socketId), this.SOCKET_TTL_SECONDS);

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
    const chatIds = await redis.smembers(this.socketChatsKey(socketId));

    const pipeline = redis.pipeline();
    pipeline.del(sk);
    pipeline.srem(this.userSocketsKey(userId), socketId);
    pipeline.del(this.socketChatsKey(socketId));

    if (sectionId) {
      pipeline.hincrby(this.sectionCountsKey(sectionId), userId, -1);
    }

    // Decrementar membresías de chats
    for (const chatId of chatIds) {
      pipeline.hincrby(this.chatCountsKey(chatId), userId, -1);
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

      // si sección quedó vacía, remover de activas
      const remainingInSection = await redis.scard(this.sectionUsersKey(sectionId));
      if (remainingInSection <= 0) {
        await redis.srem(this.activeSectionsKey(), sectionId);
      }
    }

    // Normalizar chats: si <=0, remover user de chat y chat de activas si queda vacío
    for (const chatId of chatIds) {
      const count = await redis.hget(this.chatCountsKey(chatId), userId);
      const n = parseInt(count || '0', 10);
      if (n <= 0) {
        await redis
          .pipeline()
          .hdel(this.chatCountsKey(chatId), userId)
          .srem(this.chatUsersKey(chatId), userId)
          .exec();
      }
      const remainingInChat = await redis.scard(this.chatUsersKey(chatId));
      if (remainingInChat <= 0) {
        await redis.srem(this.activeChatsKey(), chatId);
      }
    }

    const remainingSockets = await redis.scard(this.userSocketsKey(userId));
    if (remainingSockets <= 0) {
      await redis
        .pipeline()
        .srem(this.onlineUsersKey(), userId)
        .del(this.userSocketsKey(userId))
        .del(this.userLastSeenKey(userId))
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
    pipeline.sadd(this.activeSectionsKey(), sectionId);

    pipeline.expire(this.sectionCountsKey(sectionId), this.SOCKET_TTL_SECONDS);
    pipeline.expire(this.sectionUsersKey(sectionId), this.SOCKET_TTL_SECONDS);
    pipeline.expire(this.activeSectionsKey(), this.SOCKET_TTL_SECONDS);

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
      const remainingInSection = await redis.scard(this.sectionUsersKey(prevSectionId));
      if (remainingInSection <= 0) {
        await redis.srem(this.activeSectionsKey(), prevSectionId);
      }
    }

    return { previousSectionId: prevSectionId };
  }

  async getOnlineUsers(limit: number = 200): Promise<string[]> {
    const redis = this.redisService.getClient();
    const users = await redis.smembers(this.onlineUsersKey());
    if (!users.length) return [];

    // Filtrar usuarios "stale" (sin lastSeen key) y limpiar set
    const pipeline = redis.pipeline();
    for (const u of users) pipeline.exists(this.userLastSeenKey(u));
    const exists = await pipeline.exec();

    const online: string[] = [];
    const stale: string[] = [];
    users.forEach((u, idx) => {
      const ok = (exists?.[idx]?.[1] as number) === 1;
      if (ok) online.push(u);
      else stale.push(u);
    });

    if (stale.length) {
      await redis.srem(this.onlineUsersKey(), ...stale);
    }

    return online.slice(0, limit);
  }

  async getOnlineCount(): Promise<number> {
    const online = await this.getOnlineUsers(100000);
    return online.length;
  }

  async getSectionUsers(sectionId: string, limit: number = 500): Promise<string[]> {
    const redis = this.redisService.getClient();
    const users = await redis.smembers(this.sectionUsersKey(sectionId));
    if (!users.length) return [];

    // Quitar usuarios stale (offline) de la sección
    const pipeline = redis.pipeline();
    for (const u of users) pipeline.exists(this.userLastSeenKey(u));
    const exists = await pipeline.exec();

    const active: string[] = [];
    const stale: string[] = [];
    users.forEach((u, idx) => {
      const ok = (exists?.[idx]?.[1] as number) === 1;
      if (ok) active.push(u);
      else stale.push(u);
    });

    if (stale.length) {
      await redis.srem(this.sectionUsersKey(sectionId), ...stale);
    }

    return active.slice(0, limit);
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

  // -----------------------
  // Chats (presencia)
  // -----------------------

  async chatJoin(params: { socketId: string; chatId: string }): Promise<void> {
    const redis = this.redisService.getClient();
    const { socketId, chatId } = params;
    const sk = this.socketKey(socketId);

    const userId = await redis.hget(sk, 'userId');
    if (!userId) throw new Error('socket_not_registered');

    const pipeline = redis.pipeline();
    pipeline.sadd(this.socketChatsKey(socketId), chatId);
    pipeline.expire(this.socketChatsKey(socketId), this.SOCKET_TTL_SECONDS);
    pipeline.set(this.userLastSeenKey(userId), new Date().toISOString(), 'EX', this.SOCKET_TTL_SECONDS);

    pipeline.hincrby(this.chatCountsKey(chatId), userId, 1);
    pipeline.sadd(this.chatUsersKey(chatId), userId);
    pipeline.sadd(this.activeChatsKey(), chatId);

    pipeline.expire(this.chatCountsKey(chatId), this.SOCKET_TTL_SECONDS);
    pipeline.expire(this.chatUsersKey(chatId), this.SOCKET_TTL_SECONDS);
    pipeline.expire(this.activeChatsKey(), this.SOCKET_TTL_SECONDS);

    await pipeline.exec();
  }

  async chatLeave(params: { socketId: string; chatId: string }): Promise<void> {
    const redis = this.redisService.getClient();
    const { socketId, chatId } = params;
    const sk = this.socketKey(socketId);

    const userId = await redis.hget(sk, 'userId');
    if (!userId) throw new Error('socket_not_registered');

    await redis.set(this.userLastSeenKey(userId), new Date().toISOString(), 'EX', this.SOCKET_TTL_SECONDS);
    await redis.srem(this.socketChatsKey(socketId), chatId);
    await redis.hincrby(this.chatCountsKey(chatId), userId, -1);

    const count = await redis.hget(this.chatCountsKey(chatId), userId);
    const n = parseInt(count || '0', 10);
    if (n <= 0) {
      await redis
        .pipeline()
        .hdel(this.chatCountsKey(chatId), userId)
        .srem(this.chatUsersKey(chatId), userId)
        .exec();
    }

    const remainingInChat = await redis.scard(this.chatUsersKey(chatId));
    if (remainingInChat <= 0) {
      await redis.srem(this.activeChatsKey(), chatId);
    }
  }

  async getChatUsers(chatId: string, limit: number = 500): Promise<string[]> {
    const redis = this.redisService.getClient();
    const users = await redis.smembers(this.chatUsersKey(chatId));
    if (!users.length) return [];

    // Quitar usuarios stale (offline) del chat
    const pipeline = redis.pipeline();
    for (const u of users) pipeline.exists(this.userLastSeenKey(u));
    const exists = await pipeline.exec();

    const active: string[] = [];
    const stale: string[] = [];
    users.forEach((u, idx) => {
      const ok = (exists?.[idx]?.[1] as number) === 1;
      if (ok) active.push(u);
      else stale.push(u);
    });

    if (stale.length) {
      await redis.srem(this.chatUsersKey(chatId), ...stale);
    }

    return active.slice(0, limit);
  }

  async getActiveChats(limit: number = 200): Promise<string[]> {
    const redis = this.redisService.getClient();
    const chats = await redis.smembers(this.activeChatsKey());
    return chats.slice(0, limit);
  }

  async getActiveSections(limit: number = 200): Promise<string[]> {
    const redis = this.redisService.getClient();
    const sections = await redis.smembers(this.activeSectionsKey());
    return sections.slice(0, limit);
  }
}

