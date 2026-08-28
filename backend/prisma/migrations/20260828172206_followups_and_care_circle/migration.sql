-- CreateEnum
CREATE TYPE "MessageFromKind" AS ENUM ('STAFF', 'CLIENT', 'AI');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'TEAMONLY', 'PROMO', 'WISH');

-- CreateEnum
CREATE TYPE "FollowupSource" AS ENUM ('AI', 'COACH');

-- CreateEnum
CREATE TYPE "FollowupStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'RETURNED', 'SENT', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DismissReason" AS ENUM ('ALREADY_HANDLED_IN_PERSON', 'CLIENT_REACHED_OUT_FIRST', 'NOT_THE_RIGHT_MOMENT', 'TONE_NEEDS_REWORK', 'DUPLICATE_NUDGE');

-- CreateTable
CREATE TABLE "circle_messages" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "fromKind" "MessageFromKind" NOT NULL,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "text" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circle_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "followup_drafts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "status" "FollowupStatus" NOT NULL,
    "source" "FollowupSource" NOT NULL,
    "createdById" TEXT,
    "editedById" TEXT,
    "editedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "returnNote" TEXT,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "circleMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "followup_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "followup_dismissals" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reason" "DismissReason" NOT NULL,
    "byId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "followup_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "circle_messages_clientId_seq_key" ON "circle_messages"("clientId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "followup_drafts_circleMessageId_key" ON "followup_drafts"("circleMessageId");

-- CreateIndex
CREATE INDEX "followup_drafts_clientId_idx" ON "followup_drafts"("clientId");

-- CreateIndex
CREATE INDEX "followup_drafts_status_idx" ON "followup_drafts"("status");

-- CreateIndex
CREATE INDEX "followup_drafts_createdById_idx" ON "followup_drafts"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "followup_dismissals_draftId_key" ON "followup_dismissals"("draftId");

-- CreateIndex
CREATE INDEX "followup_dismissals_clientId_idx" ON "followup_dismissals"("clientId");

-- CreateIndex
CREATE INDEX "followup_dismissals_reason_idx" ON "followup_dismissals"("reason");

-- AddForeignKey
ALTER TABLE "circle_messages" ADD CONSTRAINT "circle_messages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_messages" ADD CONSTRAINT "circle_messages_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_drafts" ADD CONSTRAINT "followup_drafts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_drafts" ADD CONSTRAINT "followup_drafts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_drafts" ADD CONSTRAINT "followup_drafts_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_drafts" ADD CONSTRAINT "followup_drafts_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_drafts" ADD CONSTRAINT "followup_drafts_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_drafts" ADD CONSTRAINT "followup_drafts_circleMessageId_fkey" FOREIGN KEY ("circleMessageId") REFERENCES "circle_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_dismissals" ADD CONSTRAINT "followup_dismissals_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "followup_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_dismissals" ADD CONSTRAINT "followup_dismissals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_dismissals" ADD CONSTRAINT "followup_dismissals_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

