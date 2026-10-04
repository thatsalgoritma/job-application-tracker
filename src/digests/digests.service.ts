import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  buildDigestEmail,
  DigestEmailData,
  FollowUpItem,
  UpcomingInterviewItem,
} from './digest-email-template';

export interface DigestRunResult {
  sent: boolean;
  reason?: 'disabled' | 'nothing-to-report' | 'already-sent';
}

const ACTIVE_STATUSES = [
  ApplicationStatus.APPLIED,
  ApplicationStatus.SCREENING,
  ApplicationStatus.INTERVIEW,
];

@Injectable()
export class DigestsService {
  private readonly logger = new Logger(DigestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async sendWeeklyDigests(now = new Date()): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { emailDigestEnabled: true },
      select: { id: true },
    });

    for (const user of users) {
      try {
        await this.sendDigestForUser(user.id, now);
      } catch (error: unknown) {
        this.logger.error(`Weekly digest failed for user ${user.id}`, error);
      }
    }
  }

  async triggerForUser(userId: string): Promise<DigestRunResult> {
    return this.sendDigestForUser(userId, new Date());
  }

  private async sendDigestForUser(
    userId: string,
    now: Date,
  ): Promise<DigestRunResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailDigestEnabled: true,
        followUpDays: true,
      },
    });
    if (!user) throw new NotFoundException('User account no longer exists');
    if (!user.emailDigestEnabled) return { sent: false, reason: 'disabled' };

    const data = await this.buildDigestData(user.id, user.followUpDays, now);
    if (data.followUps.length === 0 && data.upcomingInterviews.length === 0) {
      return { sent: false, reason: 'nothing-to-report' };
    }

    const periodStart = getUtcWeekStart(now);
    try {
      await this.prisma.digestLog.create({
        data: { userId: user.id, periodStart },
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        return { sent: false, reason: 'already-sent' };
      }
      throw error;
    }

    try {
      await this.mailService.send({
        to: user.email,
        ...buildDigestEmail(data),
      });
    } catch (error: unknown) {
      try {
        await this.prisma.digestLog.delete({
          where: { userId_periodStart: { userId: user.id, periodStart } },
        });
      } catch (cleanupError: unknown) {
        this.logger.error(
          `Could not release digest reservation for user ${user.id}`,
          cleanupError,
        );
      }
      throw error;
    }

    await this.prisma.digestLog.update({
      where: { userId_periodStart: { userId: user.id, periodStart } },
      data: { sentAt: new Date() },
    });
    return { sent: true };
  }

  private async buildDigestData(
    userId: string,
    followUpDays: number,
    now: Date,
  ): Promise<DigestEmailData> {
    const cutoff = new Date(now.getTime() - followUpDays * 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [followUps, groups, upcoming] = await Promise.all([
      this.prisma.application.findMany({
        where: {
          userId,
          status: { in: ACTIVE_STATUSES },
          statusChangedAt: { lte: cutoff },
        },
        orderBy: { statusChangedAt: 'asc' },
        select: {
          company: true,
          position: true,
          status: true,
          statusChangedAt: true,
          jobUrl: true,
        },
      }),
      this.prisma.application.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.interview.findMany({
        where: {
          application: { userId },
          scheduledAt: { gte: now, lte: nextWeek },
        },
        orderBy: { scheduledAt: 'asc' },
        select: {
          type: true,
          scheduledAt: true,
          application: { select: { company: true, position: true } },
        },
      }),
    ]);

    const statusCounts = Object.fromEntries(
      Object.values(ApplicationStatus).map((status) => [status, 0]),
    ) as Record<ApplicationStatus, number>;
    for (const group of groups) statusCounts[group.status] = group._count._all;

    return {
      followUps: followUps as FollowUpItem[],
      statusCounts,
      upcomingInterviews: upcoming.map((item) => ({
        ...item,
        company: item.application.company,
        position: item.application.position,
      })) as UpcomingInterviewItem[],
    };
  }
}

export function getUtcWeekStart(date: Date): Date {
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002') ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002')
  );
}
