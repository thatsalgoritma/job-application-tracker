import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateUserSettingsDto {
  @ApiPropertyOptional({
    description: 'Whether the weekly email digest is enabled',
  })
  @IsOptional()
  @IsBoolean()
  emailDigestEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  followUpDays?: number;
}
