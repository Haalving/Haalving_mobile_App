-- CreateEnum
CREATE TYPE "FeedTag" AS ENUM ('general', 'policy', 'holiday');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cvName" TEXT,
ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "team_posts" (
    "id" TEXT NOT NULL,
    "byId" TEXT,
    "tag" "FeedTag" NOT NULL DEFAULT 'general',
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_feed_reads" (
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_feed_reads_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "team_posts_createdAt_idx" ON "team_posts"("createdAt");

-- AddForeignKey
ALTER TABLE "team_posts" ADD CONSTRAINT "team_posts_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_feed_reads" ADD CONSTRAINT "team_feed_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

