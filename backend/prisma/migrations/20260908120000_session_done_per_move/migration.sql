-- A session is several exercises, and a client finishes them one at a time.
-- `-1` keeps every existing row meaning what it meant: the whole session.
ALTER TABLE "client_session_dones" ADD COLUMN "moveIdx" INTEGER NOT NULL DEFAULT -1;

DROP INDEX IF EXISTS "client_session_dones_clientId_cycle_day_pillar_key";

CREATE UNIQUE INDEX "client_session_dones_clientId_cycle_day_pillar_moveIdx_key"
  ON "client_session_dones" ("clientId", "cycle", "day", "pillar", "moveIdx");
