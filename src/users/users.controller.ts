import {
  Controller,
  Get,
  NotFoundException,
  Patch,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UserSettings, UsersService } from './users.service';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('users')
@Controller('me')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  async getMe(@Req() request: AuthenticatedRequest) {
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, email: true, createdAt: true },
    });

    if (!user) {
      throw new NotFoundException('User account no longer exists');
    }

    return user;
  }

  @Get('settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get email digest preferences' })
  getSettings(@Req() request: AuthenticatedRequest): Promise<UserSettings> {
    return this.usersService.getSettings(request.user.sub);
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update email digest preferences' })
  updateSettings(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateUserSettingsDto,
  ): Promise<UserSettings> {
    return this.usersService.updateSettings(request.user.sub, dto);
  }
}
