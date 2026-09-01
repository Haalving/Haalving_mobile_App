-- A gathering learns who put it up and who let it out.
--
-- ADDITIVE ONLY: four nullable columns, two foreign keys, one index. There is no
-- CREATE TYPE and no ALTER TYPE here, deliberately — an ALTER TYPE on an enum is
-- the statement that failed on the deployed database and left every migration
-- blocked behind it. State is a timestamp instead:
--
--   approved  = "approvedAt" IS NOT NULL
--   returned  = "approvedAt" IS NULL AND "returnNote" IS NOT NULL
--   pending   = neither
--
-- the same shape `task_proposals.appliedAt` and `meals.finalStars` already use.

ALTER TABLE "gatherings"
  ADD COLUMN "createdById"  TEXT,
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt"   TIMESTAMP(3),
  ADD COLUMN "returnNote"   TEXT;

-- EVERY GATHERING THAT ALREADY EXISTS IS LIVE CONTENT people can see today.
-- Leaving it pending would land this feature as a deletion: three gatherings
-- vanish from the console and from every client's page the moment it deploys.
-- They were published under the old rule, so they stay published under the new one.
UPDATE "gatherings" SET "approvedAt" = now() WHERE "approvedAt" IS NULL;

-- SetNull, not Cascade: a gathering outlives the person who created or approved
-- it, and deactivating a colleague must not delete the community's calendar.
ALTER TABLE "gatherings"
  ADD CONSTRAINT "gatherings_createdById_fkey" FOREIGN KEY ("createdById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "gatherings_approvedById_fkey" FOREIGN KEY ("approvedById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- the list reads "pending" and "approved" as separate questions on every load
CREATE INDEX "gatherings_approvedAt_idx" ON "gatherings"("approvedAt");
