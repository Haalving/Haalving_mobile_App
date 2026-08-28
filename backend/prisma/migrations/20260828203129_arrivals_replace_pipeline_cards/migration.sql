-- CreateEnum
CREATE TYPE "ArrivalSource" AS ENUM ('sales', 'self', 'referral');

-- CreateEnum
CREATE TYPE "ArrivalStatus" AS ENUM ('ACTIVE', 'PROMOTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ArrivalEventKind" AS ENUM ('TICK', 'UNTICK', 'CLOSE_STEP', 'STEP_BACK', 'FIX_OPENED', 'PLAN_SET', 'NOTE', 'ALLOCATED', 'INBODY', 'WELCOME', 'PROMOTED', 'DENIED');

-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'CARD';

-- CreateTable
CREATE TABLE "arrivals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'poorna',
    "source" "ArrivalSource" NOT NULL DEFAULT 'sales',
    "note" TEXT,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "step" TEXT NOT NULL DEFAULT 'records',
    "ticks" JSONB NOT NULL DEFAULT '{}',
    "healed" JSONB NOT NULL DEFAULT '{}',
    "flowVersion" TEXT NOT NULL,
    "podSeats" JSONB NOT NULL DEFAULT '{}',
    "inbody" JSONB,
    "welcomedAt" TIMESTAMP(3),
    "welcomeText" TEXT,
    "status" "ArrivalStatus" NOT NULL DEFAULT 'ACTIVE',
    "promotedClientId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arrivals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arrival_events" (
    "id" TEXT NOT NULL,
    "arrivalId" TEXT NOT NULL,
    "kind" "ArrivalEventKind" NOT NULL,
    "stepKey" TEXT,
    "taskIndex" INTEGER,
    "byId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arrival_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arrivals_promotedClientId_key" ON "arrivals"("promotedClientId");

-- CreateIndex
CREATE INDEX "arrivals_status_idx" ON "arrivals"("status");

-- CreateIndex
CREATE INDEX "arrivals_step_idx" ON "arrivals"("step");

-- CreateIndex
CREATE INDEX "arrival_events_arrivalId_at_idx" ON "arrival_events"("arrivalId", "at");

-- AddForeignKey
ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_promotedClientId_fkey" FOREIGN KEY ("promotedClientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrival_events" ADD CONSTRAINT "arrival_events_arrivalId_fkey" FOREIGN KEY ("arrivalId") REFERENCES "arrivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrival_events" ADD CONSTRAINT "arrival_events_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Carry the five arrivals across BEFORE the old table goes.
--
-- Prisma's generated diff dropped pipeline_cards before creating arrivals, which
-- would have thrown the rows away. Arrivals are not clients and never were, so
-- the rows move rather than being re-seeded: an arrival that has walked six steps
-- is somebody's afternoon of work.
--
-- `stage` was a five-value enum that could not express the SOP's twelve steps.
-- Every value it did carry is a real FLOW key except 'active', which meant "this
-- one already became a client" — that maps to status PROMOTED, and the client it
-- became is the clientId the row already held.
--
-- `healed` is left empty on purpose: the seed runs healTicks over these rows and
-- fills in the ticks of every step behind the one they stand on.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "arrivals" (
  "id", "name", "phone", "email", "plan", "source", "note",
  "arrivedAt", "step", "ticks", "healed", "flowVersion", "podSeats",
  "status", "promotedClientId", "createdById", "createdAt", "updatedAt"
)
SELECT
  pc."id",
  pc."name",
  NULL, NULL,
  pc."plan",
  'sales'::"ArrivalSource",
  pc."note",
  pc."enteredAt",
  CASE WHEN pc."stage"::text = 'active' THEN 'calafter' ELSE pc."stage"::text END,
  pc."ticks",
  '{}'::jsonb,
  'HAAL/QMS/OP/2026/01/00',
  '{}'::jsonb,
  CASE WHEN pc."stage"::text = 'active' THEN 'PROMOTED'::"ArrivalStatus" ELSE 'ACTIVE'::"ArrivalStatus" END,
  pc."clientId",
  pc."ownerId",
  pc."enteredAt",
  pc."updatedAt"
FROM "pipeline_cards" pc;

-- DropForeignKey
ALTER TABLE "pipeline_cards" DROP CONSTRAINT "pipeline_cards_clientId_fkey";

-- DropForeignKey
ALTER TABLE "pipeline_cards" DROP CONSTRAINT "pipeline_cards_ownerId_fkey";

-- DropTable
DROP TABLE "pipeline_cards";

-- DropEnum
DROP TYPE "PipelineStage";
