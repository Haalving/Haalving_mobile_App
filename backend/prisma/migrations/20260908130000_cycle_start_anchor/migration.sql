-- THE PLAN NEEDS A DATE TO COUNT FROM.
--
-- The calendar derived day one as "today minus (cycleDay - 1)", which pins today
-- to the stored day for ever: the dates advanced every morning, the cycle day
-- never did. `cycleStart` is the real calendar date day 1 fell on.
ALTER TABLE "clients" ADD COLUMN "cycleStart" DATE;

-- Backfill so nobody's day moves under them: the date that makes today the day
-- they are on right now.
UPDATE "clients"
   SET "cycleStart" = (CURRENT_DATE - (("cycleDay" - 1) || ' days')::interval)::date
 WHERE "cycleStart" IS NULL;
