import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DigestRunResult, DigestsService } from './digests.service';

@ApiTags('email digests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('digests')
export class DigestsController {
  constructor(private readonly digestsService: DigestsService) {}

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger the authenticated user’s digest for testing',
  })
  trigger(@Req() request: AuthenticatedRequest): Promise<DigestRunResult> {
    return this.digestsService.triggerForUser(request.user.sub);
  }
}
