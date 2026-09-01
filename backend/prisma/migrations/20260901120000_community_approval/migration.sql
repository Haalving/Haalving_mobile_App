-- Challenges, game days and zones learn the gate gatherings already have.
--
-- ONE MIGRATION FOR THREE TABLES, and additive throughout: eleven nullable
-- columns, six foreign keys, three indexes. No CREATE TYPE and no ALTER TYPE.
-- State is a timestamp, as on gatherings:
--
--   approved = "approvedAt" IS NOT NULL
--   returned = "approvedAt" IS NULL AND "returnNote" IS NOT NULL
--
-- Zone already carries "createdById" from the day it was written, so it gains
-- three columns rather than four. That asymmetry is the schema being honest about
-- what was already there rather than adding a second way to say the same thing.

ALTER TABLE "challenges"
  ADD COLUMN "createdById"  TEXT,
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt"   TIMESTAMP(3),
  ADD COLUMN "returnNote"   TEXT;

ALTER TABLE "game_days"
  ADD COLUMN "createdById"  TEXT,
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt"   TIMESTAMP(3),
  ADD COLUMN "returnNote"   TEXT;

ALTER TABLE "zones"
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt"   TIMESTAMP(3),
  ADD COLUMN "returnNote"   TEXT;

-- EVERYTHING THAT ALREADY EXISTS IS LIVE CONTENT. The demo's three challenges,
-- five game days and one zone are on clients' pages today; leaving them pending
-- would land this as a deletion rather than a gate, exactly as it would have for
-- gatherings.
UPDATE "challenges" SET "approvedAt" = now() WHERE "approvedAt" IS NULL;
UPDATE "game_days"  SET "approvedAt" = now() WHERE "approvedAt" IS NULL;
UPDATE "zones"      SET "approvedAt" = now() WHERE "approvedAt" IS NULL;

-- SetNull throughout: community content outlives whoever wrote or approved it,
-- and deactivating a colleague must not delete the calendar.
ALTER TABLE "challenges"
  ADD CONSTRAINT "challenges_createdById_fkey"  FOREIGN KEY ("createdById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "challenges_approvedById_fkey" FOREIGN KEY ("approvedById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "game_days"
  ADD CONSTRAINT "game_days_createdById_fkey"  FOREIGN KEY ("createdById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "game_days_approvedById_fkey" FOREIGN KEY ("approvedById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "zones"
  ADD CONSTRAINT "zones_approvedById_fkey" FOREIGN KEY ("approvedById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "challenges_approvedAt_idx" ON "challenges"("approvedAt");
CREATE INDEX "game_days_approvedAt_idx"  ON "game_days"("approvedAt");
CREATE INDEX "zones_approvedAt_idx"      ON "zones"("approvedAt");
