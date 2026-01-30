import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const makeService = () => {
    const mockQueue = {
      add: jest.fn(),
      addBulk: jest.fn(),
      getWaitingCount: jest.fn().mockResolvedValue(1),
      getActiveCount: jest.fn().mockResolvedValue(2),
      getCompletedCount: jest.fn().mockResolvedValue(3),
      getFailedCount: jest.fn().mockResolvedValue(4),
      getDelayedCount: jest.fn().mockResolvedValue(5),
      isPaused: jest.fn().mockResolvedValue(false),
      clean: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
    };

    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'bull.maxAttempts') return 3;
        if (key === 'bull.backoffDelay') return 2000;
        return undefined;
      }),
    };

    const service = new NotificationService(
      mockConfig as any,
      mockQueue as any,
    );

    return { service, mockQueue, mockConfig };
  };

  it('should queue notification for single user', async () => {
    const { service, mockQueue } = makeService();

    await service.sendToUser('user123', 'test-event', { a: 1 });

    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-notification',
      expect.objectContaining({
        type: 'single',
        userId: 'user123',
        event: 'test-event',
      }),
      expect.any(Object),
    );
  });

  it('should batch sendToUsers into addBulk for large lists', async () => {
    const { service, mockQueue } = makeService();
    const userIds = Array.from({ length: 250 }, (_, i) => `u${i}`);

    await service.sendToUsers(userIds, 'evt', { ok: true });

    expect(mockQueue.addBulk).toHaveBeenCalledTimes(1);
    const jobs = mockQueue.addBulk.mock.calls[0][0];
    expect(jobs).toHaveLength(3); // 100 + 100 + 50
  });

  it('should return queue stats', async () => {
    const { service } = makeService();
    const stats = await service.getQueueStats();
    expect(stats).toEqual({
      waiting: 1,
      active: 2,
      completed: 3,
      failed: 4,
      delayed: 5,
      paused: false,
    });
  });

  it('should queue notification for a section', async () => {
    const { service, mockQueue } = makeService();

    await service.sendToSection('home', 'section_ping', { ok: true }, { priority: 4 });

    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-notification',
      expect.objectContaining({
        type: 'section',
        sectionId: 'home',
        event: 'section_ping',
      }),
      expect.any(Object),
    );
  });

  it('should queue notification for a chat', async () => {
    const { service, mockQueue } = makeService();

    await service.sendToChat('room-1', 'chat_message', { text: 'hi' }, { priority: 4 });

    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-notification',
      expect.objectContaining({
        type: 'chat',
        chatId: 'room-1',
        event: 'chat_message',
      }),
      expect.any(Object),
    );
  });
});

