import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Authentication endpoints (e2e)', () => {
  let app: INestApplication;
  const users = new Map<string, User>();

  const prismaMock = {
    user: {
      findUnique: jest.fn(({ where, select }: Prisma.UserFindUniqueArgs) => {
        const user = where.email
          ? users.get(where.email)
          : [...users.values()].find((candidate) => candidate.id === where.id);
        if (!user) return null;
        if (select) {
          return {
            id: user.id,
            email: user.email,
            createdAt: user.createdAt,
          };
        }
        return user;
      }),
      create: jest.fn(({ data }: Prisma.UserCreateArgs) => {
        const user: User = {
          id: randomUUID(),
          email: data.email,
          passwordHash: data.passwordHash,
          createdAt: new Date(),
        };
        users.set(user.email, user);
        return user;
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
    await app.init();
  });

  beforeEach(() => users.clear());

  afterAll(async () => {
    await app?.close();
  });

  it('registers, logs in, and returns the current user for a valid JWT', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'Dev@Example.com', password: 'password123' })
      .expect(201);

    expect(registerResponse.body.user.email).toBe('dev@example.com');
    expect(registerResponse.body.user).not.toHaveProperty('passwordHash');
    expect(registerResponse.body.accessToken).toEqual(expect.any(String));

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'dev@example.com', password: 'password123' })
      .expect(200);

    const meResponse = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200);

    expect(meResponse.body).toMatchObject({
      id: registerResponse.body.user.id,
      email: 'dev@example.com',
    });
    expect(meResponse.body).not.toHaveProperty('passwordHash');
  });

  it('returns conflict for duplicate email and rejects invalid DTO data', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'dev@example.com', password: 'password123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'DEV@example.com', password: 'password456' })
      .expect(409);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
  });

  it('protects /me when no valid bearer token is provided', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
  });
});
