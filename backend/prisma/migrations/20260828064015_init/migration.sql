-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('client', 'admin', 'opsmgr', 'opshead', 'core', 'doctor', 'dietitian', 'fitness', 'yoga', 'mind', 'hod');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('poorna', 'svayam');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('active', 'paused', 'inactive');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "Track" AS ENUM ('sedentary', 'moderate', 'active');

-- CreateEnum
CREATE TYPE "Dept" AS ENUM ('dietitian', 'fitness', 'yoga', 'mind');

-- CreateEnum
CREATE TYPE "PodSeatKey" AS ENUM ('dietitian', 'fitness', 'yoga', 'mind', 'doctor', 'admin', 'opshead');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('records', 'assessprep', 'assessafter', 'obs4', 'calafter', 'active');

-- CreateTable
CREATE TABLE "roles" (
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shell" TEXT NOT NULL,
    "home" TEXT NOT NULL,
    "nav" TEXT[],
    "perms" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "dept" "Dept",
    "level" INTEGER,
    "joinedAt" TIMESTAMP(3),
    "avail" JSONB NOT NULL DEFAULT '{}',
    "tz" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "tzo" DOUBLE PRECISION NOT NULL DEFAULT 5.5,
    "tzLabel" TEXT NOT NULL DEFAULT 'IST',
    "emergency" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cv" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "designation" TEXT,
    "sex" "Sex" NOT NULL,
    "dob" TIMESTAMP(3),
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "health" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gender" TEXT,
    "address" TEXT,
    "location" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'poorna',
    "humanPillars" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tier" TEXT,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "cycleDay" INTEGER NOT NULL DEFAULT 1,
    "levels" JSONB NOT NULL DEFAULT '{"fitness":1,"culture":1,"yoga":1,"wellness":1}',
    "track" "Track" NOT NULL DEFAULT 'sedentary',
    "observation" BOOLEAN NOT NULL DEFAULT false,
    "status" "ClientStatus" NOT NULL DEFAULT 'active',
    "statusWhy" TEXT,
    "termDays" INTEGER NOT NULL DEFAULT 90,
    "termStart" TIMESTAMP(3),
    "goal" TEXT,
    "purpose" TEXT,
    "tzo" DOUBLE PRECISION NOT NULL DEFAULT 5.5,
    "tzLabel" TEXT NOT NULL DEFAULT 'IST',
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_seats" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "pillar_key" "PodSeatKey" NOT NULL,
    "staffId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "pod_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacity" (
    "staffId" TEXT NOT NULL,
    "declared" INTEGER NOT NULL DEFAULT 0,
    "load" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capacity_pkey" PRIMARY KEY ("staffId")
);

-- CreateTable
CREATE TABLE "pipeline_cards" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "stage" "PipelineStage" NOT NULL,
    "ticks" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'poorna',
    "ownerId" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otps" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "reason" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "replyTargetMin" INTEGER NOT NULL DEFAULT 15,
    "notifyAfterMin" INTEGER NOT NULL DEFAULT 10,
    "escalateAfterMin" INTEGER NOT NULL DEFAULT 15,
    "escalateToRole" TEXT NOT NULL DEFAULT 'admin',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notif_rules" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "body" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notif_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" JSONB NOT NULL DEFAULT '{}',
    "track" TEXT,
    "level" INTEGER,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "title" TEXT,
    "body" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_shape" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "levels" INTEGER NOT NULL DEFAULT 7,
    "cycleDays" INTEGER NOT NULL DEFAULT 14,
    "reviewDay" INTEGER NOT NULL DEFAULT 12,
    "meetingDay" INTEGER NOT NULL DEFAULT 14,
    "restDays" INTEGER[] DEFAULT ARRAY[5, 10]::INTEGER[],
    "termDays" INTEGER NOT NULL DEFAULT 90,
    "sessions" JSONB NOT NULL DEFAULT '{"fitness":5,"yoga":3,"mind":1}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "program_shape_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_dept_idx" ON "users"("dept");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "clients_userId_key" ON "clients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

-- CreateIndex
CREATE INDEX "clients_plan_idx" ON "clients"("plan");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "pod_seats_staffId_idx" ON "pod_seats"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "pod_seats_clientId_pillar_key_key" ON "pod_seats"("clientId", "pillar_key");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_cards_clientId_key" ON "pipeline_cards"("clientId");

-- CreateIndex
CREATE INDEX "pipeline_cards_stage_idx" ON "pipeline_cards"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "otps_phone_expiresAt_idx" ON "otps"("phone", "expiresAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_subjectType_subjectId_idx" ON "audit_logs"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- CreateIndex
CREATE INDEX "catalog_items_pillar_idx" ON "catalog_items"("pillar");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plans_clientId_key" ON "meal_plans"("clientId");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_seats" ADD CONSTRAINT "pod_seats_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_seats" ADD CONSTRAINT "pod_seats_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity" ADD CONSTRAINT "capacity_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_cards" ADD CONSTRAINT "pipeline_cards_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_cards" ADD CONSTRAINT "pipeline_cards_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
