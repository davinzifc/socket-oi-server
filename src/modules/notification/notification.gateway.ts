import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { Logger, UseFilters, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsExceptionFilter } from '../../common/filters/ws-exception.filter';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { PresenceService } from '../presence/presence.service';
import {
  extractBearerToken,
  getUserIdFromJwtPayload,
  verifyJwtHs256,
} from '../../common/auth/jwt';

const PING_TIMEOUT = parseInt(process.env.SOCKET_PING_TIMEOUT || '60000', 10);
const PING_INTERVAL = parseInt(process.env.SOCKET_PING_INTERVAL || '25000', 10);
const REDIS_ADAPTER_ENABLED =
  (process.env.SOCKET_REDIS_ADAPTER_ENABLED || '').toLowerCase() === 'true';
const PRESENCE_SWEEP_INTERVAL_MS = parseInt(process.env.PRESENCE_SWEEP_INTERVAL_MS || '10000', 10);

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: PING_TIMEOUT,
  pingInterval: PING_INTERVAL,
  maxHttpBufferSize: 1e6,
  connectTimeout: 10000,
})
@UseFilters(WsExceptionFilter)
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  private readonly userSockets = new Map<string, Set<string>>();
  private readonly socketUsers = new Map<string, string>();
  private readonly socketSection = new Map<string, string>(); // socketId -> sectionId (cache local)
  private presenceSweepTimer?: NodeJS.Timeout;

  // Rate limiting in-memory (best effort).
  private readonly rl = new Map<string, { resetAt: number; count: number }>();

  constructor(
    private readonly presenceService: PresenceService,
    private readonly configService: ConfigService,
  ) { }

  private nowIso() {
    return new Date().toISOString();
  }

  private getUserIdOrThrow(client: Socket): string {
    const userId = this.socketUsers.get(client.id);
    if (!userId) throw new Error('unauthorized_socket');
    return userId;
  }

  private makeMessageId(): string {
    // Evitamos dependencia extra; suficiente para deduplicación en cliente (si se usa).
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private async isSocketInRoom(client: Socket, room: string): Promise<boolean> {
    // Socket.IO v4: rooms es Set<string>
    return client.rooms?.has(room) ?? false;
  }

  private presenceWatchRoom() {
    return 'presence:watch';
  }

  private isAdminUser(userId: string): boolean {
    const admins = this.configService.get<string[]>('auth.adminUserIds') ?? [];
    return admins.includes(userId);
  }

  private getWsRateLimitConfig() {
    const max = this.configService.get<number>('ws.rateLimit.max') ?? 60;
    const windowMs = this.configService.get<number>('ws.rateLimit.windowMs') ?? 10000;
    const broadcastMax = this.configService.get<number>('ws.rateLimit.broadcastMax') ?? 5;
    return { max, windowMs, broadcastMax };
  }

  private consumeRateLimit(client: Socket, eventName: string): boolean {
    const { max, windowMs, broadcastMax } = this.getWsRateLimitConfig();
    const limit = eventName === 'broadcast:emit' ? broadcastMax : max;
    if (limit <= 0 || windowMs <= 0) return true;

    const key = `${client.id}:${eventName}`;
    const now = Date.now();
    const cur = this.rl.get(key);
    if (!cur || now >= cur.resetAt) {
      this.rl.set(key, { resetAt: now + windowMs, count: 1 });
      return true;
    }
    cur.count += 1;
    return cur.count <= limit;
  }

  private validateClientEmitEventName(event: string): boolean {
    if (!/^[a-zA-Z0-9:_-]{1,64}$/.test(event)) return false;
    if (event.startsWith('presence:')) return false;
    if (event.startsWith('admin:')) return false;

    const allow = this.configService.get<string[]>('ws.allowedClientEmitEvents') ?? [];
    if (allow.length) return allow.includes(event);
    return true;
  }

  private isPayloadWithinLimit(payload: unknown): boolean {
    const maxBytes = this.configService.get<number>('ws.payloadMaxBytes') ?? 65536;
    if (maxBytes <= 0) return true;
    try {
      const raw = JSON.stringify(payload);
      return Buffer.byteLength(raw, 'utf8') <= maxBytes;
    } catch {
      return false;
    }
  }

  private startPresenceSweeper() {
    if (this.presenceSweepTimer) return;
    if (PRESENCE_SWEEP_INTERVAL_MS <= 0) return;

    this.presenceSweepTimer = setInterval(async () => {
      try {
        const acquired = await this.presenceService.tryAcquireSweeperLock();
        if (!acquired) return;

        // Sweeper robusto: zset por lastSeen (y fallback al modo antiguo)
        const offlineUsers = await this.presenceService.cleanupExpiredUsersByLastSeenZset(200);
        if (!offlineUsers.length) return;

        const ts = this.nowIso();
        for (const userId of offlineUsers) {
          const presenceVersion = await this.presenceService.bumpPresenceVersion(userId);
          // Emitir solo a clientes suscritos a presencia (evita fanout global).
          this.server.to(this.presenceWatchRoom()).emit('presence:user_offline', {
            userId,
            ts,
            reason: 'ttl',
            presenceVersion,
          });

          // Evento de monitoring (watchers) (alias)
          this.server.to(this.presenceWatchRoom()).emit('presence:user_disconnected', {
            userId,
            ts,
            reason: 'ttl',
            presenceVersion,
          });
        }
      } catch (e: any) {
        this.logger.warn(`Presence sweeper failed: ${e?.message || e}`);
      }
    }, PRESENCE_SWEEP_INTERVAL_MS);

    // No bloquear cierre de proceso / tests
    (this.presenceSweepTimer as any)?.unref?.();
  }

  async afterInit(server: Server): Promise<void> {
    // Sweeper de presencia (independiente del adapter)
    this.startPresenceSweeper();

    if (!REDIS_ADAPTER_ENABLED) {
      this.logger.log('Socket.IO Redis adapter disabled (SOCKET_REDIS_ADAPTER_ENABLED!=true)');
      return;
    }

    try {
      const host = process.env.REDIS_HOST || 'localhost';
      const port = process.env.REDIS_PORT || '6379';
      const password = process.env.REDIS_PASSWORD || undefined;

      const url = `redis://${host}:${port}`;
      const pubClient = createClient({ url, password });
      const subClient = pubClient.duplicate();

      pubClient.on('error', (err) => this.logger.error('Redis Pub Client Error', err));
      subClient.on('error', (err) => this.logger.error('Redis Sub Client Error', err));

      pubClient.on('connect', () => this.logger.log('Redis Pub Client connected'));
      subClient.on('connect', () => this.logger.log('Redis Sub Client connected'));

      await Promise.all([pubClient.connect(), subClient.connect()]);

      server.adapter(createAdapter(pubClient, subClient));
      this.logger.log('Socket.IO Redis adapter initialized successfully');
    } catch (error: any) {
      this.logger.error('Failed to initialize Redis adapter', error?.stack || error);
      throw error;
    }
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const userId = this.extractUserId(client);

      if (!userId) {
        this.logger.warn(`Connection rejected: missing userId for socket ${client.id}`);
        client.disconnect(true);
        return;
      }

      this.registerUserSocket(userId, client.id);
      await client.join(`user:${userId}`);

      const sectionId = this.extractSectionId(client);
      if (sectionId) {
        await client.join(this.sectionRoom(sectionId));
        this.socketSection.set(client.id, sectionId);

        // Notificar a la sección (para que UIs en esa room actualicen miembros)
        this.server.to(this.sectionRoom(sectionId)).emit('presence:section_user_joined', {
          userId,
          socketId: client.id,
          sectionId,
          ts: this.nowIso(),
          reason: 'connect',
        });
      }

      const { becameOnline } = await this.presenceService.onConnect({
        userId,
        socketId: client.id,
        sectionId: sectionId || undefined,
      });

      // Evento para UIs suscritas a presencia (solo cuando pasa a online)
      if (becameOnline) {
        const presenceVersion = await this.presenceService.bumpPresenceVersion(userId);
        this.server.to(this.presenceWatchRoom()).emit('presence:user_online', {
          userId,
          socketId: client.id,
          sectionId: sectionId || undefined,
          ts: this.nowIso(),
          presenceVersion,
        });
      }

      // Notificar a clientes "watchers" (monitoring)
      this.server.to(this.presenceWatchRoom()).emit('presence:user_connected', {
        userId,
        socketId: client.id,
        sectionId: sectionId || undefined,
        ts: this.nowIso(),
      });

      client.emit('connected', {
        socketId: client.id,
        userId,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `User ${userId} connected with socket ${client.id} (Total sockets: ${this.userSockets.get(userId)?.size})`,
      );
    } catch (error: any) {
      this.logger.error(`Error handling connection: ${error.message}`, error.stack);
      client.disconnect(true);
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const userId = this.socketUsers.get(client.id);
      if (!userId) return;

      this.unregisterUserSocket(userId, client.id);
      const { becameOffline, sectionId, chatIds } = await this.presenceService.onDisconnect(client.id);
      const remainingSockets = this.userSockets.get(userId)?.size || 0;

      // Notificar a rooms específicas (sección y chats) para que clientes en esas rooms actualicen presencia
      const ts = this.nowIso();
      if (sectionId) {
        this.server.to(this.sectionRoom(sectionId)).emit('presence:section_user_left', {
          userId,
          socketId: client.id,
          sectionId,
          ts,
          reason: 'disconnect',
        });
      }
      for (const chatId of chatIds || []) {
        this.server.to(this.chatRoom(chatId)).emit('presence:chat_user_left', {
          userId,
          socketId: client.id,
          chatId,
          ts,
          reason: 'disconnect',
        });
      }
      this.socketSection.delete(client.id);

      // Evento para UIs suscritas a presencia (solo cuando el usuario ya no tiene sockets)
      if (becameOffline) {
        const presenceVersion = await this.presenceService.bumpPresenceVersion(userId);
        this.server.to(this.presenceWatchRoom()).emit('presence:user_offline', {
          userId,
          socketId: client.id,
          ts: this.nowIso(),
          reason: 'disconnect',
          presenceVersion,
        });
      }

      this.server.to(this.presenceWatchRoom()).emit('presence:user_disconnected', {
        userId,
        socketId: client.id,
        ts: this.nowIso(),
        ...(becameOffline
          ? { reason: 'disconnect', presenceVersion: await this.presenceService.getPresenceVersion(userId) }
          : {}),
      });
      this.logger.log(
        `User ${userId} disconnected socket ${client.id} (Remaining sockets: ${remainingSockets})`,
      );
    } catch (error: any) {
      this.logger.error(`Error handling disconnect: ${error.message}`, error.stack);
    }
  }

  disconnectUser(userId: string, close: boolean = true): void {
    this.server.in(`user:${userId}`).disconnectSockets(close);
  }

  onModuleDestroy() {
    if (this.presenceSweepTimer) {
      clearInterval(this.presenceSweepTimer);
      this.presenceSweepTimer = undefined;
    }
  }

  sendToUser(userId: string, event: string, data: any): void {
    this.server.to(`user:${userId}`).emit(event, data);
    this.logger.debug(`Sent event "${event}" to user ${userId}`);
  }

  sendToUsers(userIds: string[], event: string, data: any): void {
    const rooms = userIds.map((id) => `user:${id}`);
    this.server.to(rooms).emit(event, data);
    this.logger.debug(`Sent event "${event}" to ${userIds.length} users`);
  }

  broadcast(event: string, data: any): void {
    this.server.emit(event, data);
    this.logger.debug(`Broadcast event "${event}" to all users`);
  }

  sendToSection(sectionId: string, event: string, data: any): void {
    this.server.to(this.sectionRoom(sectionId)).emit(event, data);
    this.logger.debug(`Sent event "${event}" to section ${sectionId}`);
  }

  sendToChat(chatId: string, event: string, data: any): void {
    this.server.to(this.chatRoom(chatId)).emit(event, data);
    this.logger.debug(`Sent event "${event}" to chat ${chatId}`);
  }

  isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId) && (this.userSockets.get(userId)?.size || 0) > 0;
  }

  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  getConnectedUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  private extractUserId(client: Socket): string | null {
    const required = this.configService.get<boolean>('auth.required') ?? true;

    const rawToken = (client.handshake as any)?.auth?.token;
    const token = extractBearerToken(rawToken);

    // Si auth es requerida, NO confiamos en query params.
    if (required) {
      if (!token) return null;
      const secret = this.configService.get<string>('auth.jwt.secret') || '';
      const issuer = this.configService.get<string | undefined>('auth.jwt.issuer');
      const audience = this.configService.get<string | undefined>('auth.jwt.audience');
      try {
        const payload = verifyJwtHs256(token, secret, { issuer, audience });
        return getUserIdFromJwtPayload(payload);
      } catch {
        return null;
      }
    }

    // Modo dev: permitimos query userId (demo), pero si hay token válido lo preferimos.
    if (token) {
      const secret = this.configService.get<string>('auth.jwt.secret') || '';
      if (secret) {
        try {
          const payload = verifyJwtHs256(token, secret);
          const uid = getUserIdFromJwtPayload(payload);
          if (uid) return uid;
        } catch {
          // ignorar en dev
        }
      }
    }

    const userId = (client.handshake.query as any)?.userId;
    if (typeof userId === 'string' && userId.trim()) return userId.trim();
    return null;
  }

  private extractSectionId(client: Socket): string | null {
    const sectionId = (client.handshake.query as any)?.sectionId;
    if (typeof sectionId === 'string' && sectionId.trim()) {
      return sectionId.trim();
    }
    return null;
  }

  private sectionRoom(sectionId: string) {
    return `section:${sectionId}`;
  }

  private chatRoom(chatId: string) {
    return `chat:${chatId}`;
  }

  @SubscribeMessage('presence:setSection')
  async setSection(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sectionId: string },
  ) {
    const sectionId = body?.sectionId?.trim?.() ? body.sectionId.trim() : '';
    if (!sectionId) return { ok: false, error: 'missing_sectionId' };

    const prev = this.socketSection.get(client.id);
    if (prev && prev !== sectionId) {
      await client.leave(this.sectionRoom(prev));

      // Notificar a la sección anterior que este usuario salió
      const userId = this.socketUsers.get(client.id);
      if (userId) {
        this.server.to(this.sectionRoom(prev)).emit('presence:section_user_left', {
          userId,
          socketId: client.id,
          sectionId: prev,
          ts: this.nowIso(),
          reason: 'section_change',
        });
      }
    }

    await client.join(this.sectionRoom(sectionId));
    this.socketSection.set(client.id, sectionId);

    // Notificar a la nueva sección que este usuario entró
    const userId = this.socketUsers.get(client.id);
    if (userId) {
      this.server.to(this.sectionRoom(sectionId)).emit('presence:section_user_joined', {
        userId,
        socketId: client.id,
        sectionId,
        ts: this.nowIso(),
        reason: 'section_change',
      });
    }

    try {
      const { previousSectionId } = await this.presenceService.setSection({
        socketId: client.id,
        sectionId,
      });
      // renovar TTL/lastSeen
      await this.presenceService.heartbeat({ socketId: client.id, sectionId });
      return { ok: true, previousSectionId: previousSectionId || prev, sectionId };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'set_section_failed' };
    }
  }

  /**
   * Heartbeat recomendado desde frontend (ej. cada 15-30s).
   * Mantiene presencia correcta en caso de cierres abruptos / caídas de internet.
   */
  @SubscribeMessage('presence:heartbeat')
  async presenceHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sectionId?: string },
  ) {
    const sectionId =
      (body?.sectionId?.trim?.() ? body.sectionId.trim() : '') ||
      (this.socketSection.get(client.id) || undefined);
    try {
      await this.presenceService.heartbeat({ socketId: client.id, sectionId });
      return { ok: true, ts: this.nowIso() };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'heartbeat_failed' };
    }
  }

  @SubscribeMessage('chat:join')
  async joinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { chatId: string },
  ) {
    const chatId = body?.chatId?.trim?.() ? body.chatId.trim() : '';
    if (!chatId) return { ok: false, error: 'missing_chatId' };
    const room = this.chatRoom(chatId);
    await client.join(room);
    try {
      await this.presenceService.chatJoin({ socketId: client.id, chatId });
    } catch (e: any) {
      this.logger.warn(`chatJoin failed socket=${client.id} chat=${chatId}: ${e?.message || e}`);
    }
    const fromUserId = this.socketUsers.get(client.id);
    if (fromUserId) {
      // Notificar a miembros del chat (sin echo)
      client.to(room).emit('presence:chat_user_joined', {
        userId: fromUserId,
        socketId: client.id,
        chatId,
        ts: this.nowIso(),
        reason: 'chat_join',
      });

      this.server.to(this.presenceWatchRoom()).emit('presence:chat_joined', {
        userId: fromUserId,
        socketId: client.id,
        chatId,
        ts: this.nowIso(),
      });
    }
    return { ok: true, chatId };
  }

  @SubscribeMessage('chat:leave')
  async leaveChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { chatId: string },
  ) {
    const chatId = body?.chatId?.trim?.() ? body.chatId.trim() : '';
    if (!chatId) return { ok: false, error: 'missing_chatId' };
    const room = this.chatRoom(chatId);
    await client.leave(room);
    try {
      await this.presenceService.chatLeave({ socketId: client.id, chatId });
    } catch (e: any) {
      this.logger.warn(`chatLeave failed socket=${client.id} chat=${chatId}: ${e?.message || e}`);
    }
    const fromUserId = this.socketUsers.get(client.id);
    if (fromUserId) {
      // Notificar a miembros del chat (no-echo; el emisor ya salió de la room)
      this.server.to(room).emit('presence:chat_user_left', {
        userId: fromUserId,
        socketId: client.id,
        chatId,
        ts: this.nowIso(),
        reason: 'chat_leave',
      });

      this.server.to(this.presenceWatchRoom()).emit('presence:chat_left', {
        userId: fromUserId,
        socketId: client.id,
        chatId,
        ts: this.nowIso(),
      });
    }
    return { ok: true, chatId };
  }

  /**
   * Suscribirse a eventos de presencia del sistema.
   * Un "cliente admin/monitor" puede recibir:
   * - presence:user_connected
   * - presence:user_disconnected
   * - presence:chat_joined
   * - presence:chat_left
   */
  @SubscribeMessage('presence:subscribe')
  async presenceSubscribe(@ConnectedSocket() client: Socket) {
    const required = this.configService.get<boolean>('auth.required') ?? true;
    if (required) {
      const userId = this.socketUsers.get(client.id);
      if (!userId || !this.isAdminUser(userId)) return { ok: false, error: 'forbidden' };
    }
    await client.join(this.presenceWatchRoom());
    return { ok: true };
  }

  @SubscribeMessage('presence:unsubscribe')
  async presenceUnsubscribe(@ConnectedSocket() client: Socket) {
    await client.leave(this.presenceWatchRoom());
    return { ok: true };
  }

  /**
   * Política A (recomendada): el emisor NO recibe echo.
   * - Envia a todos en la room del chat excepto al socket emisor.
   */
  @SubscribeMessage('chat:sendMessage')
  async chatSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { chatId: string; text?: string; data?: any; clientMessageId?: string },
  ) {
    if (!this.consumeRateLimit(client, 'chat:sendMessage')) {
      return { ok: false, error: 'rate_limited' };
    }
    if (!this.isPayloadWithinLimit(body?.data ?? body?.text ?? '')) {
      return { ok: false, error: 'payload_too_large' };
    }

    const chatId = body?.chatId?.trim?.() ? body.chatId.trim() : '';
    if (!chatId) return { ok: false, error: 'missing_chatId' };

    const room = this.chatRoom(chatId);
    const inRoom = await this.isSocketInRoom(client, room);
    if (!inRoom) return { ok: false, error: 'not_in_chat_room' };

    const fromUserId = this.getUserIdOrThrow(client);
    const messageId = this.makeMessageId();
    const payload = {
      messageId,
      clientMessageId: body?.clientMessageId,
      fromUserId,
      chatId,
      ts: this.nowIso(),
      data: body?.data ?? { text: body?.text ?? '' },
    };

    // no-echo: excluir emisor
    client.to(room).emit('chat_message', payload);
    return { ok: true, messageId, ts: payload.ts };
  }

  /**
   * Emitir a la sección actual del emisor (o a una sección específica),
   * excluyendo al socket emisor (Política A).
   */
  @SubscribeMessage('section:emit')
  async sectionEmit(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sectionId?: string; event: string; data: any },
  ) {
    if (!this.consumeRateLimit(client, 'section:emit')) {
      return { ok: false, error: 'rate_limited' };
    }
    const event = body?.event?.trim?.() ? body.event.trim() : '';
    if (!event) return { ok: false, error: 'missing_event' };
    if (!this.validateClientEmitEventName(event)) return { ok: false, error: 'invalid_event' };
    if (!this.isPayloadWithinLimit(body?.data)) return { ok: false, error: 'payload_too_large' };

    const currentSectionId = this.socketSection.get(client.id) || '';
    const requestedSectionId = body?.sectionId?.trim?.() ? body.sectionId.trim() : '';
    const fromUserId = this.getUserIdOrThrow(client);

    // Por defecto: solo emitir a la sección actual del socket.
    // Solo admins pueden emitir a una sección distinta explícitamente.
    const sectionId = requestedSectionId
      ? requestedSectionId === currentSectionId
        ? requestedSectionId
        : this.isAdminUser(fromUserId)
          ? requestedSectionId
          : currentSectionId
      : currentSectionId;

    if (!sectionId) return { ok: false, error: 'missing_sectionId' };

    const room = this.sectionRoom(sectionId);
    const inRoom = await this.isSocketInRoom(client, room);
    if (!inRoom) return { ok: false, error: 'not_in_section_room' };

    const payload = {
      messageId: this.makeMessageId(),
      fromUserId,
      sectionId,
      ts: this.nowIso(),
      data: body.data,
    };

    client.to(room).emit(event, payload);
    return { ok: true, sectionId, ts: payload.ts };
  }

  /**
   * Broadcast global iniciado por un cliente, excluyendo al emisor (Política A).
   * Útil para "avisos" desde UI admin, etc.
   */
  @SubscribeMessage('broadcast:emit')
  async broadcastEmit(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { event: string; data: any },
  ) {
    if (!this.consumeRateLimit(client, 'broadcast:emit')) {
      return { ok: false, error: 'rate_limited' };
    }
    const event = body?.event?.trim?.() ? body.event.trim() : '';
    if (!event) return { ok: false, error: 'missing_event' };
    if (!this.validateClientEmitEventName(event)) return { ok: false, error: 'invalid_event' };
    if (!this.isPayloadWithinLimit(body?.data)) return { ok: false, error: 'payload_too_large' };

    const fromUserId = this.getUserIdOrThrow(client);
    if (!this.isAdminUser(fromUserId)) return { ok: false, error: 'forbidden' };
    const payload = {
      messageId: this.makeMessageId(),
      fromUserId,
      ts: this.nowIso(),
      data: body.data,
    };

    // no-echo global
    client.broadcast.emit(event, payload);
    return { ok: true, ts: payload.ts };
  }

  /**
   * DM (1:1) iniciado por un cliente:
   * - entrega al destinatario (room user:{toUserId})
   * - NO hace echo al emisor (Política A)
   */
  @SubscribeMessage('dm:send')
  async dmSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { toUserId: string; event?: string; data: any; clientMessageId?: string },
  ) {
    if (!this.consumeRateLimit(client, 'dm:send')) {
      return { ok: false, error: 'rate_limited' };
    }
    if (!this.isPayloadWithinLimit(body?.data)) {
      return { ok: false, error: 'payload_too_large' };
    }
    const toUserId = body?.toUserId?.trim?.() ? body.toUserId.trim() : '';
    if (!toUserId) return { ok: false, error: 'missing_toUserId' };

    const fromUserId = this.getUserIdOrThrow(client);
    const event = body?.event?.trim?.() ? body.event.trim() : 'dm_message';

    const payload = {
      messageId: this.makeMessageId(),
      clientMessageId: body?.clientMessageId,
      fromUserId,
      toUserId,
      ts: this.nowIso(),
      data: body.data,
    };

    // Enviar solo al destinatario, excluyendo al socket emisor por diseño
    client.to(`user:${toUserId}`).emit(event, payload);
    return { ok: true, ts: payload.ts };
  }

  private registerUserSocket(userId: string, socketId: string): void {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
    this.socketUsers.set(socketId, userId);
  }

  private unregisterUserSocket(userId: string, socketId: string): void {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.socketUsers.delete(socketId);
  }
}

