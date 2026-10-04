import { PrismaService } from '../prisma/prisma.service';
import {
  ApplicationImportFile,
  ApplicationTransferService,
} from './application-transfer.service';
import { ApplicationExportFormat } from './dto/export-applications-query.dto';

function makeFile(text: string, mimetype = 'text/csv'): ApplicationImportFile {
  const buffer = Buffer.from(text, 'utf8');
  return {
    buffer,
    size: buffer.byteLength,
    mimetype,
  };
}

function makeService(existingCompany?: string) {
  const application = {
    findFirst: jest.fn(
      async (args: { where: { company: { equals: string } } }) =>
        args.where.company.equals.toLowerCase() ===
        existingCompany?.toLowerCase()
          ? { id: 'existing-application' }
          : null,
    ),
    findMany: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'created-application' }),
  };
  const prisma = {
    application,
    $transaction: jest.fn(async (callback: (transaction: unknown) => unknown) =>
      callback({ application }),
    ),
  } as unknown as PrismaService;
  return {
    service: new ApplicationTransferService(prisma),
    prisma,
    application,
  };
}

describe('ApplicationTransferService import', () => {
  it('dry-runs valid, duplicate, and invalid CSV rows with line numbers', async () => {
    const { service, application } = makeService('Existing Co');
    const report = await service.import(
      'user-1',
      makeFile(
        'Company,Position,Applied At,Status\nNew Co,Engineer,2026-01-01T00:00:00.000Z,APPLIED\nExisting Co,Engineer,2026-01-01T00:00:00.000Z,APPLIED\nBad Co,Engineer,2026-01-01T00:00:00.000Z,INVALID',
      ),
      'text/csv',
      true,
    );

    expect(report).toMatchObject({
      dryRun: true,
      created: 1,
      skipped: 1,
      failed: 1,
    });
    expect(report.rows).toEqual([
      { row: 2, outcome: 'created' },
      {
        row: 3,
        outcome: 'skipped',
        reason: 'Application already exists for this user',
      },
      {
        row: 4,
        outcome: 'failed',
        reason: expect.stringContaining('status must be one of'),
      },
    ]);
    expect(application.create).not.toHaveBeenCalled();
  });

  it('rolls back the whole import when any row is invalid', async () => {
    const { service, prisma, application } = makeService();
    const report = await service.import(
      'user-1',
      makeFile('Company,Position\nValid Co,Engineer\nMissing Position,'),
      'text/csv',
      false,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(application.create).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      dryRun: false,
      created: 0,
      skipped: 1,
      failed: 1,
    });
    expect(report.rows[0]).toMatchObject({
      row: 2,
      outcome: 'skipped',
      reason: expect.stringContaining('imports are atomic'),
    });
  });

  it('skips duplicate rows in a real import and creates each unique row once', async () => {
    const { service, application } = makeService();
    const report = await service.import(
      'user-1',
      makeFile(
        'Company,Position,AppliedAt\nAcme,Engineer,2026-01-01T00:00:00.000Z\nacme, engineer ,2026-01-01T00:00:00.000Z',
      ),
      'text/csv',
      false,
    );

    expect(report).toMatchObject({ created: 1, skipped: 1, failed: 0 });
    expect(report.rows[1]).toMatchObject({
      row: 3,
      outcome: 'skipped',
      reason: 'Duplicate of row 2 in this file',
    });
    expect(application.create).toHaveBeenCalledTimes(1);
  });

  it('rejects unexpected media types and invalid enum values', async () => {
    const { service } = makeService();
    await expect(
      service.import(
        'user-1',
        makeFile('{}', 'application/octet-stream'),
        'application/octet-stream',
        true,
      ),
    ).rejects.toThrow('Only text/csv');

    const report = await service.import(
      'user-1',
      makeFile(
        '[{"Company":"Acme","Position":"Engineer","status":"NOT_A_STATUS"}]',
        'application/json',
      ),
      'application/json',
      true,
    );
    expect(report).toMatchObject({
      failed: 1,
      rows: [{ row: 1, outcome: 'failed' }],
    });
  });

  it('rejects imports larger than the configured file limit', async () => {
    const { service } = makeService();
    const file = makeFile('x'.repeat(2 * 1024 * 1024 + 1));

    await expect(
      service.import('user-1', file, 'text/csv', true),
    ).rejects.toMatchObject({ status: 413 });
  });
});

describe('ApplicationTransferService export', () => {
  it('streams UTF-8 CSV with BOM, formula protection, and current-user filters', async () => {
    const { service, application } = makeService();
    application.findMany.mockResolvedValueOnce([
      {
        company: '=IMPORT("x")',
        position: 'Mühendis',
        jobUrl: null,
        location: 'İstanbul',
        source: null,
        status: 'APPLIED',
        appliedAt: new Date('2026-01-01T00:00:00.000Z'),
        notes: 'safe',
      },
    ] as never);
    const result = service.export('user-1', {
      format: ApplicationExportFormat.CSV,
      company: 'Acme',
      page: 1,
      pageSize: 20,
    } as never);
    let output = '';
    for await (const chunk of result.stream) output += chunk.toString();

    expect(output.startsWith('\uFEFF')).toBe(true);
    expect(output).toContain('\'=IMPORT(""x"")');
    expect(output).toContain('Mühendis');
    expect(output).toContain('İstanbul');
    expect(application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          company: { contains: 'Acme', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('includes interviews in JSON exports', async () => {
    const { service, application } = makeService();
    application.findMany.mockResolvedValueOnce([
      { id: 'app-1', interviews: [{ id: 'interview-1' }] },
    ] as never);
    const result = service.export('user-1', {
      format: ApplicationExportFormat.JSON,
      page: 1,
      pageSize: 20,
    } as never);
    let output = '';
    for await (const chunk of result.stream) output += chunk.toString();

    expect(JSON.parse(output)).toEqual([
      { id: 'app-1', interviews: [{ id: 'interview-1' }] },
    ]);
  });
});
