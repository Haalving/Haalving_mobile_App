-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('REASSIGN', 'ACCEPT', 'PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LeaveAct" AS ENUM ('APPLIED', 'REASSIGNED', 'COVER_ACCEPTED', 'COVER_DECLINED', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CoverResponseState" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "NoticeKind" AS ENUM ('LEAVE', 'SLA', 'REMINDER', 'CELEBRATION', 'TASK');

-- AlterTable
ALTER TABLE "task_exceptions" ADD COLUMN     "leaveId" TEXT;

-- CreateTable
CREATE TABLE "leaves" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'REASSIGN',
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_reallocations" (
    "id" TEXT NOT NULL,
    "leaveId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "seatKey" TEXT NOT NULL,
    "toId" TEXT NOT NULL,

    CONSTRAINT "leave_reallocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_session_covers" (
    "id" TEXT NOT NULL,
    "leaveId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "toId" TEXT NOT NULL,

    CONSTRAINT "leave_session_covers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_cover_responses" (
    "id" TEXT NOT NULL,
    "leaveId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "CoverResponseState" NOT NULL DEFAULT 'PENDING',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_cover_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_events" (
    "id" TEXT NOT NULL,
    "leaveId" TEXT NOT NULL,
    "act" "LeaveAct" NOT NULL,
    "byId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_covers" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "seatKey" TEXT NOT NULL,
    "coverId" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "leaveId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_covers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "approverRole" TEXT NOT NULL DEFAULT 'admin',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" "NoticeKind" NOT NULL,
    "text" TEXT NOT NULL,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leaves_staffId_idx" ON "leaves"("staffId");

-- CreateIndex
CREATE INDEX "leaves_status_idx" ON "leaves"("status");

-- CreateIndex
CREATE UNIQUE INDEX "leave_reallocations_leaveId_clientId_seatKey_key" ON "leave_reallocations"("leaveId", "clientId", "seatKey");

-- CreateIndex
CREATE UNIQUE INDEX "leave_session_covers_leaveId_taskId_date_key" ON "leave_session_covers"("leaveId", "taskId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_cover_responses_leaveId_userId_key" ON "leave_cover_responses"("leaveId", "userId");

-- CreateIndex
CREATE INDEX "leave_events_leaveId_at_idx" ON "leave_events"("leaveId", "at");

-- CreateIndex
CREATE INDEX "pod_covers_clientId_seatKey_from_to_idx" ON "pod_covers"("clientId", "seatKey", "from", "to");

-- CreateIndex
CREATE INDEX "notices_toId_createdAt_idx" ON "notices"("toId", "createdAt");

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_reallocations" ADD CONSTRAINT "leave_reallocations_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_reallocations" ADD CONSTRAINT "leave_reallocations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_reallocations" ADD CONSTRAINT "leave_reallocations_toId_fkey" FOREIGN KEY ("toId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_session_covers" ADD CONSTRAINT "leave_session_covers_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_session_covers" ADD CONSTRAINT "leave_session_covers_toId_fkey" FOREIGN KEY ("toId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_cover_responses" ADD CONSTRAINT "leave_cover_responses_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_cover_responses" ADD CONSTRAINT "leave_cover_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_events" ADD CONSTRAINT "leave_events_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_events" ADD CONSTRAINT "leave_events_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_covers" ADD CONSTRAINT "pod_covers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_covers" ADD CONSTRAINT "pod_covers_coverId_fkey" FOREIGN KEY ("coverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_covers" ADD CONSTRAINT "pod_covers_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_toId_fkey" FOREIGN KEY ("toId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

