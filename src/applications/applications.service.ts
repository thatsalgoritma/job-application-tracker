import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Application, ApplicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import {
  ApplicationSortBy,
  ListApplicationsQueryDto,
  SortOrder,
} from './dto/list-applications-query.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

export interface PaginatedApplications {
  data: Application[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApplicationStats {
  totalApplications: number;
  countsByStatus: Record<ApplicationStatus, number>;
  responseRate: {
    respondedApplications: number;
    eligibleApplications: number;
    percentage: number;
  };
}

const NEXT_STATUSES: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  APPLIED: [
    ApplicationStatus.SCREENING,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  SCREENING: [
    ApplicationStatus.INTERVIEW,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  INTERVIEW: [
    ApplicationStatus.OFFER,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  OFFER: [],
  REJECTED: [],
  WITHDRAWN: [],
};

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateApplicationDto): Promise<Application> {
    const { appliedAt, ...fields } = dto;
    return this.prisma.application.create({
      data: {
        ...fields,
        ...(appliedAt ? { appliedAt: new Date(appliedAt) } : {}),
        userId,
      },
    });
  }

  async findAll(
    userId: string,
    query: ListApplicationsQueryDto,
  ): Promise<PaginatedApplications> {
    if (
      query.appliedFrom &&
      query.appliedTo &&
      new Date(query.appliedFrom) > new Date(query.appliedTo)
    ) {
      throw new BadRequestException('appliedFrom must be before appliedTo');
    }

    const where: Prisma.ApplicationWhereInput = { userId };
    if (query.status) where.status = query.status;
    if (query.company) {
      where.company = { contains: query.company, mode: 'insensitive' };
    }
    if (query.appliedFrom || query.appliedTo) {
      where.appliedAt = {
        ...(query.appliedFrom ? { gte: new Date(query.appliedFrom) } : {}),
        ...(query.appliedTo ? { lte: new Date(query.appliedTo) } : {}),
      };
    }
    if (query.q) {
      where.OR = [
        { company: { contains: query.q, mode: 'insensitive' } },
        { position: { contains: query.q, mode: 'insensitive' } },
        { notes: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.ApplicationOrderByWithRelationInput = {
      [query.sortBy ?? ApplicationSortBy.APPLIED_AT]:
        query.sortOrder ?? SortOrder.DESC,
    };
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        orderBy,
        skip,
        take: query.pageSize,
      }),
      this.prisma.application.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  findFollowUpNeeded(userId: string, days: number): Promise<Application[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.application.findMany({
      where: {
        userId,
        status: {
          in: [
            ApplicationStatus.APPLIED,
            ApplicationStatus.SCREENING,
            ApplicationStatus.INTERVIEW,
          ],
        },
        statusChangedAt: { lte: cutoff },
      },
      orderBy: { statusChangedAt: 'asc' },
    });
  }

  async getStats(userId: string): Promise<ApplicationStats> {
    const groups = await this.prisma.application.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    });
    const countsByStatus = Object.fromEntries(
      Object.values(ApplicationStatus).map((status) => [status, 0]),
    ) as Record<ApplicationStatus, number>;

    for (const group of groups) {
      countsByStatus[group.status] = group._count._all;
    }

    const totalApplications = Object.values(countsByStatus).reduce(
      (sum, count) => sum + count,
      0,
    );
    const respondedApplications =
      countsByStatus.SCREENING +
      countsByStatus.INTERVIEW +
      countsByStatus.OFFER +
      countsByStatus.REJECTED;
    const eligibleApplications = totalApplications - countsByStatus.WITHDRAWN;

    return {
      totalApplications,
      countsByStatus,
      responseRate: {
        respondedApplications,
        eligibleApplications,
        percentage:
          eligibleApplications === 0
            ? 0
            : Math.round(
                (respondedApplications / eligibleApplications) * 10000,
              ) / 100,
      },
    };
  }

  async findOne(userId: string, applicationId: string): Promise<Application> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, userId },
    });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  async update(
    userId: string,
    applicationId: string,
    dto: UpdateApplicationDto,
  ): Promise<Application> {
    const current = await this.findOne(userId, applicationId);
    const { appliedAt, status, ...fields } = dto;
    const data: Prisma.ApplicationUpdateInput = {
      ...fields,
      ...(appliedAt ? { appliedAt: new Date(appliedAt) } : {}),
    };

    if (status && status !== current.status) {
      if (!NEXT_STATUSES[current.status].includes(status)) {
        throw new BadRequestException(
          `Invalid application status transition: ${current.status} -> ${status}`,
        );
      }
      data.status = status;
      data.statusChangedAt = new Date();
    }

    return this.prisma.application.update({
      where: { id: applicationId, userId },
      data,
    });
  }

  async remove(userId: string, applicationId: string): Promise<void> {
    await this.findOne(userId, applicationId);
    await this.prisma.application.delete({
      where: { id: applicationId, userId },
    });
  }
}
