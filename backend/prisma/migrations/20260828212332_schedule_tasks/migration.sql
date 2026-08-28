-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('session', 'meeting', 'internal', 'duty');

-- CreateEnum
CREATE TYPE "RecurFreq" AS ENUM ('none', 'daily', 'alt', 'weekly');

-- CreateEnum
CREATE TYPE "TaskRespState" AS ENUM ('accepted', 'declined', 'hold', 'resched');

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "TaskKind" NOT NULL,
    "clientId" TEXT,
    "pillar" TEXT,
    "date" DATE NOT NULL,
    "startMin" INTEGER NOT NULL,
    "durMin" INTEGER NOT NULL,
    "recurFreq" "RecurFreq" NOT NULL DEFAULT 'none',
    "recurUntil" DATE,
    "assigneeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "groupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "link" TEXT,
    "notes" TEXT,
    "allowOverlap" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_exceptions" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "startMin" INTEGER,
    "durMin" INTEGER,
    "title" TEXT,
    "link" TEXT,
    "notes" TEXT,
    "coachSwap" JSONB,

    CONSTRAINT "task_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dones" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "byId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_responses" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "TaskRespState" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_proposals" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "byId" TEXT,
    "date" DATE NOT NULL,
    "startMin" INTEGER NOT NULL,
    "durMin" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,

    CONSTRAINT "task_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_date_idx" ON "tasks"("date");

-- CreateIndex
CREATE INDEX "tasks_clientId_idx" ON "tasks"("clientId");

-- CreateIndex
CREATE INDEX "tasks_kind_idx" ON "tasks"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "task_exceptions_taskId_date_key" ON "task_exceptions"("taskId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "task_dones_taskId_date_key" ON "task_dones"("taskId", "date");

-- CreateIndex
CREATE INDEX "task_responses_userId_idx" ON "task_responses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "task_responses_taskId_userId_key" ON "task_responses"("taskId", "userId");

-- CreateIndex
CREATE INDEX "task_proposals_taskId_idx" ON "task_proposals"("taskId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_exceptions" ADD CONSTRAINT "task_exceptions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dones" ADD CONSTRAINT "task_dones_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dones" ADD CONSTRAINT "task_dones_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_responses" ADD CONSTRAINT "task_responses_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_responses" ADD CONSTRAINT "task_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

