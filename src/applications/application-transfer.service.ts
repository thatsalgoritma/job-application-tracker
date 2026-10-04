import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ApplicationStatus, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildApplicationsOrderBy,
  buildApplicationsWhere,
} from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import {
  ApplicationExportFormat,
  ExportApplicationsQueryDto,
} from './dto/export-applications-query.dto';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';
import {
  mapApplicationColumns,
  mapApplicationObject,
  parseCsv,
} from './application-import.parser';

export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;
const EXPORT_BATCH_SIZE = 250;
const CSV_COLUMNS = [
  'company',
  'position',
  'jobUrl',
  'location',
  'source',
  'status',
  'appliedAt',
  'notes',
] as const;

type ImportApplication = CreateApplicationDto & { status?: ApplicationStatus };
type ApplicationDelegate = Prisma.TransactionClient['application'];

interface ImportCandidate {
  row: number;
  data?: ImportApplication;
  validationError?: string;
}

export interface ImportRowResult {
  row: number;
  outcome: 'created' | 'skipped' | 'failed';
  reason?: string;
}

export interface ImportReport {
  dryRun: boolean;
  created: number;
  skipped: number;
  failed: number;
  rows: ImportRowResult[];
}

export interface ApplicationExport {
  stream: Readable;
  contentType: string;
  filename: string;
}

export interface ApplicationImportFile {
  buffer: Buffer;
  size: number;
  mimetype: string;
}

@Injectable()
export class ApplicationTransferService {
  constructor(private readonly prisma: PrismaService) {}

  export(userId: string, query: ExportApplicationsQueryDto): ApplicationExport {
    validateDateRange(query);
    const where = buildApplicationsWhere(userId, query);
    const orderBy = [buildApplicationsOrderBy(query), { id: 'asc' }] as const;

    if (query.format === ApplicationExportFormat.JSON) {
      return {
        stream: Readable.from(this.jsonChunks(where, orderBy)),
        contentType: 'application/json; charset=utf-8',
        filename: 'applications.json',
      };
    }

    return {
      stream: Readable.from(this.csvChunks(where, orderBy)),
      contentType: 'text/csv; charset=utf-8',
      filename: 'applications.csv',
    };
  }

  async import(
    userId: string,
    file: ApplicationImportFile | undefined,
    contentType: string | undefined,
    dryRun: boolean,
  ): Promise<ImportReport> {
    const candidates = this.parseImportFile(file, contentType);
    const now = new Date();

    if (dryRun) {
      const rows = await assessCandidates(
        this.prisma.application,
        userId,
        candidates,
        now,
      );
      return buildImportReport(true, rows);
    }

    return this.prisma.$transaction(
      async (transaction) => {
        const results = await assessCandidates(
          transaction.application,
          userId,
          candidates,
          now,
        );
        if (results.some((result) => result.outcome === 'failed')) {
          return buildImportReport(
            false,
            results.map((result) =>
              result.outcome === 'created'
                ? {
                    row: result.row,
                    outcome: 'skipped' as const,
                    reason:
                      'Not created because another row failed; imports are atomic',
                  }
                : result,
            ),
          );
        }

        const candidateByRow = new Map(
          candidates.map((candidate) => [candidate.row, candidate]),
        );
        for (const result of results) {
          if (result.outcome !== 'created') continue;
          const candidate = candidateByRow.get(result.row);
          if (!candidate?.data) continue;
          const { status, appliedAt, ...fields } = candidate.data;
          await transaction.application.create({
            data: {
              ...fields,
              status: status ?? ApplicationStatus.APPLIED,
              appliedAt: appliedAt ? new Date(appliedAt) : now,
              statusChangedAt: now,
              userId,
            },
          });
        }
        return buildImportReport(false, results);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private parseImportFile(
    file: ApplicationImportFile | undefined,
    contentType: string | undefined,
  ): ImportCandidate[] {
    if (!file) throw new BadRequestException('A CSV or JSON file is required');
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw new PayloadTooLargeException('Import file must be 2 MB or smaller');
    }

    const normalizedType = contentType?.split(';', 1)[0].trim().toLowerCase();
    if (
      normalizedType !== 'text/csv' &&
      normalizedType !== 'application/csv' &&
      normalizedType !== 'application/json'
    ) {
      throw new BadRequestException(
        'Only text/csv, application/csv, or application/json files are accepted',
      );
    }

    const text = file.buffer.toString('utf8');
    let rawRows: Array<{ row: number; data: Record<string, unknown> }>;

    try {
      rawRows =
        normalizedType === 'application/json'
          ? parseJsonRows(text)
          : parseCsvRows(text);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Could not parse the import file',
      );
    }

    if (rawRows.length > MAX_IMPORT_ROWS) {
      throw new PayloadTooLargeException(
        `Import files are limited to ${MAX_IMPORT_ROWS} application rows`,
      );
    }

    return rawRows.map(({ row, data }) => {
      try {
        return { row, data: validateApplicationRow(data) };
      } catch (error: unknown) {
        return {
          row,
          validationError:
            error instanceof Error ? error.message : 'Invalid application row',
        };
      }
    });
  }

  private async *csvChunks(
    where: Prisma.ApplicationWhereInput,
    orderBy: readonly Prisma.ApplicationOrderByWithRelationInput[],
  ): AsyncGenerator<string> {
    yield `\uFEFF${CSV_COLUMNS.map(escapeCsvCell).join(',')}\r\n`;
    let skip = 0;
    while (true) {
      const applications = await this.prisma.application.findMany({
        where,
        orderBy: [...orderBy],
        skip,
        take: EXPORT_BATCH_SIZE,
        select: {
          company: true,
          position: true,
          jobUrl: true,
          location: true,
          source: true,
          status: true,
          appliedAt: true,
          notes: true,
        },
      });
      for (const application of applications) {
        yield `${CSV_COLUMNS.map((column) => escapeCsvCell(application[column])).join(',')}\r\n`;
      }
      if (applications.length < EXPORT_BATCH_SIZE) return;
      skip += applications.length;
    }
  }

  private async *jsonChunks(
    where: Prisma.ApplicationWhereInput,
    orderBy: readonly Prisma.ApplicationOrderByWithRelationInput[],
  ): AsyncGenerator<string> {
    yield '[';
    let skip = 0;
    let first = true;
    while (true) {
      const applications = await this.prisma.application.findMany({
        where,
        orderBy: [...orderBy],
        skip,
        take: EXPORT_BATCH_SIZE,
        include: {
          interviews: { orderBy: { scheduledAt: 'asc' } },
        },
      });
      for (const application of applications) {
        yield `${first ? '' : ','}${JSON.stringify(application)}`;
        first = false;
      }
      if (applications.length < EXPORT_BATCH_SIZE) break;
      skip += applications.length;
    }
    yield ']';
  }
}

function parseCsvRows(
  text: string,
): Array<{ row: number; data: Record<string, unknown> }> {
  const parsed = parseCsv(text);
  if (parsed.length < 2) {
    throw new BadRequestException(
      'CSV must include a header and at least one row',
    );
  }
  const [header, ...rows] = parsed;
  const headers = header.cells.map((cell) => cell.trim());
  const canonicalHeaders = headers.map((item) =>
    item.toLowerCase().replace(/[^a-z0-9]/g, ''),
  );
  if (new Set(canonicalHeaders).size !== canonicalHeaders.length) {
    throw new BadRequestException('CSV contains duplicate column names');
  }

  return rows.map(({ line, cells }) => ({
    row: line,
    data:
      cells.length === headers.length
        ? mapApplicationColumns(headers, cells)
        : {
            __rowError: `Expected ${headers.length} columns but found ${cells.length}`,
          },
  }));
}

function parseJsonRows(
  text: string,
): Array<{ row: number; data: Record<string, unknown> }> {
  const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
  const items = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && 'applications' in parsed
      ? (parsed as { applications: unknown }).applications
      : undefined;
  if (!Array.isArray(items)) {
    throw new BadRequestException(
      'JSON must be an array or contain an applications array',
    );
  }
  if (items.length === 0) {
    throw new BadRequestException('JSON must contain at least one application');
  }
  return items.map((item, index) => ({
    row: index + 1,
    data: mapApplicationObject(item),
  }));
}

function validateApplicationRow(
  raw: Record<string, unknown>,
): ImportApplication {
  if ('__rowError' in raw) throw new Error(String(raw.__rowError));
  const instance = plainToInstance(CreateApplicationDto, raw);
  const errors = validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });
  const messages = errors.flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
  if (raw.status !== undefined) {
    if (
      typeof raw.status !== 'string' ||
      !Object.values(ApplicationStatus).includes(
        raw.status as ApplicationStatus,
      )
    ) {
      messages.push(
        `status must be one of: ${Object.values(ApplicationStatus).join(', ')}`,
      );
    }
  }
  if (messages.length > 0) throw new Error(messages.join('; '));
  return {
    ...instance,
    ...(raw.status ? { status: raw.status as ApplicationStatus } : {}),
  };
}

