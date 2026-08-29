-- CreateTable
CREATE TABLE "plan_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "track" TEXT NOT NULL,
    "days" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_templates_pillar_level_idx" ON "plan_templates"("pillar", "level");

-- AddForeignKey
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

