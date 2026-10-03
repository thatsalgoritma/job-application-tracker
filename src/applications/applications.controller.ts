import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
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

@ApiTags('applications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'A valid access token is required' })
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

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
