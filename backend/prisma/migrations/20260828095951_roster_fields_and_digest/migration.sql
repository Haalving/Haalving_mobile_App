-- CreateEnum
CREATE TYPE "Risk" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "anniv" TIMESTAMP(3),
ADD COLUMN     "compliance" INTEGER,
ADD COLUMN     "lastCycleIndex" JSONB,
ADD COLUMN     "risk" "Risk",
ADD COLUMN     "riskWhy" TEXT,
ADD COLUMN     "sessions" JSONB;

-- CreateTable
CREATE TABLE "digest_entries" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "flag" TEXT,
    "text" TEXT NOT NULL,
    "evidence" TEXT,
    "forDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digest_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "digest_entries_clientId_idx" ON "digest_entries"("clientId");

-- CreateIndex
CREATE INDEX "digest_entries_forDate_idx" ON "digest_entries"("forDate");

-- AddForeignKey
ALTER TABLE "digest_entries" ADD CONSTRAINT "digest_entries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
