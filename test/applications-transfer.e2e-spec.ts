import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Application, ApplicationStatus, Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Application import and export endpoints (e2e)', () => {
  let app: INestApplication;
  const ownerId = 'current-user';
  const appliedAt = new Date('2026-01-01T00:00:00.000Z');
  const applications: Application[] = [
    {
      id: randomUUID(),
      userId: ownerId,
      company: '=Formula Corp',
      position: 'Mühendis',
      jobUrl: null,
      location: 'İstanbul',
      source: null,
      status: ApplicationStatus.APPLIED,
      appliedAt,
      statusChangedAt: appliedAt,
      notes: null,
      createdAt: appliedAt,
      updatedAt: appliedAt,
    },
    {
      id: randomUUID(),
      userId: 'another-user',
      company: 'Private Company',
      position: 'Secret Role',
      jobUrl: null,
      location: null,
      source: null,
      status: ApplicationStatus.APPLIED,
      appliedAt,
      statusChangedAt: appliedAt,
      notes: 'must never leak',
      createdAt: appliedAt,
      updatedAt: appliedAt,
    },
  ];
  const interviews = new Map<string, Array<{ id: string; type: string }>>();

  const applicationModel = {
    findMany: jest.fn(async (args: Prisma.ApplicationFindManyArgs) => {
      const userId = args.where?.userId as string;
      const filtered = applications.filter((item) => item.userId === userId);
      const skip = args.skip ?? 0;
      const take = args.take ?? filtered.length;
      return filtered.slice(skip, skip + take).map((item) => {
        if (args.select) {
          return Object.fromEntries(
            Object.keys(args.select)
              .filter((key) => args.select?.[key as keyof typeof args.select])
              .map((key) => [key, item[key as keyof Application]]),
          );
        }
        return {
          ...item,
          ...(args.include?.interviews
            ? { interviews: interviews.get(item.id) ?? [] }
            : {}),
        };
      });
    }),
    findFirst: jest.fn(async (args: Prisma.ApplicationFindFirstArgs) => {
      const where = args.where!;
      const company = where.company as { equals?: string } | undefined;
      const position = where.position as { equals?: string } | undefined;
      return (
        applications.find(
          (item) =>
            item.userId === where.userId &&
            item.company.toLowerCase() === company?.equals?.toLowerCase() &&
            item.position.toLowerCase() === position?.equals?.toLowerCase() &&
            item.appliedAt.getTime() ===
              (where.appliedAt as Date | undefined)?.getTime(),
        ) ?? null
      );
    }),
    create: jest.fn(async (args: Prisma.ApplicationCreateArgs) => {
      const data = args.data as Prisma.ApplicationUncheckedCreateInput;
      const created: Application = {
        id: randomUUID(),
        userId: data.userId,
        company: data.company,
        position: data.position,
        jobUrl: data.jobUrl ?? null,
        location: data.location ?? null,
        source: data.source ?? null,
        status: data.status ?? ApplicationStatus.APPLIED,
        appliedAt: data.appliedAt ? new Date(data.appliedAt) : new Date(),
        statusChangedAt: data.statusChangedAt
          ? new Date(data.statusChangedAt)
          : new Date(),
        notes: data.notes ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      applications.push(created);
      return created;
    }),
  };
  const prismaMock = {
    application: applicationModel,
    $transaction: jest.fn(async (callback: (transaction: unknown) => unknown) =>
      callback({ application: applicationModel }),
    ),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            sub: ownerId,
            email: 'user@example.com',
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('streams CSV only for the current user and protects formula-like cells', async () => {
    const response = await request(app.getHttpServer())
      .get('/applications/export?format=csv&status=APPLIED')
      .expect(200)
      .expect('content-type', /text\/csv/);

    expect(response.text.startsWith('\uFEFF')).toBe(true);
    expect(response.text).toContain("'=Formula Corp");
    expect(response.text).toContain('Mühendis');
    expect(response.text).not.toContain('Private Company');
    expect(response.text).not.toContain('must never leak');
    expect(applicationModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: ownerId, status: 'APPLIED' }),
      }),
    );
  });

  it('exports JSON with interviews attached to each owned application', async () => {
    interviews.set(applications[0].id, [{ id: 'interview-1', type: 'HR' }]);
    const response = await request(app.getHttpServer())
      .get('/applications/export?format=json')
      .expect(200)
      .expect('content-type', /application\/json/);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].userId).toBe(ownerId);
    expect(response.body[0].interviews).toEqual([
      { id: 'interview-1', type: 'HR' },
    ]);
  });

  it('dry-runs imports with duplicate and invalid row reports', async () => {
    const csv = [
      'Company,Position,AppliedAt,Status',
      '=Formula Corp,Mühendis,2026-01-01T00:00:00.000Z,APPLIED',
      'New Company,Engineer,2026-01-03T00:00:00.000Z,NOT_A_STATUS',
      'Good Company,Engineer,2026-01-04T00:00:00.000Z,SCREENING',
    ].join('\n');
    const response = await request(app.getHttpServer())
      .post('/applications/import?dryRun=true')
      .attach('file', Buffer.from(csv), {
        filename: 'applications.csv',
        contentType: 'text/csv',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      dryRun: true,
      created: 1,
      skipped: 1,
      failed: 1,
    });
    expect(response.body.rows).toEqual([
      {
        row: 2,
        outcome: 'skipped',
        reason: 'Application already exists for this user',
      },
      {
        row: 3,
        outcome: 'failed',
        reason: expect.stringContaining('status must be one of'),
      },
      { row: 4, outcome: 'created' },
    ]);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('imports JSON transactionally and skips an existing application', async () => {
    const json = JSON.stringify([
      {
        Company: '=Formula Corp',
        Position: 'Mühendis',
        AppliedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        company: 'New Company',
        position: 'Backend Engineer',
        appliedAt: '2026-02-01T00:00:00.000Z',
        status: 'SCREENING',
        userId: 'attacker-controlled-id',
      },
    ]);
    const response = await request(app.getHttpServer())
      .post('/applications/import')
      .attach('file', Buffer.from(json), {
        filename: 'applications.json',
        contentType: 'application/json',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      dryRun: false,
      created: 1,
      skipped: 1,
      failed: 0,
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(applicationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: ownerId,
          company: 'New Company',
          status: 'SCREENING',
        }),
      }),
    );
  });
});
