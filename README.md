# Job Application Tracker

[![CI](https://github.com/thatsalgoritma/job-application-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/thatsalgoritma/job-application-tracker/actions/workflows/ci.yml)

A full-stack application for recording job applications, tracking their progress, and organizing interviews. The React frontend connects to a NestJS REST API so job seekers can manage applications, review progress, and follow up on opportunities.

![Application tracker sign-in screen](docs/screenshots/frontend-login.jpg)

## Architecture

```mermaid
flowchart LR
    Browser[React and TypeScript frontend]
    subgraph API[NestJS API]
        Controllers[Controllers and DTO validation]
    Auth[JWT authentication and guards]
    Services[Services and business rules]
    Digest[Weekly digest scheduler and report]
    Mail[MailService and Nodemailer]
    Prisma[PrismaService]
        Controllers --> Auth
        Controllers --> Services
    Services --> Prisma
    Digest --> Prisma
    Digest --> Mail
    end
    DB[(PostgreSQL)]
    Browser -->|HTTPS and JWT| Controllers
    Prisma --> DB
    Mail --> SMTP[SMTP provider or local Mailpit]

    Actions[GitHub Actions\nLint, tests, migrations, build] -->|checks pass on main| Render[Render Docker service]
    Render --> API
    Vercel[Vercel static site] --> Browser
```

## Tech stack

- Node.js 20 and TypeScript
- NestJS modules, controllers, services, and dependency injection
- PostgreSQL with Prisma Client and checked-in migrations
- Passport JWT authentication and bcrypt password hashing
- `class-validator` DTO validation and a consistent exception filter
- Jest and Supertest
- Swagger UI via `@nestjs/swagger`
- Docker, Docker Compose, GitHub Actions, and Render
- React, TypeScript, Vite, and Vercel for the frontend

## Key design decisions

- **Modules by domain:** authentication, applications, interviews, and Prisma have separate modules, keeping responsibilities easy to find and change.
- **DTOs separate from database models:** incoming data is validated at the API boundary before business logic uses it.
- **Ownership enforced in the service layer:** database queries include the authenticated user's ID, preventing access to another user's records even when a resource ID is known. Missing and unowned resources return `404`.
- **Status changes are explicit business rules:** invalid application status transitions return a clear client error; terminal statuses cannot be reopened.
- **Migrations are committed:** local, CI, and deployment environments apply the same schema changes through Prisma migrations. The container applies pending migrations before starting the API.
- **One error response shape:** the global exception filter returns `statusCode`, `timestamp`, `path`, `message`, and `error` consistently.
- **Weekly digest mail is behind an interface:** `MailService` keeps digest logic independent from Nodemailer and SMTP, so a provider can be replaced without changing the scheduler or report builder.
- **Digest delivery is claimed in PostgreSQL:** a unique `(userId, periodStart)` constraint arbitrates competing instances before mail is sent. This prevents two app instances from sending the same weekly digest at the same time.
- **The cron runs inside the API:** it keeps this small project deployable without an additional scheduler service. Every replica runs the cron, so the database claim is required; an external scheduler would avoid duplicate timers but adds infrastructure and still needs idempotent delivery.

## Run locally

Prerequisites: Node.js 20+, npm, and PostgreSQL. Create an empty database named `job_tracker`, then configure the connection string and a private JWT secret in `.env`.

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set `DATABASE_URL` to your local PostgreSQL connection and `JWT_SECRET` to a random value of at least 32 characters. Keep `.env` private; it is ignored by Git.

For local development outside Docker, set `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, and `SMTP_FROM=digest@example.com`; start Mailpit with Docker Compose (steps below) to inspect email without delivering real messages. Digest email is disabled for new users until they opt in through `PATCH /me/settings`.

```powershell
npm ci
npm run prisma:generate
npm run prisma:migrate:dev
npm run start:dev
```

The API listens at `http://localhost:3000`. Health check: `http://localhost:3000/health`.

In another terminal, start the frontend:

```powershell
cd frontend
Copy-Item .env.example .env
npm ci
npm run dev
```

The frontend opens at `http://localhost:5173`. Its local `.env` uses `VITE_API_BASE_URL=http://localhost:3000`; the backend's `FRONTEND_ORIGIN` must include `http://localhost:5173` for CORS.

## Run with Docker Compose

Prerequisite: Docker Desktop with Docker Compose. Copy `.env.example` to `.env` if needed, then set `POSTGRES_PASSWORD` and `JWT_SECRET` to private values. Compose runs PostgreSQL, Mailpit, applies migrations, and starts the API. Open [Mailpit](http://localhost:8025) to inspect locally generated messages; the SMTP listener is on port `1025`.

```powershell
docker compose up --build
```

The API is available at `http://localhost:3000`; PostgreSQL is exposed to the host on port `5433` by default. Data remains in the named `postgres-data` volume after `docker compose down`; `docker compose down --volumes` also removes it.

## Tests and checks

```powershell
npm run lint
npm test
npm run test:e2e
npm run build
```

Frontend checks are run from `frontend`:

```powershell
npm test
npm run build
```

Unit and e2e tests use test doubles for Prisma, so they do not require a local database. GitHub Actions also starts PostgreSQL and applies the migrations, then runs the checks and builds the production Docker image on every push and pull request.

## API overview

Swagger UI: [`/api`](http://localhost:3000/api) when running locally. Resource endpoints require `Authorization: Bearer <accessToken>`.

| Method                   | Endpoint                                    | Purpose                                                                                                                |
| ------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `POST`                   | `/auth/register`                            | Create an account and receive a JWT                                                                                    |
| `POST`                   | `/auth/login`                               | Log in and receive a JWT                                                                                               |
| `GET`                    | `/me`                                       | Read the authenticated user's profile                                                                                  |
| `GET`, `PATCH`           | `/me/settings`                              | Read or update digest opt-in and follow-up days                                                                        |
| `POST`                   | `/applications`                             | Create an application                                                                                                  |
| `GET`                    | `/applications`                             | List, search, filter, sort, and paginate applications                                                                  |
| `GET`                    | `/applications/:id`                         | Read an application                                                                                                    |
| `PATCH`                  | `/applications/:id`                         | Update an application and its status                                                                                   |
| `DELETE`                 | `/applications/:id`                         | Delete an application                                                                                                  |
| `GET`                    | `/applications/follow-up?days=7`            | Find active applications unchanged for the requested number of days                                                    |
| `GET`                    | `/applications/stats`                       | Get counts by status and response rate                                                                                 |
| `GET`, `POST`            | `/applications/:id/interviews`              | List or schedule interviews for an application                                                                         |
| `GET`, `PATCH`, `DELETE` | `/applications/:id/interviews/:interviewId` | Read, update, or delete an interview                                                                                   |
| `GET`                    | `/health`                                   | Check that the API process is responding                                                                               |
| `POST`                   | `/digests/trigger`                          | Send the authenticated user's digest for testing (JWT required; still respects opt-in and weekly duplicate protection) |

Application statuses are `APPLIED`, `SCREENING`, `INTERVIEW`, `OFFER`, `REJECTED`, and `WITHDRAWN`. Filtering supports status, company, applied date range, and text search; list responses include pagination metadata. The response-rate denominator excludes withdrawn applications; rejected applications count as responses.

## Weekly email digest

Users opt in and choose the inactivity threshold through `PATCH /me/settings` with a bearer token and a JSON body such as `{"emailDigestEnabled":true,"followUpDays":10}`. `followUpDays` accepts integers from 1 through 3650. The API checks every opted-in user on the configured weekly schedule and includes active applications whose status has not changed for that user's chosen number of days, counts for each application status, and interviews scheduled in the next seven days. A message is skipped when there are no follow-ups and no upcoming interviews.

`POST /digests/trigger` runs the same flow immediately for the authenticated user, making it useful for local testing. It does not bypass opt-in or send a second digest in the same UTC week. The email contains both plain text and HTML.

| Variable                 | Default              | Purpose                                                                 |
| ------------------------ | -------------------- | ----------------------------------------------------------------------- |
| `DIGEST_CRON`            | `0 9 * * 1`          | Five-field cron schedule, interpreted in UTC (default Monday 09:00 UTC) |
| `DEFAULT_FOLLOW_UP_DAYS` | `7`                  | Initial threshold for newly registered users; each user can change it   |
| `SMTP_HOST`              | `localhost`          | SMTP server hostname; Docker Compose sets this to `mailpit`             |
| `SMTP_PORT`              | `1025`               | SMTP server port; Mailpit listens on 1025                               |
| `SMTP_SECURE`            | `false`              | Enable TLS for SMTP, usually with port 465                              |
| `SMTP_USER`              | empty                | Optional SMTP username                                                  |
| `SMTP_PASSWORD`          | empty                | Optional SMTP password or provider API key                              |
| `SMTP_FROM`              | `digest@example.com` | Sender address                                                          |

For production, configure these SMTP values in the hosting platform's environment settings. For Resend, set `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=resend`, and `SMTP_PASSWORD` to an API key; set `SMTP_FROM` to a sender address verified with the provider. These are Resend's documented SMTP credentials ([Resend SMTP setup](https://resend.com/changelog/smtp-service)). Never commit real mail credentials. When testing locally through Docker Compose, open Mailpit at `http://localhost:8025` and enable the digest on an account that has follow-ups or an upcoming interview.

The database claim is created before SMTP delivery and made unique per user and UTC week. If two Render instances run the cron simultaneously, only one can claim that user's week. The claim is removed when sending fails, so the next manual or scheduled attempt may retry. This avoids ordinary concurrent duplicates; no SMTP integration can guarantee perfect exactly-once delivery if a process crashes after the provider accepts a message but before the database records success.

The cron is hosted inside the API for a simple deployment. All instances run it, hence the database idempotency claim. A separate scheduler would reduce duplicated cron work and isolate scheduling from web traffic, but adds a deployable component and still needs the same database protection for retries and overlapping executions. The Render free service can sleep while idle, so an in-process cron is not a reliable clock there; use an always-on instance or an external scheduler for production delivery guarantees.

## Live demo

The API is deployed on Render:

- [Live API](https://job-application-tracker-api-3x9f.onrender.com/)
- [Swagger UI](https://job-application-tracker-api-3x9f.onrender.com/api)
- [Health check](https://job-application-tracker-api-3x9f.onrender.com/health)

The frontend deploys to Vercel. Once deployed, add its URL here:

- Frontend demo: _add the URL shown by Vercel after the first deploy_

To deploy it, first push this repository state to GitHub. In Vercel, select **Add New → Project**, import `thatsalgoritma/job-application-tracker`, and set **Root Directory** to `frontend`. Vercel should detect Vite; use `npm run build` and `dist` if it asks for the build command and output directory. In **Environment Variables**, add `VITE_API_BASE_URL` with value `https://job-application-tracker-api-3x9f.onrender.com` for the Production environment, then deploy. The [`frontend/vercel.json`](frontend/vercel.json) rewrite lets direct visits and refreshes on `/applications/:id` and `/insights` load the SPA. Copy the production `*.vercel.app` domain into the frontend demo link above. In the Render dashboard, open the API service's **Environment** settings, set `FRONTEND_ORIGIN` to that exact origin (no trailing slash), save, and redeploy the API. The Vercel Hobby plan is free for personal, non-commercial projects, which fits this portfolio demo; it is not intended for commercial use. See [Vercel Hobby plan details](https://vercel.com/docs/plans/hobby), [Vite deployment docs](https://vercel.com/docs/frameworks/frontend/vite), and [Vercel monorepo setup](https://vercel.com/docs/monorepos).

Vercel is used for the frontend because it builds and hosts this Vite app as static files and deploys changes pushed to the connected GitHub repository. The API remains on Render; the browser sends authenticated requests to it over HTTPS. `VITE_API_BASE_URL` is public client configuration compiled into the JavaScript bundle, not a secret.

Render deploys commits to `main` after the GitHub Actions checks pass. Set `DATABASE_URL` and `JWT_SECRET` as Render environment variables; do not commit production secrets. The current Render free service may sleep after inactivity. See [Render's free plan limits](https://render.com/docs/free).

## What I'd improve next

- Add rate limiting and structured request logging, with request IDs for tracing.
- Add a real PostgreSQL integration-test suite in addition to the mocked e2e tests.
- Add refresh-token rotation, account recovery, and email verification.
- Add database backup and restore procedures and deployment monitoring.
