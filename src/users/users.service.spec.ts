import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService settings', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;
  const service = new UsersService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('reads only the requested user preferences', async () => {
    const settings = { emailDigestEnabled: true, followUpDays: 14 };
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(settings as never);

    await expect(service.getSettings('user-1')).resolves.toEqual(settings);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { emailDigestEnabled: true, followUpDays: true },
    });
  });

  it('updates only supplied preferences for the current user', async () => {
    const settings = { emailDigestEnabled: false, followUpDays: 30 };
    jest.spyOn(prisma.user, 'update').mockResolvedValue(settings as never);

    await expect(
      service.updateSettings('user-1', { followUpDays: 30 }),
    ).resolves.toEqual(settings);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { followUpDays: 30 },
      select: { emailDigestEnabled: true, followUpDays: true },
    });
  });
});
