import { ApplicationStatus, InterviewType } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { DigestsService, getUtcWeekStart } from './digests.service';

function createDependencies() {
  const followUp = {
    company: 'Acme',
    position: 'Backend Engineer',
    status: ApplicationStatus.APPLIED,
    statusChangedAt: new Date('2026-01-01T00:00:00.000Z'),
    jobUrl: null,
  };
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'person@example.com',
        emailDigestEnabled: true,
        followUpDays: 7,
      }),
    },
    application: {
      findMany: jest.fn().mockResolvedValue([followUp]),
      groupBy: jest
        .fn()
        .mockResolvedValue([
          { status: ApplicationStatus.APPLIED, _count: { _all: 1 } },
        ]),
    },
    interview: { findMany: jest.fn().mockResolvedValue([]) },
    digestLog: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  const mail = {
    send: jest.fn().mockResolvedValue(undefined),
  } as unknown as MailService;
  return { prisma, mail, service: new DigestsService(prisma, mail), followUp };
}

describe('DigestsService', () => {
  it('selects opted-in users and skips a user with no actionable report', async () => {
    const { prisma, mail, service } = createDependencies();
    jest.spyOn(prisma.application, 'findMany').mockResolvedValue([]);

    await service.sendWeeklyDigests(new Date('2026-10-05T09:00:00.000Z'));

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { emailDigestEnabled: true },
      select: { id: true },
    });
    expect(prisma.digestLog.create).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('uses an atomic unique period claim to skip a second send in the same week', async () => {
    const { prisma, mail, service } = createDependencies();
    jest.spyOn(prisma.digestLog, 'create').mockRejectedValue({ code: 'P2002' });

    await expect(service.triggerForUser('user-1')).resolves.toEqual({
      sent: false,
      reason: 'already-sent',
    });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('sends one report and records its successful delivery timestamp', async () => {
    const { prisma, mail, service, followUp } = createDependencies();
    jest.spyOn(prisma.interview, 'findMany').mockResolvedValue([
      {
        type: InterviewType.HR,
        scheduledAt: new Date('2026-10-06T10:00:00.000Z'),
        application: { company: 'Acme', position: 'Backend Engineer' },
      },
    ] as never);

    await expect(service.triggerForUser('user-1')).resolves.toEqual({
      sent: true,
    });
    expect(prisma.digestLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        periodStart: expect.any(Date),
      },
    });
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'person@example.com',
        subject: 'Your weekly job search digest',
        text: expect.stringContaining(followUp.company),
        html: expect.stringContaining('Upcoming interviews'),
      }),
    );
    expect(prisma.digestLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sentAt: expect.any(Date) } }),
    );
  });

  it('releases a failed send claim so it can be retried', async () => {
    const { prisma, mail, service } = createDependencies();
    jest.spyOn(mail, 'send').mockRejectedValue(new Error('SMTP unavailable'));

    await expect(service.triggerForUser('user-1')).rejects.toThrow(
      'SMTP unavailable',
    );
    expect(prisma.digestLog.delete).toHaveBeenCalledWith({
      where: {
        userId_periodStart: { userId: 'user-1', periodStart: expect.any(Date) },
      },
    });
  });

  it('continues processing the remaining users when one send fails', async () => {
    const { prisma, mail, service, followUp } = createDependencies();
    jest
      .spyOn(prisma.user, 'findMany')
      .mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }] as never);
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'user-1',
      email: 'person@example.com',
      emailDigestEnabled: true,
      followUpDays: 7,
    } as never);
    jest
      .spyOn(prisma.application, 'findMany')
      .mockResolvedValue([followUp] as never);
    jest
      .spyOn(mail, 'send')
      .mockRejectedValueOnce(new Error('SMTP unavailable'))
      .mockResolvedValueOnce(undefined);

    await service.sendWeeklyDigests(new Date('2026-10-05T09:00:00.000Z'));

    expect(mail.send).toHaveBeenCalledTimes(2);
    expect(prisma.digestLog.delete).toHaveBeenCalledTimes(1);
    expect(prisma.digestLog.update).toHaveBeenCalledTimes(1);
  });

  it('uses Monday UTC as the idempotency period key', () => {
    expect(getUtcWeekStart(new Date('2026-10-07T18:30:00.000Z'))).toEqual(
      new Date('2026-10-05T00:00:00.000Z'),
    );
  });
});
