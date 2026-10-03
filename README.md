# Job Application Tracker API

Phase 1 project setup for a REST API built with NestJS, TypeScript, PostgreSQL, and Prisma.

<!-- Replace OWNER/REPOSITORY with this GitHub repository's owner and name. -->
[![CI](https://github.com/OWNER/REPOSITORY/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPOSITORY/actions/workflows/ci.yml)

## Prerequisites

- Node.js 20 or later
- PostgreSQL

## Local setup

1. You already have a `job_tracker` database, so you do not need to create another one.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL` to use the PostgreSQL username and password configured on your machine. Set `JWT_SECRET` to a private random value of at least 32 characters. For example:

   ```env
   DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/job_tracker?schema=public"
   JWT_SECRET="a-private-random-secret-with-at-least-32-characters"
   ```

   Replace `YOUR_POSTGRES_PASSWORD` with your local PostgreSQL password. If your local PostgreSQL is configured to allow passwordless connections, omit the password and `:` (for example, `postgresql://postgres@localhost:5432/job_tracker?schema=public`). Keep `.env` local; it is ignored by Git.
3. Install dependencies with `npm install`.
4. Generate the Prisma client with `npm run prisma:generate`.
5. Apply the checked-in first migration with `npm run prisma:migrate:dev`.
6. Start the API with `npm run start:dev`.

If Prisma reports an authentication error, the username/password in `DATABASE_URL` does not match PostgreSQL's settings. You can check whether the same credentials work with `psql -U postgres -h localhost -p 5432 -d job_tracker`; `-W` asks `psql` to prompt for the password.

Your `job_tracker` database currently uses `SQL_ASCII`. It can store ordinary English text, but PostgreSQL cannot reliably validate or convert non-ASCII text such as Turkish characters. For a new local database, prefer UTF-8. For example, connect to the `postgres` database with `psql -U postgres -h localhost -p 5432 -d postgres`, then run `CREATE DATABASE job_tracker_utf8 WITH ENCODING 'UTF8' TEMPLATE template0;` and point `DATABASE_URL` at `job_tracker_utf8`. This keeps the existing database intact.

The API listens on the configured `PORT` (3000 by default). Check `GET /health`; Swagger UI is at `/api`.

## Run with Docker Compose

Docker Compose starts PostgreSQL, applies pending Prisma migrations, and then starts the API. The API production image contains only production dependencies and runs as the non-root `node` user. The separate migration service contains the Prisma CLI; a failed migration prevents the API from starting.

1. Make sure Docker Desktop is running.
2. If you do not already have a local `.env`, copy the example. If `.env` already exists, keep it and add the Docker Compose settings from `.env.example` rather than overwriting it.

   ```powershell
   Copy-Item .env.example .env
   ```

3. In `.env`, set `POSTGRES_PASSWORD` to a private URL-safe password and set `JWT_SECRET` to a private random value of at least 32 characters. `POSTGRES_USER` and `POSTGRES_DB` have defaults. Compose connects the API to its `db` service; the local `DATABASE_URL` is not used by the containers. PostgreSQL is exposed to the host on port `5433` by default to avoid colliding with a local PostgreSQL server.
4. Start the full stack with one command:

   ```powershell
   docker compose up --build
   ```

The API is available at `http://localhost:3000`; Swagger UI is at `http://localhost:3000/api`. The PostgreSQL service uses the named `postgres-data` volume, so `docker compose down` keeps its data. `docker compose down --volumes` removes that data as well.

To view the services later, use `docker compose ps`; to stop the stack, use `docker compose down`.

## Authentication

- `POST /auth/register` accepts an email and password, hashes the password with bcrypt, and returns a one-hour JWT access token plus a safe user profile.
- `POST /auth/login` checks the email and password and returns the same token/profile shape.
- `GET /me` requires `Authorization: Bearer <accessToken>` and returns the current user's safe profile.

Passwords must be at least 8 characters. Because bcrypt processes at most 72 UTF-8 bytes, longer encoded passwords are rejected. Tokens are signed with `JWT_SECRET`; never commit your actual `.env` or secret.

## Checks

- `npm run build` — compile the application.
- `npm run lint` — lint TypeScript files.
- `npm test` — run auth service unit tests.
- `npm run test:e2e` — run health and authentication endpoint tests.
- GitHub Actions runs lint, unit tests, e2e tests, the migration against PostgreSQL, the app build, and a production Docker image build on every push and pull request.

The e2e tests replace `PrismaService` with a small in-memory fake, so they do not need a live database connection. Test-only environment values are supplied by `test/setup-env.ts`.

## Deploy to Render

The checked-in `render.yaml` defines a free Docker web service for the `main` branch. Connect this GitHub repository to Render and create a Blueprint from the repository root. Render waits for the GitHub Actions checks to pass before automatically deploying commits to `main`.

Set `DATABASE_URL` when Render prompts for the secret value. Use a PostgreSQL provider's connection URL (the database must be reachable from Render). Render generates and stores `JWT_SECRET` as a platform environment variable. Neither secret belongs in Git or GitHub Actions because CI uses disposable, test-only credentials.

The container runs `prisma migrate deploy` before starting NestJS. This applies only checked-in migrations and exits before the API starts if a migration fails. Prisma CLI is included in the production image for this startup step. Render's free web service can sleep after 15 minutes without requests and takes about a minute to wake; Render's free PostgreSQL databases expire after 30 days, so use a separate persistent PostgreSQL database for a durable portfolio deployment.

Once the GitHub repository exists, replace `OWNER/REPOSITORY` in the badge URL above with its GitHub owner and repository name.

## Applications and interviews

All resource endpoints require `Authorization: Bearer <accessToken>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/applications` | Create an application (starts at `APPLIED`) |
| `GET` | `/applications` | List the current user's applications |
| `GET` | `/applications/:applicationId` | Read an owned application |
| `PATCH` | `/applications/:applicationId` | Update an owned application |
| `DELETE` | `/applications/:applicationId` | Delete an owned application |
| `POST` | `/applications/:applicationId/interviews` | Add an interview to an owned application |
| `GET` | `/applications/:applicationId/interviews` | List interviews for an owned application |
| `GET` | `/applications/:applicationId/interviews/:interviewId` | Read an interview |
| `PATCH` | `/applications/:applicationId/interviews/:interviewId` | Update an interview |
| `DELETE` | `/applications/:applicationId/interviews/:interviewId` | Delete an interview |

An interview's parent application is checked on every request. Applications move through `APPLIED → SCREENING → INTERVIEW → OFFER`, with `REJECTED` or `WITHDRAWN` allowed as terminal outcomes from active stages. Invalid transitions return `400`. Missing or other users' resources return `404` to avoid exposing whether another user's record exists.

Errors use a shared JSON shape: `statusCode`, `timestamp`, `path`, `message`, and `error`.

### Application list query parameters

`GET /applications` accepts `status`, `company` (case-insensitive partial match), `q` (searches company, position, and notes), `appliedFrom`, and `appliedTo` (ISO 8601 timestamps). Sorting uses `sortBy` (`appliedAt`, `createdAt`, `updatedAt`, `company`, `position`, or `status`) and `sortOrder` (`asc` or `desc`). Pagination uses `page` (default `1`) and `pageSize` (default `20`, maximum `100`). The response contains `data` and `meta` with page, page size, total results, and total pages.

`GET /applications/follow-up?days=7` returns owned applications in `APPLIED`, `SCREENING`, or `INTERVIEW` whose `statusChangedAt` is at least that many days old. The `days` value must be from 1 through 3650.

`GET /applications/stats` returns a zero-filled count for every status. A response is counted for `SCREENING`, `INTERVIEW`, `OFFER`, or `REJECTED`; `WITHDRAWN` is excluded from the response-rate denominator. The response rate is rounded to two decimal places and is `0` when there are no eligible applications.
