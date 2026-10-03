import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterviewType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateInterviewDto {
  @ApiProperty({ enum: InterviewType, example: InterviewType.TECHNICAL })
  @IsEnum(InterviewType)
  type!: InterviewType;

  @ApiProperty({ format: 'date-time', example: '2026-11-15T13:00:00.000Z' })
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  outcome?: string;
}
