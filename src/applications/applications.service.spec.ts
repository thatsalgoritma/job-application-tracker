import { BadRequestException } from '@nestjs/common';
import { Application, ApplicationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationsService } from './applications.service';

const allowedTransitions: Record<ApplicationStatus, ApplicationStatus[]> = {
  APPLIED: ['APPLIED', 'SCREENING', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['SCREENING', 'INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['OFFER'],
  REJECTED: ['REJECTED'],
  WITHDRAWN: ['WITHDRAWN'],
};

const transitionCases = Object.values(ApplicationStatus).flatMap((from) =>
  Object.values(ApplicationStatus).map(
    (to) => [from, to, allowedTransitions[from].includes(to)] as const,
  ),
);

describe('ApplicationsService status transitions', () => {
  const application: Application = {
    id: 'application-id',
    userId: 'owner-id',
    company: 'Acme',
    position: 'Engineer',
    jobUrl: null,
    location: null,
    source: null,
    status: ApplicationStatus.APPLIED,
    appliedAt: new Date('2026-01-01T00:00:00.000Z'),
    statusChangedAt: new Date('2026-01-01T00:00:00.000Z'),
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it.each(transitionCases)('%s -> %s is %s', async (from, to, isAllowed) => {
    const current = { ...application, status: from };
    const update = jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        ...current,
        ...data,
      }));
    const prisma = {
      application: {
        findFirst: jest.fn().mockResolvedValue(current),
        update,
      },
    } as unknown as PrismaService;
    const service = new ApplicationsService(prisma);

    const result = service.update('owner-id', application.id, { status: to });

    if (!isAllowed) {
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow(`${from} -> ${to}`);
      expect(update).not.toHaveBeenCalled();
      return;
    }

    await expect(result).resolves.toMatchObject({ status: to });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: application.id, userId: 'owner-id' },
      }),
    );
    if (from !== to) {
      expect(update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          status: to,
          statusChangedAt: expect.any(Date),
        }),
      );
    } else {
      expect(update.mock.calls[0][0].data).not.toHaveProperty(
        'statusChangedAt',
      );
    }
  });
});
