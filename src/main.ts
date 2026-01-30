import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

function getNestLoggerLevels(): Array<'log' | 'error' | 'warn' | 'debug' | 'verbose'> {
  const level = (process.env.LOG_LEVEL || 'debug').toLowerCase();

  // Mapeo simple:
  // - error: solo errores
  // - warn: warn+error
  // - info/log: log+warn+error
  // - debug: log+warn+error+debug
  // - verbose/trace: todo (incluye verbose)
  switch (level) {
    case 'error':
      return ['error'];
    case 'warn':
      return ['error', 'warn'];
    case 'info':
    case 'log':
      return ['error', 'warn', 'log'];
    case 'verbose':
    case 'trace':
      return ['error', 'warn', 'log', 'debug', 'verbose'];
    case 'debug':
    default:
      return ['error', 'warn', 'log', 'debug'];
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: getNestLoggerLevels(),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  const swaggerEnabled =
    (process.env.SWAGGER_ENABLED || 'true').toLowerCase() === 'true';

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('SocketOi API')
      .setDescription('API para notificaciones, presencia, métricas y administración de cola.')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
    logger.log('Swagger enabled at: /docs');
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();

