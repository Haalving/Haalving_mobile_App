-- THE LEVEL-UP RULES, WRITTEN IN CONFIGURATION.
-- What it takes to move up a level used to be read from the bundled reference
-- file (demo-seed.json), so every deployment showed the demo's rulebook and no
-- seat could change it. One row per rulebook now: `culture` (Fuel's gates and
-- level goals), `body` (Power's and Flow's session bars and level goals) and
-- `wellness` (Peace's sleep, screen and practice per level). Nothing seeds these
-- in production — a rulebook nobody has written shows nothing on the phone.
CREATE TABLE "level_criteria" (
  "key"         TEXT NOT NULL,
  "body"        JSONB NOT NULL,
  "updatedById" TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "level_criteria_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "level_criteria"
  ADD CONSTRAINT "level_criteria_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
