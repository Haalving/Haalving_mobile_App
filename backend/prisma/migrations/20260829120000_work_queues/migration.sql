-- CreateEnum
CREATE TYPE "WorklistType" AS ENUM ('TASK', 'RATING', 'REVIEW', 'REPORT');

-- CreateEnum
CREATE TYPE "WorklistStatus" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ApprovalAct" AS ENUM ('SUBMITTED', 'APPROVED', 'RETURNED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "MedicalStatus" AS ENUM ('PENDING', 'READY');

-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'RATING';

-- CreateTable
CREATE TABLE "worklist_items" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "due" TEXT NOT NULL,
    "pill" TEXT NOT NULL,
    "status" "WorklistStatus" NOT NULL DEFAULT 'OPEN',
    "pillar" TEXT,
    "type" "WorklistType" NOT NULL DEFAULT 'TASK',
    "clientId" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "type" "ChainKind" NOT NULL,
    "clientId" TEXT,
    "prospect" TEXT,
    "pillar" TEXT,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "stage" INTEGER NOT NULL DEFAULT 0,
    "due" TEXT NOT NULL,
    "aiDraft" TEXT NOT NULL,
    "returnReason" TEXT,
    "chain" JSONB NOT NULL,
    "chainVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_events" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "act" "ApprovalAct" NOT NULL,
    "byId" TEXT,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meals" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "fullness" TEXT NOT NULL,
    "photo" TEXT,
    "dishes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiStars" INTEGER NOT NULL,
    "aiConf" INTEGER NOT NULL,
    "aiDetected" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiNote" TEXT NOT NULL,
    "finalStars" INTEGER,
    "finalById" TEXT,
    "finalNote" TEXT,
    "finalVoiceSec" INTEGER,
    "ratedAt" TIMESTAMP(3),
    "rubric" JSONB,
    "protein" INTEGER NOT NULL DEFAULT 0,
    "kcal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_summaries" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "prospect" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "uploadedOn" TEXT NOT NULL,
    "status" "MedicalStatus" NOT NULL DEFAULT 'PENDING',
    "byId" TEXT,
    "signedAt" TIMESTAMP(3),
    "body" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deviations" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deviations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worklist_items_ownerId_status_idx" ON "worklist_items"("ownerId", "status");

-- CreateIndex
CREATE INDEX "worklist_items_clientId_idx" ON "worklist_items"("clientId");

-- CreateIndex
CREATE INDEX "approvals_status_idx" ON "approvals"("status");

-- CreateIndex
CREATE INDEX "approvals_ownerId_idx" ON "approvals"("ownerId");

-- CreateIndex
CREATE INDEX "approvals_clientId_idx" ON "approvals"("clientId");

-- CreateIndex
CREATE INDEX "approval_events_approvalId_at_idx" ON "approval_events"("approvalId", "at");

-- CreateIndex
CREATE INDEX "meals_clientId_idx" ON "meals"("clientId");

-- CreateIndex
CREATE INDEX "meals_finalStars_idx" ON "meals"("finalStars");

-- CreateIndex
CREATE INDEX "medical_summaries_status_idx" ON "medical_summaries"("status");

-- CreateIndex
CREATE INDEX "medical_summaries_clientId_idx" ON "medical_summaries"("clientId");

-- CreateIndex
CREATE INDEX "deviations_clientId_idx" ON "deviations"("clientId");

-- CreateIndex
CREATE INDEX "deviations_at_idx" ON "deviations"("at");

-- AddForeignKey
ALTER TABLE "worklist_items" ADD CONSTRAINT "worklist_items_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worklist_items" ADD CONSTRAINT "worklist_items_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worklist_items" ADD CONSTRAINT "worklist_items_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_finalById_fkey" FOREIGN KEY ("finalById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_summaries" ADD CONSTRAINT "medical_summaries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_summaries" ADD CONSTRAINT "medical_summaries_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deviations" ADD CONSTRAINT "deviations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

