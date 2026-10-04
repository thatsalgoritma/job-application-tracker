import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';

export interface UserSettings {
  emailDigestEnabled: boolean;
  followUpDays: number;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string): Promise<UserSettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailDigestEnabled: true, followUpDays: true },
    });
    if (!user) throw new NotFoundException('User account no longer exists');
    return user;
  }

  async updateSettings(
    userId: string,
    settings: UpdateUserSettingsDto,
  ): Promise<UserSettings> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: settings,
        select: { emailDigestEnabled: true, followUpDays: true },
      });
    } catch (error: unknown) {
      if (isMissingRecord(error)) {
        throw new NotFoundException('User account no longer exists');
      }
      throw error;
    }
  }
}

function isMissingRecord(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2025'
  );
}
