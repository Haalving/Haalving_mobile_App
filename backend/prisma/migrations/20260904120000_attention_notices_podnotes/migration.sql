-- Attention, Pod Notes and the stored half of the client log — plus the columns
-- that turn `notices` from a write-only outbox into something Home can read.
--
-- ADDITIVE THROUGHOUT, and deliberately so: nothing is dropped, nothing renamed,
-- no row rewritten. Every column added to `notices` is nullable or defaulted, so
-- the notices the leave flow wrote months ago stay valid and keep rendering
-- through the work board, which reads only `toId`, `kind`, `text` and `seenAt`.
--
-- `attentions.dedupeKey` is unique because idempotency has to be a fact about the
-- database rather than a convention in the job: the 08:00 sweeps re-detect the
-- same conditions every morning, and the unique index is what makes the second
-- run an UPDATE instead of a second ticket.
--
-- `notices(toId, dedupeKey)` is the same guarantee per recipient — one notice per
-- person per condition. NULL is the ordinary value there and Postgres does not
-- collide nulls, so a one-off notice with no key still writes freely.

-- CreateEnum
CREATE TYPE "AttentionSeverity" AS ENUM ('INFO', 'WATCH', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AttentionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "NoticeStatus" AS ENUM ('UNREAD', 'READ', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "ClientLogType" AS ENUM ('INACTIVITY', 'ATTENTION', 'SYSTEM', 'NOTE');

-- AlterEnum
-- APPENDED, never reordered — the two kinds the sweeps write beside an Attention.
-- Two ADD VALUEs in one migration need PostgreSQL 12 or later; this repo is on 17.
ALTER TYPE "NoticeKind" ADD VALUE 'CLIENT_RISK';
ALTER TYPE "NoticeKind" ADD VALUE 'SLA_BREACH';

-- AlterTable
ALTER TABLE "notices" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "attentionId" TEXT,
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "relatedLogId" TEXT,
ADD COLUMN     "severity" "AttentionSeverity",
ADD COLUMN     "status" "NoticeStatus" NOT NULL DEFAULT 'UNREAD',
ADD COLUMN     "targetRole" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "attentions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "severity" "AttentionSeverity" NOT NULL,
    "status" "AttentionStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dedupeKey" TEXT NOT NULL,
    "assignedToId" TEXT,
    "relatedLogId" TEXT,
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_notes" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pod_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_logs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "ClientLogType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- the idempotency key; see the header
CREATE UNIQUE INDEX "attentions_dedupeKey_key" ON "attentions"("dedupeKey");

-- CreateIndex
CREATE INDEX "attentions_status_severity_idx" ON "attentions"("status", "severity");

-- CreateIndex
CREATE INDEX "attentions_clientId_idx" ON "attentions"("clientId");

-- CreateIndex
CREATE INDEX "attentions_assignedToId_idx" ON "attentions"("assignedToId");

-- CreateIndex
CREATE INDEX "pod_notes_clientId_createdAt_idx" ON "pod_notes"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "client_logs_clientId_createdAt_idx" ON "client_logs"("clientId", "createdAt");

-- CreateIndex
-- what the unread badge counts on
CREATE INDEX "notices_toId_status_idx" ON "notices"("toId", "status");

-- CreateIndex
CREATE INDEX "notices_clientId_idx" ON "notices"("clientId");

-- CreateIndex
-- one notice per person per condition; see the header
CREATE UNIQUE INDEX "notices_toId_dedupeKey_key" ON "notices"("toId", "dedupeKey");

-- AddForeignKey
-- SetNull on both: the notice already went out, and deleting what it pointed at
-- does not unsay it.
ALTER TABLE "notices" ADD CONSTRAINT "notices_attentionId_fkey" FOREIGN KEY ("attentionId") REFERENCES "attentions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_relatedLogId_fkey" FOREIGN KEY ("relatedLogId") REFERENCES "client_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attentions" ADD CONSTRAINT "attentions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- an assignee who leaves the team does not take the ticket with them
ALTER TABLE "attentions" ADD CONSTRAINT "attentions_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attentions" ADD CONSTRAINT "attentions_relatedLogId_fkey" FOREIGN KEY ("relatedLogId") REFERENCES "client_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attentions" ADD CONSTRAINT "attentions_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_notes" ADD CONSTRAINT "pod_notes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- a note outlives the person who wrote it
ALTER TABLE "pod_notes" ADD CONSTRAINT "pod_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_logs" ADD CONSTRAINT "client_logs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- null actor is the 08:00 job, not a missing person
ALTER TABLE "client_logs" ADD CONSTRAINT "client_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
