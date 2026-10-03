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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Interview } from '@prisma/client';
import { AuthenticatedRequest } from '../auth/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { UpdateInterviewDto } from './dto/update-interview.dto';
import { InterviewsService } from './interviews.service';

@ApiTags('interviews')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'A valid access token is required' })
@UseGuards(JwtAuthGuard)
@Controller('applications/:applicationId/interviews')
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post()
  @ApiOperation({ summary: 'Schedule an interview for an owned application' })
  @ApiCreatedResponse({ description: 'Interview created' })
  @ApiBadRequestResponse({ description: 'Invalid interview data' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  create(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: CreateInterviewDto,
  ): Promise<Interview> {
    return this.interviewsService.create(request.user.sub, applicationId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List interviews for an owned application' })
  @ApiOkResponse({ description: 'The application’s interviews' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ): Promise<Interview[]> {
    return this.interviewsService.findAll(request.user.sub, applicationId);
  }

  @Get(':interviewId')
  @ApiOperation({ summary: 'Get one interview for an owned application' })
  @ApiOkResponse({ description: 'Interview details' })
  @ApiNotFoundResponse({ description: 'Interview or application not found' })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('interviewId', ParseUUIDPipe) interviewId: string,
  ): Promise<Interview> {
    return this.interviewsService.findOne(
      request.user.sub,
      applicationId,
      interviewId,
    );
  }

  @Patch(':interviewId')
  @ApiOperation({ summary: 'Update one interview for an owned application' })
  @ApiOkResponse({ description: 'Interview updated' })
  @ApiBadRequestResponse({ description: 'Invalid interview data' })
  @ApiNotFoundResponse({ description: 'Interview or application not found' })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('interviewId', ParseUUIDPipe) interviewId: string,
    @Body() dto: UpdateInterviewDto,
  ): Promise<Interview> {
    return this.interviewsService.update(
      request.user.sub,
      applicationId,
      interviewId,
      dto,
    );
  }

  @Delete(':interviewId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one interview for an owned application' })
  @ApiNoContentResponse({ description: 'Interview deleted' })
  @ApiNotFoundResponse({ description: 'Interview or application not found' })
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('interviewId', ParseUUIDPipe) interviewId: string,
  ): Promise<void> {
    await this.interviewsService.remove(
      request.user.sub,
      applicationId,
      interviewId,
    );
  }
}
