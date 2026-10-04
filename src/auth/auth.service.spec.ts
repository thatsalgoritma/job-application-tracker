import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let savedUser: User | null;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: ConfigService;

  beforeEach(() => {
    savedUser = null;
    const userModel = {
      findUnique: jest.fn(
        async ({ where }: Prisma.UserFindUniqueArgs): Promise<User | null> => {
          if (where.email && savedUser?.email === where.email) return savedUser;
          if (where.id && savedUser?.id === where.id) return savedUser;
          return null;
        },
      ),
      create: jest.fn(
        async ({ data }: Prisma.UserCreateArgs): Promise<User> => {
          savedUser = {
            id: 'user-1',
            email: data.email,
            passwordHash: data.passwordHash,
            emailDigestEnabled: false,
            followUpDays: data.followUpDays ?? 7,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          };
          return savedUser;
        },
      ),
    };

    prisma = { user: userModel } as unknown as PrismaService;
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-test-token'),
    } as unknown as JwtService;
    config = { get: jest.fn().mockReturnValue(7) } as unknown as ConfigService;
    service = new AuthService(prisma, jwt, config);
  });

  it('normalizes email, hashes the password, and returns a safe user with a token', async () => {
    const result = await service.register({
      email: '  Dev@Example.com ',
      password: 'correct horse battery',
    });

    expect(savedUser?.email).toBe('dev@example.com');
    expect(savedUser?.followUpDays).toBe(7);
    expect(savedUser?.passwordHash).not.toBe('correct horse battery');
    await expect(
      bcrypt.compare('correct horse battery', savedUser!.passwordHash),
    ).resolves.toBe(true);
    expect(result).toEqual({
      accessToken: 'signed-test-token',
      user: {
        id: 'user-1',
        email: 'dev@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rejects an email that already has an account', async () => {
    await service.register({
      email: 'dev@example.com',
      password: 'password123',
    });

    await expect(
      service.register({ email: 'DEV@example.com', password: 'password456' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects login when the password is incorrect', async () => {
    await service.register({
      email: 'dev@example.com',
      password: 'password123',
    });

    await expect(
      service.login({ email: 'dev@example.com', password: 'incorrect123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects passwords longer than bcrypt can safely process', async () => {
    await expect(
      service.register({ email: 'dev@example.com', password: '😀'.repeat(19) }),
    ).rejects.toThrow('72 bytes');
  });
});
