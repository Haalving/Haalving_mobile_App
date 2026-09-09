-- THE NEXT CYCLE'S PLAN, WAITING ITS TURN.
-- Approving a template on day 13 replaced the live plan mid-cycle. These columns
-- hold what takes over on day 1 of the next cycle instead; `advanceCycle`
-- promotes them the moment the cycle rolls.
ALTER TABLE "client_plans"
  ADD COLUMN "queuedTemplateId" TEXT,
  ADD COLUMN "queuedOverrides"  JSONB,
  ADD COLUMN "queuedForCycle"   INTEGER,
  ADD COLUMN "queuedById"       TEXT,
  ADD COLUMN "queuedAt"         TIMESTAMP(3);

ALTER TABLE "client_plans"
  ADD CONSTRAINT "client_plans_queuedTemplateId_fkey"
  FOREIGN KEY ("queuedTemplateId") REFERENCES "plan_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_plans"
  ADD CONSTRAINT "client_plans_queuedById_fkey"
  FOREIGN KEY ("queuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "client_plans_queuedTemplateId_idx" ON "client_plans"("queuedTemplateId");
