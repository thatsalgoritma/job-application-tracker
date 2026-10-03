import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class FollowUpQueryDto {
  @ApiProperty({ minimum: 1, maximum: 3650, example: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  days!: number;
}
