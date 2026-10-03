FROM node:20-alpine AS base

WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS dependencies

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN DATABASE_URL="postgresql://postgres:build-only@localhost:5432/job_tracker?schema=public" \
  npx prisma generate

FROM dependencies AS builder

COPY nest-cli.json tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM dependencies AS migrator

USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM node:20-alpine AS production-dependencies

WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apk add --no-cache openssl

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node prisma ./prisma

USER node
EXPOSE 3000
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
