import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { NotificationController } from '../src/modules/notification/notification.controller';
import { NotificationService } from '../src/modules/notification/notification.service';
import { AuthGuard } from '../src/common/guards/auth.guard';

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let service: {
    sendToUser: jest.Mock;
    sendToUsers: jest.Mock;
    sendBulkNotifications: jest.Mock;
    broadcast: jest.Mock;
    sendToSection: jest.Mock;
    sendToChat: jest.Mock;
    getQueueStats: jest.Mock;
    cleanQueue: jest.Mock;
  };

  beforeAll(async () => {
    service = {
      sendToUser: jest.fn(),
      sendToUsers: jest.fn(),
      sendBulkNotifications: jest.fn().mockResolvedValue(2),
      broadcast: jest.fn(),
      sendToSection: jest.fn(),
      sendToChat: jest.fn(),
      getQueueStats: jest.fn().mockResolvedValue({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: false,
      }),
      cleanQueue: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        {
          provide: NotificationService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /notifications/send returns 202', async () => {
    await request(app.getHttpServer())
      .post('/notifications/send')
      .send({ userId: 'user123', event: 'new_message', data: { message: 'hi' } })
      .expect(202);
  });

  it('GET /notifications/stats returns 200', async () => {
    await request(app.getHttpServer()).get('/notifications/stats').expect(200);
  });

  it('POST /notifications/send-section returns 202 and calls service', async () => {
    await request(app.getHttpServer())
      .post('/notifications/send-section')
      .send({ sectionId: 'home', event: 'section_ping', data: { message: 'hi' } })
      .expect(202);

    expect(service.sendToSection).toHaveBeenCalledWith(
      'home',
      'section_ping',
      { message: 'hi' },
      expect.any(Object),
    );
  });

  it('POST /notifications/send-chat returns 202 and calls service', async () => {
    await request(app.getHttpServer())
      .post('/notifications/send-chat')
      .send({ chatId: 'room-1', event: 'chat_message', data: { text: 'hi' } })
      .expect(202);

    expect(service.sendToChat).toHaveBeenCalledWith(
      'room-1',
      'chat_message',
      { text: 'hi' },
      expect.any(Object),
    );
  });
});

