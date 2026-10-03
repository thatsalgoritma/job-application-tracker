import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  Application,
  ApplicationStatus,
  Interview,
  InterviewType,
  Prisma,
  User,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Application and interview endpoints (e2e)', () => {
  let app: INestApplication;
  const usersByEmail = new Map<string, User>();
  const applications = new Map<string, Application>();
  const interviews = new Map<string, Interview>();

  interface TextFilter {
    contains?: string;
    mode?: 'insensitive' | 'default';
  }

  interface DateFilter {
    gte?: Date;
    lte?: Date;
  }

  interface ApplicationFilter {
    userId?: string;
    status?: ApplicationStatus | { in?: ApplicationStatus[] };
    company?: string | TextFilter;
    appliedAt?: DateFilter;
    statusChangedAt?: DateFilter;
    OR?: ApplicationFilter[];
    position?: string | TextFilter;
    notes?: string | TextFilter;
  }

  function matchesText(value: string | null, filter?: string | TextFilter) {
    if (filter === undefined) return true;
    if (typeof filter === 'string') return value === filter;
    if (!filter.contains) return true;
    const actual = filter.mode === 'insensitive' ? value?.toLowerCase() : value;
    const search =
      filter.mode === 'insensitive'
        ? filter.contains.toLowerCase()
        : filter.contains;
    return actual?.includes(search) ?? false;
  }

  function matchesDate(value: Date, filter?: DateFilter) {
    if (!filter) return true;
    if (filter.gte && value < filter.gte) return false;
    if (filter.lte && value > filter.lte) return false;
    return true;
  }

  function matchesApplication(
    application: Application,
    filter: ApplicationFilter,
  ): boolean {
    if (filter.userId && application.userId !== filter.userId) return false;
    if (
      typeof filter.status === 'string' &&
      application.status !== filter.status
    )
      return false;
    if (
      typeof filter.status === 'object' &&
      filter.status.in &&
      !filter.status.in.includes(application.status)
    ) {
      return false;
    }
    if (!matchesText(application.company, filter.company)) return false;
    if (!matchesDate(application.appliedAt, filter.appliedAt)) return false;
    if (!matchesDate(application.statusChangedAt, filter.statusChangedAt))
      return false;
    if (
      filter.OR &&
      !filter.OR.some((condition) => {
        const textCondition =
          condition.company ?? condition.position ?? condition.notes;
        const value = condition.company
          ? application.company
          : condition.position
            ? application.position
            : application.notes;
        return matchesText(value, textCondition);
      })
    ) {
      return false;
    }
    return true;
  }

  const prismaMock = {
    user: {
      findUnique: jest.fn(({ where }: Prisma.UserFindUniqueArgs) =>
        where.email
          ? (usersByEmail.get(where.email) ?? null)
          : ([...usersByEmail.values()].find((user) => user.id === where.id) ??
            null),
      ),
      create: jest.fn(({ data }: Prisma.UserCreateArgs) => {
        const user: User = {
          id: randomUUID(),
          email: data.email,
          passwordHash: data.passwordHash,
          createdAt: new Date(),
        };
        usersByEmail.set(user.email, user);
        return user;
      }),
    },
    application: {
      create: jest.fn(
        ({
          data,
        }: {
          data: {
            userId: string;
            company: string;
            position: string;
            jobUrl?: string | null;
            location?: string | null;
            source?: string | null;
            status?: ApplicationStatus;
            appliedAt?: Date;
            statusChangedAt?: Date;
            notes?: string | null;
          };
        }) => {
          const now = new Date();
          const application: Application = {
            id: randomUUID(),
            userId: data.userId,
            company: data.company,
            position: data.position,
            jobUrl: data.jobUrl ?? null,
            location: data.location ?? null,
            source: data.source ?? null,
            status: data.status ?? ApplicationStatus.APPLIED,
            appliedAt: data.appliedAt ?? now,
            statusChangedAt: data.statusChangedAt ?? now,
            notes: data.notes ?? null,
            createdAt: now,
            updatedAt: now,
          };
          applications.set(application.id, application);
          return application;
        },
      ),
      findMany: jest.fn(
        ({
          where,
          orderBy,
          skip = 0,
          take,
        }: {
          where: ApplicationFilter;
          orderBy?: Record<string, 'asc' | 'desc'>;
          skip?: number;
          take?: number;
        }) => {
          const results = [...applications.values()].filter((item) =>
            matchesApplication(item, where),
          );
          const [sortKey, direction] = Object.entries(orderBy ?? {})[0] ?? [];
          if (sortKey) {
            results.sort((left, right) => {
              const leftValue = left[sortKey as keyof Application];
              const rightValue = right[sortKey as keyof Application];
              const comparison =
                leftValue instanceof Date && rightValue instanceof Date
                  ? leftValue.getTime() - rightValue.getTime()
                  : String(leftValue).localeCompare(String(rightValue));
              return direction === 'desc' ? -comparison : comparison;
            });
          }
          return results.slice(
            skip,
            take === undefined ? undefined : skip + take,
          );
        },
      ),
      count: jest.fn(
        ({ where }: { where: ApplicationFilter }) =>
          [...applications.values()].filter((item) =>
            matchesApplication(item, where),
          ).length,
      ),
      groupBy: jest.fn(({ where }: { where: ApplicationFilter }) => {
        const counts = new Map<ApplicationStatus, number>();
        for (const item of applications.values()) {
          if (matchesApplication(item, where)) {
            counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
          }
        }
        return [...counts.entries()].map(([status, count]) => ({
          status,
          _count: { _all: count },
        }));
      }),
      findFirst: jest.fn(
        ({ where }: { where: { id?: string; userId?: string } }) => {
          const application = where.id ? applications.get(where.id) : null;
          return application && application.userId === where.userId
            ? application
            : null;
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Prisma.ApplicationUpdateInput;
        }) => {
          const current = applications.get(where.id);
          if (!current) throw new Error('Application not found in test fake');
          const updated = {
            ...current,
            ...data,
            updatedAt: new Date(),
          } as Application;
          applications.set(updated.id, updated);
          return updated;
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const deleted = applications.get(where.id);
        if (!deleted) throw new Error('Application not found in test fake');
        applications.delete(where.id);
        for (const [id, interview] of interviews) {
          if (interview.applicationId === where.id) interviews.delete(id);
        }
        return deleted;
      }),
    },
    interview: {
      create: jest.fn(
        ({
          data,
        }: {
          data: {
            applicationId: string;
            type: InterviewType;
            scheduledAt: Date;
            notes?: string | null;
            outcome?: string | null;
          };
        }) => {
          const interview: Interview = {
            id: randomUUID(),
            applicationId: data.applicationId,
            type: data.type,
            scheduledAt: data.scheduledAt,
            notes: data.notes ?? null,
            outcome: data.outcome ?? null,
            createdAt: new Date(),
          };
          interviews.set(interview.id, interview);
          return interview;
        },
      ),
      findMany: jest.fn(({ where }: { where: { applicationId: string } }) =>
        [...interviews.values()].filter(
          (interview) => interview.applicationId === where.applicationId,
        ),
      ),
      findFirst: jest.fn(
        ({ where }: { where: { id: string; applicationId: string } }) => {
          const interview = interviews.get(where.id);
          return interview?.applicationId === where.applicationId
            ? interview
            : null;
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Prisma.InterviewUpdateInput;
        }) => {
          const current = interviews.get(where.id);
          if (!current) throw new Error('Interview not found in test fake');
          const updated = { ...current, ...data } as Interview;
          interviews.set(updated.id, updated);
          return updated;
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const deleted = interviews.get(where.id);
        if (!deleted) throw new Error('Interview not found in test fake');
        interviews.delete(where.id);
        return deleted;
      }),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    usersByEmail.clear();
    applications.clear();
    interviews.clear();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function register(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'SecurePass123!' })
      .expect(201);
    return response.body.accessToken as string;
  }

  async function createApplication(
    token: string,
    fields: Record<string, string> = {},
  ): Promise<Application> {
    const response = await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'Acme Corp', position: 'Backend Engineer', ...fields })
      .expect(201);
    return response.body as Application;
  }

  async function setStatus(
    token: string,
    applicationId: string,
    target: ApplicationStatus,
  ): Promise<void> {
    const steps: Record<ApplicationStatus, ApplicationStatus[]> = {
      APPLIED: [],
      SCREENING: [ApplicationStatus.SCREENING],
      INTERVIEW: [ApplicationStatus.SCREENING, ApplicationStatus.INTERVIEW],
      OFFER: [
        ApplicationStatus.SCREENING,
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.OFFER,
      ],
      REJECTED: [ApplicationStatus.REJECTED],
      WITHDRAWN: [ApplicationStatus.WITHDRAWN],
    };
    for (const status of steps[target]) {
      await request(app.getHttpServer())
        .patch(`/applications/${applicationId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status })
        .expect(200);
    }
  }

  it('supports application and interview CRUD for their owner', async () => {
    const token = await register('owner@example.com');
    const application = await createApplication(token);
    expect(application.status).toBe(ApplicationStatus.APPLIED);

    await request(app.getHttpServer())
      .get('/applications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => expect(response.body.data).toHaveLength(1));
    await request(app.getHttpServer())
      .get(`/applications/${application.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/applications/${application.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: ApplicationStatus.SCREENING, notes: 'Recruiter call' })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe(ApplicationStatus.SCREENING);
        expect(response.body.statusChangedAt).toBeDefined();
      });

    const interviewResponse = await request(app.getHttpServer())
      .post(`/applications/${application.id}/interviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: InterviewType.TECHNICAL,
        scheduledAt: '2026-11-15T13:00:00.000Z',
      })
      .expect(201);
    const interview = interviewResponse.body as Interview;
    await request(app.getHttpServer())
      .get(`/applications/${application.id}/interviews`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => expect(response.body).toHaveLength(1));
    await request(app.getHttpServer())
      .get(`/applications/${application.id}/interviews/${interview.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/applications/${application.id}/interviews/${interview.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'Passed' })
      .expect(200)
      .expect((response) => expect(response.body.outcome).toBe('Passed'));
    await request(app.getHttpServer())
      .delete(`/applications/${application.id}/interviews/${interview.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/applications/${application.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/applications/${application.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('filters, searches, sorts, and paginates only the current user’s applications', async () => {
    const token = await register('listing@example.com');
    const first = await createApplication(token, {
      company: 'Acme Corp',
      position: 'Backend Engineer',
      appliedAt: '2026-07-01T09:00:00.000Z',
    });
    const second = await createApplication(token, {
      company: 'Acme Systems',
      position: 'Senior Backend Engineer',
      appliedAt: '2026-07-03T09:00:00.000Z',
    });
    await createApplication(token, {
      company: 'Other Company',
      position: 'Backend Engineer',
      appliedAt: '2026-07-02T09:00:00.000Z',
    });
    await setStatus(token, first.id, ApplicationStatus.SCREENING);
    await setStatus(token, second.id, ApplicationStatus.SCREENING);

    const query =
      '?status=SCREENING&company=acme&q=backend&appliedFrom=2026-07-01T00%3A00%3A00.000Z&appliedTo=2026-07-04T00%3A00%3A00.000Z&sortBy=appliedAt&sortOrder=desc&pageSize=1';
    const pageOne = await request(app.getHttpServer())
      .get(`/applications${query}&page=1`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(pageOne.body.data).toHaveLength(1);
    expect(pageOne.body.data[0].id).toBe(second.id);
    expect(pageOne.body.meta).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });

    const pageTwo = await request(app.getHttpServer())
      .get(`/applications${query}&page=2`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(pageTwo.body.data[0].id).toBe(first.id);

    await request(app.getHttpServer())
      .get('/applications?pageSize=101')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('returns aged active applications for follow-up and excludes terminal statuses', async () => {
    const token = await register('followup@example.com');
    const stale = await createApplication(token, { company: 'Stale Inc' });
    const recent = await createApplication(token, { company: 'Recent Inc' });
    const terminal = await createApplication(token, { company: 'Closed Inc' });
    await setStatus(token, terminal.id, ApplicationStatus.REJECTED);

    const cutoffAge = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const staleRecord = applications.get(stale.id)!;
    applications.set(stale.id, {
      ...staleRecord,
      statusChangedAt: new Date(cutoffAge),
    });
    const terminalRecord = applications.get(terminal.id)!;
    applications.set(terminal.id, {
      ...terminalRecord,
      statusChangedAt: new Date(cutoffAge),
    });

    const response = await request(app.getHttpServer())
      .get('/applications/follow-up?days=7')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.map((item: Application) => item.id)).toEqual([
      stale.id,
    ]);
    expect(response.body.map((item: Application) => item.id)).not.toContain(
      recent.id,
    );
    await request(app.getHttpServer())
      .get('/applications/follow-up?days=0')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('returns zero-filled status counts and the agreed response rate', async () => {
    const token = await register('stats@example.com');
    const targets = [
      ApplicationStatus.APPLIED,
      ApplicationStatus.SCREENING,
      ApplicationStatus.INTERVIEW,
      ApplicationStatus.OFFER,
      ApplicationStatus.REJECTED,
      ApplicationStatus.WITHDRAWN,
    ];
    for (const [index, status] of targets.entries()) {
      const application = await createApplication(token, {
        company: `Company ${index}`,
      });
      await setStatus(token, application.id, status);
    }

    const response = await request(app.getHttpServer())
      .get('/applications/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.totalApplications).toBe(6);
    expect(response.body.countsByStatus).toEqual({
      APPLIED: 1,
      SCREENING: 1,
      INTERVIEW: 1,
      OFFER: 1,
      REJECTED: 1,
      WITHDRAWN: 1,
    });
    expect(response.body.responseRate).toEqual({
      respondedApplications: 4,
      eligibleApplications: 5,
      percentage: 80,
    });
  });

  it('does not allow one user to read or change another user’s application', async () => {
    const ownerToken = await register('owner@example.com');
    const otherToken = await register('other@example.com');
    const application = await createApplication(ownerToken);

    await request(app.getHttpServer())
      .get('/applications')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)
      .expect((response) => expect(response.body.data).toHaveLength(0));
    await request(app.getHttpServer())
      .get(`/applications/${application.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/applications/${application.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ company: 'Taken over' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/applications/${application.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);

    expect(applications.get(application.id)?.company).toBe('Acme Corp');
  });

  it('does not allow one user to read or change another user’s interviews', async () => {
    const ownerToken = await register('owner@example.com');
    const otherToken = await register('other@example.com');
    const application = await createApplication(ownerToken);
    const interviewResponse = await request(app.getHttpServer())
      .post(`/applications/${application.id}/interviews`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        type: InterviewType.HR,
        scheduledAt: '2026-11-15T13:00:00.000Z',
      })
      .expect(201);
    const interview = interviewResponse.body as Interview;
    const interviewPath = `/applications/${application.id}/interviews/${interview.id}`;

    await request(app.getHttpServer())
      .get(`/applications/${application.id}/interviews`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/applications/${application.id}/interviews`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        type: InterviewType.HR,
        scheduledAt: '2026-11-16T13:00:00.000Z',
      })
      .expect(404);
    await request(app.getHttpServer())
      .get(interviewPath)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(interviewPath)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ outcome: 'Changed by another user' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(interviewPath)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);

    expect(interviews.get(interview.id)?.outcome).toBeNull();
  });

  it('uses the shared error shape for invalid input and invalid status transitions', async () => {
    const token = await register('owner@example.com');
    await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: '', position: '' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          statusCode: 400,
          path: '/applications',
          error: 'Bad Request',
        });
        expect(response.body.message).toEqual(expect.any(Array));
      });

    const application = await createApplication(token);
    await request(app.getHttpServer())
      .patch(`/applications/${application.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: ApplicationStatus.OFFER })
      .expect(400)
      .expect((response) => {
        expect(response.body.message).toContain('APPLIED -> OFFER');
      });
  });
});
