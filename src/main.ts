import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
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

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();

