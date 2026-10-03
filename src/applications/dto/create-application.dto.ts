import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateApplicationDto {
  @ApiProperty({ maxLength: 200, example: 'Acme Corp' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  company!: string;

  @ApiProperty({ maxLength: 200, example: 'Backend Engineer' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  position!: string;

  @ApiPropertyOptional({ example: 'https://jobs.example.com/role/123' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  jobUrl?: string;

  @ApiPropertyOptional({ maxLength: 200, example: 'Istanbul, Türkiye' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ maxLength: 100, example: 'Company website' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  appliedAt?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
