import { Injectable, NotFoundException } from '@nestjs/common';
import { Interview } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationsService } from '../applications/applications.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { UpdateInterviewDto } from './dto/update-interview.dto';

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationsService: ApplicationsService,
  ) {}

  async create(
    userId: string,
    applicationId: string,
    dto: CreateInterviewDto,
  ): Promise<Interview> {
    await this.applicationsService.findOne(userId, applicationId);
    const { scheduledAt, ...fields } = dto;
    return this.prisma.interview.create({
      data: { ...fields, scheduledAt: new Date(scheduledAt), applicationId },
    });
  }

  async findAll(userId: string, applicationId: string): Promise<Interview[]> {
    await this.applicationsService.findOne(userId, applicationId);
    return this.prisma.interview.findMany({
      where: { applicationId },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async findOne(
    userId: string,
    applicationId: string,
    interviewId: string,
  ): Promise<Interview> {
    await this.applicationsService.findOne(userId, applicationId);
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, applicationId },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    return interview;
  }

  async update(
    userId: string,
    applicationId: string,
    interviewId: string,
    dto: UpdateInterviewDto,
  ): Promise<Interview> {
    await this.findOne(userId, applicationId, interviewId);
    const { scheduledAt, ...fields } = dto;
    return this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        ...fields,
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}),
      },
    });
  }

  async remove(
    userId: string,
    applicationId: string,
    interviewId: string,
  ): Promise<void> {
    await this.findOne(userId, applicationId, interviewId);
    await this.prisma.interview.delete({ where: { id: interviewId } });
  }
}
