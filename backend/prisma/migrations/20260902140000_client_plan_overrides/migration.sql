-- AlterTable
ALTER TABLE "client_plans" ADD COLUMN     "overrides" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "time" TEXT;

