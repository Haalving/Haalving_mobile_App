-- CreateEnum
CREATE TYPE "DigestFlag" AS ENUM ('high', 'med');

-- DropIndex
DROP INDEX "digest_entries_forDate_idx";

-- AlterTable
ALTER TABLE "digest_entries" DROP COLUMN "forDate",
ADD COLUMN     "date" DATE NOT NULL,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "flag",
ADD COLUMN     "flag" "DigestFlag",
DROP COLUMN "evidence",
ADD COLUMN     "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "home_seen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tabKey" TEXT NOT NULL,
    "ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_seen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "home_seen_userId_tabKey_key" ON "home_seen"("userId", "tabKey");

-- CreateIndex
CREATE INDEX "digest_entries_date_idx" ON "digest_entries"("date");

-- CreateIndex
CREATE UNIQUE INDEX "digest_entries_date_clientId_key" ON "digest_entries"("date", "clientId");

-- AddForeignKey
ALTER TABLE "home_seen" ADD CONSTRAINT "home_seen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

