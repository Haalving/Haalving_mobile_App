-- CreateEnum
CREATE TYPE "PostKind" AS ENUM ('TEXT', 'PHOTO', 'SHORT', 'QUIZ');

-- CreateEnum
CREATE TYPE "BroadcastKind" AS ENUM ('ANNOUNCEMENT', 'NOTICE');

-- CreateEnum
CREATE TYPE "AudienceMode" AS ENUM ('ALL', 'PLAN', 'COACH', 'PICK');

-- CreateTable
CREATE TABLE "community_members" (
    "clientId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_members_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "gatherings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "when" TEXT NOT NULL DEFAULT '',
    "where" TEXT NOT NULL DEFAULT '',
    "host" TEXT,
    "spots" TEXT,
    "desc" TEXT NOT NULL DEFAULT '',
    "about" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agenda" JSONB NOT NULL DEFAULT '[]',
    "bring" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "img" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gatherings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gathering_enrolments" (
    "gatheringId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gathering_enrolments_pkey" PRIMARY KEY ("gatheringId","clientId")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "host" TEXT,
    "stake" TEXT,
    "desc" TEXT NOT NULL DEFAULT '',
    "about" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "how" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "arc" JSONB NOT NULL DEFAULT '[]',
    "img" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_entries" (
    "challengeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_entries_pkey" PRIMARY KEY ("challengeId","clientId")
);

-- CreateTable
CREATE TABLE "game_days" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_questions" (
    "id" TEXT NOT NULL,
    "gameDayId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT[],
    "answer" INTEGER NOT NULL,
    "why" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "game_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_answers" (
    "questionId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "chose" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_answers_pkey" PRIMARY KEY ("questionId","clientId")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_members" (
    "zoneId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zone_members_pkey" PRIMARY KEY ("zoneId","clientId")
);

-- CreateTable
CREATE TABLE "community_posts" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT,
    "authorId" TEXT,
    "clientId" TEXT,
    "kind" "PostKind" NOT NULL DEFAULT 'TEXT',
    "caption" TEXT NOT NULL DEFAULT '',
    "img" TEXT,
    "secs" INTEGER,
    "quiz" JSONB,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "postId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("postId","clientId")
);

-- CreateTable
CREATE TABLE "post_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "byId" TEXT,
    "clientId" TEXT,
    "text" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_announce_prefs" (
    "clientId" TEXT NOT NULL,
    "on" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_announce_prefs_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "kind" "BroadcastKind" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "img" TEXT NOT NULL DEFAULT '',
    "link" JSONB,
    "audience" JSONB NOT NULL,
    "audienceLabel" TEXT NOT NULL,
    "targeted" INTEGER NOT NULL,
    "delivered" INTEGER NOT NULL,
    "muted" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_deliveries" (
    "broadcastId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "messageId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_deliveries_pkey" PRIMARY KEY ("broadcastId","clientId")
);

-- CreateIndex
CREATE INDEX "gatherings_position_idx" ON "gatherings"("position");

-- CreateIndex
CREATE INDEX "gathering_enrolments_clientId_idx" ON "gathering_enrolments"("clientId");

-- CreateIndex
CREATE INDEX "challenges_position_idx" ON "challenges"("position");

-- CreateIndex
CREATE INDEX "challenge_entries_clientId_idx" ON "challenge_entries"("clientId");

-- CreateIndex
CREATE INDEX "game_days_position_idx" ON "game_days"("position");

-- CreateIndex
CREATE UNIQUE INDEX "game_questions_gameDayId_position_key" ON "game_questions"("gameDayId", "position");

-- CreateIndex
CREATE INDEX "game_answers_clientId_idx" ON "game_answers"("clientId");

-- CreateIndex
CREATE INDEX "zones_position_idx" ON "zones"("position");

-- CreateIndex
CREATE INDEX "zone_members_clientId_idx" ON "zone_members"("clientId");

-- CreateIndex
CREATE INDEX "community_posts_zoneId_postedAt_idx" ON "community_posts"("zoneId", "postedAt");

-- CreateIndex
CREATE INDEX "community_posts_clientId_idx" ON "community_posts"("clientId");

-- CreateIndex
CREATE INDEX "community_posts_pinned_idx" ON "community_posts"("pinned");

-- CreateIndex
CREATE INDEX "post_likes_clientId_idx" ON "post_likes"("clientId");

-- CreateIndex
CREATE INDEX "post_comments_postId_at_idx" ON "post_comments"("postId", "at");

-- CreateIndex
CREATE INDEX "post_comments_clientId_idx" ON "post_comments"("clientId");

-- CreateIndex
CREATE INDEX "broadcasts_sentAt_idx" ON "broadcasts"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_deliveries_messageId_key" ON "broadcast_deliveries"("messageId");

-- CreateIndex
CREATE INDEX "broadcast_deliveries_clientId_idx" ON "broadcast_deliveries"("clientId");

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_enrolments" ADD CONSTRAINT "gathering_enrolments_gatheringId_fkey" FOREIGN KEY ("gatheringId") REFERENCES "gatherings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_enrolments" ADD CONSTRAINT "gathering_enrolments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_questions" ADD CONSTRAINT "game_questions_gameDayId_fkey" FOREIGN KEY ("gameDayId") REFERENCES "game_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_answers" ADD CONSTRAINT "game_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "game_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_answers" ADD CONSTRAINT "game_answers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_members" ADD CONSTRAINT "zone_members_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_members" ADD CONSTRAINT "zone_members_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_announce_prefs" ADD CONSTRAINT "client_announce_prefs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "circle_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

