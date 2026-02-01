import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io as ioc } from 'socket.io-client';
import { NotificationGateway } from '../src/modules/notification/notification.gateway';
import { PresenceService } from '../src/modules/presence/presence.service';

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('WebSocket no-echo policy (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.SOCKET_REDIS_ADAPTER_ENABLED = 'false';
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationGateway,
        {
          provide: PresenceService,
          useValue: {
            onConnect: jest.fn().mockResolvedValue({ becameOnline: true }),
            onDisconnect: jest.fn().mockResolvedValue({ becameOffline: true }),
            setSection: jest.fn().mockResolvedValue({}),
            heartbeat: jest.fn().mockResolvedValue(undefined),
            cleanupStaleOnlineUsers: jest.fn().mockResolvedValue([]),
            tryAcquireSweeperLock: jest.fn().mockResolvedValue(true),
            cleanupExpiredUsersByLastSeenZset: jest.fn().mockResolvedValue([]),
            bumpPresenceVersion: jest.fn().mockResolvedValue(1),
            getPresenceVersion: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    const server = await app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : addr.port;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('chat:sendMessage sends to others but not sender', async () => {
    const a = ioc(baseUrl, { transports: ['websocket'], query: { userId: 'a' } });
    const b = ioc(baseUrl, { transports: ['websocket'], query: { userId: 'b' } });

    const aReceived: any[] = [];
    const bReceived: any[] = [];

    a.on('chat_message', (p) => aReceived.push(p));
    b.on('chat_message', (p) => bReceived.push(p));

    await new Promise<void>((resolve) => a.on('connected', () => resolve()));
    await new Promise<void>((resolve) => b.on('connected', () => resolve()));

    // join same chat
    await new Promise<void>((resolve) => a.emit('chat:join', { chatId: 'room-1' }, () => resolve()));
    await new Promise<void>((resolve) => b.emit('chat:join', { chatId: 'room-1' }, () => resolve()));

    // sender A sends
    const ack: any = await new Promise((resolve) =>
      a.emit('chat:sendMessage', { chatId: 'room-1', text: 'hola' }, resolve),
    );
    expect(ack.ok).toBe(true);

    await wait(100);
    expect(bReceived.length).toBe(1);
    expect(bReceived[0].data?.text || bReceived[0].data?.message).toBeDefined();
    expect(aReceived.length).toBe(0); // no-echo

    a.close();
    b.close();
  });

  it('dm:send sends only to recipient (no echo)', async () => {
    const a = ioc(baseUrl, { transports: ['websocket'], query: { userId: 'a' } });
    const b = ioc(baseUrl, { transports: ['websocket'], query: { userId: 'b' } });

    const aReceived: any[] = [];
    const bReceived: any[] = [];

    a.on('dm_message', (p) => aReceived.push(p));
    b.on('dm_message', (p) => bReceived.push(p));

    await new Promise<void>((resolve) => a.on('connected', () => resolve()));
    await new Promise<void>((resolve) => b.on('connected', () => resolve()));

    const ack: any = await new Promise((resolve) =>
      a.emit('dm:send', { toUserId: 'b', data: { text: 'hola b' } }, resolve),
    );
    expect(ack.ok).toBe(true);

    await wait(100);
    expect(bReceived.length).toBe(1);
    expect(aReceived.length).toBe(0);

    a.close();
    b.close();
  });

  it('presence:subscribe receives connect/disconnect events', async () => {
    const watcher = ioc(baseUrl, { transports: ['websocket'], query: { userId: 'watcher' } });
    const events: string[] = [];
    watcher.on('presence:user_connected', () => events.push('connected'));
    watcher.on('presence:user_disconnected', () => events.push('disconnected'));

    await new Promise<void>((resolve) => watcher.on('connected', () => resolve()));
    await new Promise<void>((resolve) => watcher.emit('presence:subscribe', {}, () => resolve()));

    const user = ioc(baseUrl, { transports: ['websocket'], query: { userId: 'u1' } });
    await new Promise<void>((resolve) => user.on('connected', () => resolve()));
    user.close();

    // watcher debería ver connect (y puede ver disconnect según timing)
    await wait(150);
    expect(events.includes('connected')).toBe(true);

    watcher.close();
  });

  it('presence:user_offline is emitted to others on disconnect', async () => {
    const a = ioc(baseUrl, { transports: ['websocket'], query: { userId: 'a' } });
    const b = ioc(baseUrl, { transports: ['websocket'], query: { userId: 'b' } });

    const offlineEvents: any[] = [];
    b.on('presence:user_offline', (p) => offlineEvents.push(p));

    await new Promise<void>((resolve) => a.on('connected', () => resolve()));
    await new Promise<void>((resolve) => b.on('connected', () => resolve()));

    a.close();
    await wait(150);

    expect(offlineEvents.some((e) => e?.userId === 'a')).toBe(true);

    b.close();
  });
});

