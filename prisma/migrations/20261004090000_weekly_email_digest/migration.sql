ALTER TABLE "User"
  ADD COLUMN "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "followUpDays" INTEGER NOT NULL DEFAULT 7;

CREATE TABLE "DigestLog" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "periodStart" DATE NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "DigestLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DigestLog_userId_periodStart_key"
  ON "DigestLog"("userId", "periodStart");
CREATE INDEX "DigestLog_userId_sentAt_idx"
  ON "DigestLog"("userId", "sentAt");

ALTER TABLE "DigestLog"
  ADD CONSTRAINT "DigestLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
