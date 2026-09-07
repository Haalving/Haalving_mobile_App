-- A session the CLIENT marks done.
--
-- A cycle day's sessions come from two places: a booked Task (which has a
-- TaskDone) and the plan template (computed, with no row at all). Most days are
-- the second kind, so "mark done" had nothing to write against.
--
-- Keyed cycle/day/pillar — the shape of SessionLogEntry — so these merge straight
-- into the log the calendar grid and the level-up engine already read.
CREATE TABLE "client_session_dones" (
  "id"       TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "cycle"    INTEGER NOT NULL,
  "day"      INTEGER NOT NULL,
  "pillar"   TEXT NOT NULL,
  "status"   TEXT NOT NULL DEFAULT 'done',
  "byId"     TEXT,
  "at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_session_dones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_session_dones_clientId_cycle_day_pillar_key"
  ON "client_session_dones"("clientId", "cycle", "day", "pillar");
CREATE INDEX "client_session_dones_clientId_cycle_idx"
  ON "client_session_dones"("clientId", "cycle");

ALTER TABLE "client_session_dones"
  ADD CONSTRAINT "client_session_dones_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
