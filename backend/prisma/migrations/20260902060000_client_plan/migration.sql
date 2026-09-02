-- Which template a client is on, one row per pillar.
--
-- The join the Catalog and the Schedule were missing: a PlanTemplate is written
-- once for a level and a track, and this is where one gets chosen FOR A PERSON.
--
-- Additive only. Nothing reads this table until the Plan tab does, so applying it
-- cannot change what any existing screen shows.
CREATE TABLE "client_plans" (
    "id"           TEXT NOT NULL,
    "clientId"     TEXT NOT NULL,
    "pillar"       TEXT NOT NULL,
    -- NULL means the pillar has been called but no plan chosen yet. A missing ROW
    -- means it was never opened. Two different states, said differently on screen.
    "templateId"   TEXT,
    "draft"        BOOLEAN NOT NULL DEFAULT true,
    "assignedById" TEXT,
    "assignedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_plans_pkey" PRIMARY KEY ("id")
);

-- one plan per pillar per client: reassigning REPLACES, and the audit trail is
-- what remembers the old one
CREATE UNIQUE INDEX "client_plans_clientId_pillar_key" ON "client_plans"("clientId", "pillar");
CREATE INDEX "client_plans_templateId_idx" ON "client_plans"("templateId");

ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, not CASCADE: deleting a template must not silently delete the record
-- that a client was put on it. The row survives as "called, not chosen".
ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "plan_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
