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

export class SendNotificationDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  event!: string;

  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;
}

export class SendMultipleNotificationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  userIds!: string[];

  @IsString()
  @IsNotEmpty()
  event!: string;

  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;
}

export class BulkNotificationItemDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  userIds!: string[];

  @IsString()
  @IsNotEmpty()
  event!: string;

  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;
}

export class BulkNotificationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkNotificationItemDto)
  notifications!: BulkNotificationItemDto[];
}

export class BroadcastNotificationDto {
  @IsString()
  @IsNotEmpty()
  event!: string;

  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;
}

export class SendSectionNotificationDto {
  @IsString()
  @IsNotEmpty()
  sectionId!: string;

  @IsString()
  @IsNotEmpty()
  event!: string;

  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;
}

export class SendChatNotificationDto {
  @IsString()
  @IsNotEmpty()
  chatId!: string;

  @IsString()
  @IsNotEmpty()
  event!: string;

  @IsObject()
  @IsNotEmpty()
  data!: Record<string, any>;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;
}