async function assessCandidates(
  applications: ApplicationDelegate,
  userId: string,
  candidates: ImportCandidate[],
  now: Date,
): Promise<ImportRowResult[]> {
  const rows: ImportRowResult[] = [];
  const seen = new Map<string, number>();

  for (const candidate of candidates) {
    if (candidate.validationError || !candidate.data) {
      rows.push({
        row: candidate.row,
        outcome: 'failed',
        reason: candidate.validationError ?? 'Invalid application row',
      });
      continue;
    }
    const appliedAt = candidate.data.appliedAt
      ? new Date(candidate.data.appliedAt)
      : now;
    const identity = `${candidate.data.company.trim().toLowerCase()}\u0000${candidate.data.position.trim().toLowerCase()}\u0000${appliedAt.toISOString()}`;
    const earlierRow = seen.get(identity);
    if (earlierRow) {
      rows.push({
        row: candidate.row,
        outcome: 'skipped',
        reason: `Duplicate of row ${earlierRow} in this file`,
      });
      continue;
    }
    seen.set(identity, candidate.row);

    const existing = await applications.findFirst({
      where: {
        userId,
        company: { equals: candidate.data.company.trim(), mode: 'insensitive' },
        position: {
          equals: candidate.data.position.trim(),
          mode: 'insensitive',
        },
        appliedAt,
      },
      select: { id: true },
    });
    rows.push(
      existing
        ? {
            row: candidate.row,
            outcome: 'skipped',
            reason: 'Application already exists for this user',
          }
        : { row: candidate.row, outcome: 'created' },
    );
  }
  return rows;
}

function buildImportReport(
  dryRun: boolean,
  rows: ImportRowResult[],
): ImportReport {
  return {
    dryRun,
    created: rows.filter((row) => row.outcome === 'created').length,
    skipped: rows.filter((row) => row.outcome === 'skipped').length,
    failed: rows.filter((row) => row.outcome === 'failed').length,
    rows,
  };
}

function escapeCsvCell(value: unknown): string {
  let cell = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[\t\r ]*[=+\-@]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}

function validateDateRange(query: ListApplicationsQueryDto): void {
  if (
    query.appliedFrom &&
    query.appliedTo &&
    new Date(query.appliedFrom) > new Date(query.appliedTo)
  ) {
    throw new BadRequestException('appliedFrom must be before appliedTo');
  }
}
