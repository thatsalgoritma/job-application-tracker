import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Application, ApplicationStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../auth/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateApplicationDto } from './dto/create-application.dto';
import {
  ApplicationsService,
  ApplicationStats,
  PaginatedApplications,
} from './applications.service';
import { FollowUpQueryDto } from './dto/follow-up-query.dto';
import {
  ApplicationSortBy,
  ListApplicationsQueryDto,
  SortOrder,
} from './dto/list-applications-query.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import {
  ApplicationExportFormat,
  ExportApplicationsQueryDto,
} from './dto/export-applications-query.dto';
import {
  ApplicationTransferService,
  ApplicationImportFile,
  ImportReport,
  MAX_IMPORT_FILE_BYTES,
} from './application-transfer.service';

@ApiTags('applications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'A valid access token is required' })
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly transferService: ApplicationTransferService,
  ) {}

  @Get('export')
  @ApiOperation({ summary: 'Export the current user’s filtered applications' })
  @ApiProduces('text/csv', 'application/json')
  @ApiQuery({ name: 'format', enum: ApplicationExportFormat, required: false })
  @ApiQuery({ name: 'status', enum: ApplicationStatus, required: false })
  @ApiQuery({ name: 'company', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'appliedFrom', required: false, type: String })
  @ApiQuery({ name: 'appliedTo', required: false, type: String })
  async export(
    @Req() request: AuthenticatedRequest,
    @Query() query: ExportApplicationsQueryDto,
  ): Promise<StreamableFile> {
    const result = this.transferService.export(request.user.sub, query);
    return new StreamableFile(result.stream, {
      type: result.contentType,
      disposition: `attachment; filename="${result.filename}"`,
    });
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMPORT_FILE_BYTES },
      fileFilter: (_request, file, callback) => {
        const allowedTypes = [
          'text/csv',
          'application/csv',
          'application/json',
        ];
        if (!allowedTypes.includes(file.mimetype.toLowerCase())) {
          callback(
            new BadRequestException(
              'Only CSV and JSON files with an expected content type are accepted',
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Import applications from a CSV or JSON file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiQuery({
    name: 'dryRun',
    required: false,
    type: Boolean,
    description: 'Preview the import without writing to the database',
  })
  @ApiOkResponse({
    description: 'Per-row import result and created/skipped/failed counts',
  })
  @ApiBadRequestResponse({ description: 'Invalid file, row, or query value' })
  async import(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: ApplicationImportFile | undefined,
    @Query('dryRun') dryRunQuery?: string,
  ): Promise<ImportReport> {
    if (dryRunQuery !== undefined && !['true', 'false'].includes(dryRunQuery)) {
      throw new BadRequestException('dryRun must be true or false');
    }
    return this.transferService.import(
      request.user.sub,
      file,
      file?.mimetype,
      dryRunQuery === 'true',
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create an application for the current user' })
  @ApiCreatedResponse({ description: 'Application created' })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateApplicationDto,
  ): Promise<Application> {
    return this.applicationsService.create(request.user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Filter, search, sort, and page applications' })
  @ApiOkResponse({ description: 'A page of the current user’s applications' })
  @ApiBadRequestResponse({ description: 'Invalid filter or pagination value' })
  @ApiQuery({ name: 'status', required: false, enum: ApplicationStatus })
  @ApiQuery({ name: 'company', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'appliedFrom', required: false, type: String })
  @ApiQuery({ name: 'appliedTo', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, enum: ApplicationSortBy })
  @ApiQuery({ name: 'sortOrder', required: false, enum: SortOrder })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListApplicationsQueryDto,
  ): Promise<PaginatedApplications> {
    return this.applicationsService.findAll(request.user.sub, query);
  }

  @Get('follow-up')
  @ApiOperation({ summary: 'List active applications needing follow-up' })
  @ApiOkResponse({
    description: 'Applications unchanged for the requested days',
  })
  @ApiBadRequestResponse({
    description: 'days must be an integer from 1 to 3650',
  })
  @ApiQuery({
    name: 'days',
    required: true,
    type: Number,
    minimum: 1,
    maximum: 3650,
  })
  findFollowUpNeeded(
    @Req() request: AuthenticatedRequest,
    @Query() query: FollowUpQueryDto,
  ): Promise<Application[]> {
    return this.applicationsService.findFollowUpNeeded(
      request.user.sub,
      query.days,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get status counts and response rate' })
  @ApiOkResponse({ description: 'Application summary statistics' })
  getStats(@Req() request: AuthenticatedRequest): Promise<ApplicationStats> {
    return this.applicationsService.getStats(request.user.sub);
  }

  @Get(':applicationId')
  @ApiOperation({ summary: 'Get one of the current user’s applications' })
  @ApiOkResponse({ description: 'Application details' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ): Promise<Application> {
    return this.applicationsService.findOne(request.user.sub, applicationId);
  }

  @Patch(':applicationId')
  @ApiOperation({ summary: 'Update one of the current user’s applications' })
  @ApiOkResponse({ description: 'Application updated' })
  @ApiBadRequestResponse({ description: 'Invalid input or status transition' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: UpdateApplicationDto,
  ): Promise<Application> {
    return this.applicationsService.update(
      request.user.sub,
      applicationId,
      dto,
    );
  }

  @Delete(':applicationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one of the current user’s applications' })
  @ApiNoContentResponse({ description: 'Application deleted' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ): Promise<void> {
    await this.applicationsService.remove(request.user.sub, applicationId);
  }
}
