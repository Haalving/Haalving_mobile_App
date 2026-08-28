-- CreateEnum
CREATE TYPE "ChainKind" AS ENUM ('team', 'goalsheet', 'diet', 'chart', 'level', 'calendar', 'template');

-- CreateEnum
CREATE TYPE "FlowTrigger" AS ENUM ('enrol', 'cycleDay');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "shapeVersion" INTEGER;

-- AlterTable
ALTER TABLE "notif_rules" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'All',
ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'Push',
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "schedule" TEXT NOT NULL DEFAULT 'Daily';

-- AlterTable
ALTER TABLE "program_shape" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "version" SERIAL NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "approval_chains" (
    "kind" "ChainKind" NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_chains_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "flow_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "desc" TEXT,
    "trigger" "FlowTrigger" NOT NULL,
    "defaultOn" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_steps" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "after" INTEGER,
    "on" INTEGER,
    "at" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "flow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_flows" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "on" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_categories" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seeded" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_categories_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "catalog_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flow_steps_templateId_position_idx" ON "flow_steps"("templateId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "client_flows_clientId_templateId_key" ON "client_flows"("clientId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_tags_slug_key" ON "catalog_tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "notif_rules_title_key" ON "notif_rules"("title");

-- CreateIndex
CREATE UNIQUE INDEX "program_shape_version_key" ON "program_shape"("version");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_shapeVersion_fkey" FOREIGN KEY ("shapeVersion") REFERENCES "program_shape"("version") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_shape" ADD CONSTRAINT "program_shape_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_steps" ADD CONSTRAINT "flow_steps_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "flow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_flows" ADD CONSTRAINT "client_flows_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_flows" ADD CONSTRAINT "client_flows_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "flow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

