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
import { Logger, UseFilters } from '@nestjs/common';
import { WsExceptionFilter } from '../../common/filters/ws-exception.filter';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { PresenceService } from '../presence/presence.service';

const PING_TIMEOUT = parseInt(process.env.SOCKET_PING_TIMEOUT || '60000', 10);
const PING_INTERVAL = parseInt(process.env.SOCKET_PING_INTERVAL || '25000', 10);
const REDIS_ADAPTER_ENABLED =
  (process.env.SOCKET_REDIS_ADAPTER_ENABLED || '').toLowerCase() === 'true';

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
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  private readonly userSockets = new Map<string, Set<string>>();
  private readonly socketUsers = new Map<string, string>();
  private readonly socketSection = new Map<string, string>(); // socketId -> sectionId (cache local)

  constructor(private readonly presenceService: PresenceService) { }

  async afterInit(server: Server): Promise<void> {
    if (!REDIS_ADAPTER_ENABLED) {
      this.logger.log('Socket.IO Redis adapter disabled (SOCKET_REDIS_ADAPTER_ENABLED!=true)');
      return;
    }

    try {
      const redisUrl = process.env.REDIS_URL;
      const tlsEnabled =
        (process.env.REDIS_TLS || '').toLowerCase() === 'true' ||
        (redisUrl || '').toLowerCase().startsWith('rediss://');
      const tlsRejectUnauthorized =
        (process.env.REDIS_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';

      const host = process.env.REDIS_HOST || 'localhost';
      const port = process.env.REDIS_PORT || '6379';
      const password = process.env.REDIS_PASSWORD || undefined;

      const url = redisUrl || `${tlsEnabled ? 'rediss' : 'redis'}://${host}:${port}`;

      const pubClient = createClient({
        url,
        password,
        ...(tlsEnabled ? { socket: { tls: true, rejectUnauthorized: tlsRejectUnauthorized } } : {}),
      });
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
      }

      await this.presenceService.onConnect({
        userId,
        socketId: client.id,
        sectionId: sectionId || undefined,
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

      this.socketSection.delete(client.id);
      this.unregisterUserSocket(userId, client.id);
      await this.presenceService.onDisconnect(client.id);
      const remainingSockets = this.userSockets.get(userId)?.size || 0;
      this.logger.log(
        `User ${userId} disconnected socket ${client.id} (Remaining sockets: ${remainingSockets})`,
      );
    } catch (error: any) {
      this.logger.error(`Error handling disconnect: ${error.message}`, error.stack);
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
    const token = (client.handshake as any)?.auth?.token;
    if (token) {
      // TODO: Validar token y extraer userId
    }

    const userId = (client.handshake.query as any)?.userId;
    if (typeof userId === 'string' && userId.trim()) {
      return userId.trim();
    }
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
    }

    await client.join(this.sectionRoom(sectionId));
    this.socketSection.set(client.id, sectionId);

    try {
      const { previousSectionId } = await this.presenceService.setSection({
        socketId: client.id,
        sectionId,
      });
      return { ok: true, previousSectionId: previousSectionId || prev, sectionId };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'set_section_failed' };
    }
  }

  @SubscribeMessage('chat:join')
  async joinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { chatId: string },
  ) {
    const chatId = body?.chatId?.trim?.() ? body.chatId.trim() : '';
    if (!chatId) return { ok: false, error: 'missing_chatId' };
    await client.join(this.chatRoom(chatId));
    return { ok: true, chatId };
  }

  @SubscribeMessage('chat:leave')
  async leaveChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { chatId: string },
  ) {
    const chatId = body?.chatId?.trim?.() ? body.chatId.trim() : '';
    if (!chatId) return { ok: false, error: 'missing_chatId' };
    await client.leave(this.chatRoom(chatId));
    return { ok: true, chatId };
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

