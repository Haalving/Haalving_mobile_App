-- A CHECK-IN BELONGS TO A MORNING, not to a cycle-day.
--
-- `client_moods` was unique on (clientId, cycle, day). `Client.cycleDay` is a
-- stored field that does not advance with the calendar, so a client sitting on
-- day 6 answered once and the arrival band stayed locked for ever: the row
-- written on Tuesday still satisfied Friday's lookup.

-- 1. the new key, nullable while we backfill
ALTER TABLE "client_moods" ADD COLUMN "date" DATE;

-- 2. every existing row belongs to the day it was written
UPDATE "client_moods" SET "date" = ("createdAt" AT TIME ZONE 'UTC')::date WHERE "date" IS NULL;

-- 3. two check-ins on one calendar day cannot both survive the new key. Keep the
--    FIRST — the same rule the write path applies ("the first answer stands").
DELETE FROM "client_moods" a
USING "client_moods" b
WHERE a."clientId" = b."clientId"
  AND a."date" = b."date"
  AND a."createdAt" > b."createdAt";

-- 4. now it can be required
ALTER TABLE "client_moods" ALTER COLUMN "date" SET NOT NULL;

DROP INDEX IF EXISTS "client_moods_clientId_cycle_day_key";
CREATE UNIQUE INDEX "client_moods_clientId_date_key" ON "client_moods"("clientId", "date");
-- the console's emotions chart still reads by cycle-day
CREATE INDEX "client_moods_clientId_cycle_day_idx" ON "client_moods"("clientId", "cycle", "day");
