-- The line a client may write with their morning check-in.
--
-- Optional, because the sheet says "only if you want": a required note turns a
-- two-second check-in into homework, and the mood alone is what the coach needs.
-- The console prints these under "Notes behind the check-ins", so NULL means that
-- day has a mood and nothing more.
ALTER TABLE "client_moods" ADD COLUMN "note" TEXT;
