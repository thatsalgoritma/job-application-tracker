import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ListApplicationsQueryDto } from './list-applications-query.dto';

export enum ApplicationExportFormat {
  CSV = 'csv',
  JSON = 'json',
}

export class ExportApplicationsQueryDto extends ListApplicationsQueryDto {
  @ApiPropertyOptional({ enum: ApplicationExportFormat, default: 'csv' })
  @IsOptional()
  @IsEnum(ApplicationExportFormat)
  format: ApplicationExportFormat = ApplicationExportFormat.CSV;
}
