import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  IsOptional,
  IsNumber,
  Min,
  Max,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendNotificationDto {
  @ApiProperty({
    description: 'ID del usuario destinatario (room user:{userId})',
    example: 'user123',
  })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({
    description: 'Nombre del evento Socket.IO a emitir',
    example: 'new_message',
  })
  @IsString()
  @IsNotEmpty()
  event!: string;

  @ApiProperty({
    description: 'Payload arbitrario del evento',
    example: { message: 'Hola', from: 'system' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Prioridad Bull (1=alta, 10=baja). Default: 5',
    example: 5,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;
}

export class SendMultipleNotificationsDto {
  @ApiProperty({
    description: 'Lista de usuarios destinatarios (rooms user:{id})',
    example: ['user1', 'user2', 'user3'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  userIds!: string[];

  @ApiProperty({
    description: 'Nombre del evento Socket.IO a emitir',
    example: 'system_announcement',
  })
  @IsString()
  @IsNotEmpty()
  event!: string;

  @ApiProperty({
    description: 'Payload del evento',
    example: { title: 'Maintenance', message: 'Tonight' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Prioridad Bull (1..10). Default: 5',
    example: 5,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;
}

export class BulkNotificationItemDto {
  @ApiProperty({
    description: 'Usuarios destinatarios del item',
    example: ['user1', 'user2'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  userIds!: string[];

  @ApiProperty({
    description: 'Evento Socket.IO a emitir para este item',
    example: 'order_update',
  })
  @IsString()
  @IsNotEmpty()
  event!: string;

  @ApiProperty({
    description: 'Payload del item',
    example: { orderId: '123', status: 'shipped' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Prioridad del item (1..10)',
    example: 4,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;
}

export class BulkNotificationsDto {
  @ApiProperty({
    description: 'Array de notificaciones (cada una con userIds, event y data)',
    type: [BulkNotificationItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkNotificationItemDto)
  notifications!: BulkNotificationItemDto[];
}

export class BroadcastNotificationDto {
  @ApiProperty({
    description: 'Evento Socket.IO a emitir a todos los conectados',
    example: 'system_maintenance',
  })
  @IsString()
  @IsNotEmpty()
  event!: string;

  @ApiProperty({
    description: 'Payload del evento',
    example: { message: 'Sistema en mantenimiento', startTime: '2026-02-01T00:00:00Z' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Prioridad (1..10). Default recomendado: 1 para broadcast.',
    example: 1,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;
}

export class SendSectionNotificationDto {
  @ApiProperty({
    description: 'ID de la sección (room section:{sectionId})',
    example: 'home',
  })
  @IsString()
  @IsNotEmpty()
  sectionId!: string;

  @ApiProperty({
    description: 'Evento Socket.IO a emitir en la sección',
    example: 'section_ping',
  })
  @IsString()
  @IsNotEmpty()
  event!: string;

  @ApiProperty({
    description: 'Payload del evento',
    example: { message: 'Hola sección HOME' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Prioridad (1..10). Default: 4',
    example: 4,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;
}

export class SendChatNotificationDto {
  @ApiProperty({
    description: 'ID del chat (room chat:{chatId})',
    example: 'room-1',
  })
  @IsString()
  @IsNotEmpty()
  chatId!: string;

  @ApiProperty({
    description: 'Evento Socket.IO a emitir en el chat',
    example: 'chat_message',
  })
  @IsString()
  @IsNotEmpty()
  event!: string;

  @ApiProperty({
    description: 'Payload del evento',
    example: { from: 'user123', text: 'hola', ts: '2026-01-30T00:00:00.000Z' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Prioridad (1..10). Default: 4',
    example: 4,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;
}

