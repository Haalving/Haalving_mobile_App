-- AlterTable
ALTER TABLE "approvals" ADD COLUMN     "templateId" TEXT;

-- CreateIndex
CREATE INDEX "approvals_templateId_idx" ON "approvals"("templateId");

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "plan_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

