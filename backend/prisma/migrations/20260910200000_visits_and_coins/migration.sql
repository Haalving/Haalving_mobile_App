-- EVERY DAY THE APP IS OPENED IS A STREAK DAY, AND EACH ONE IS TEN COINS.
-- The streak used to be derived from kept sessions and the coin balance was a
-- number the header never received. `client_visits` records the calendar days
-- a client opened the app (one row a day), `coin_entries` is the ledger every
-- coin arrives through, and `clients.coins` is the running balance the header
-- draws — kept in the same transaction as the entry that moved it.
ALTER TABLE "clients" ADD COLUMN "coins" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "client_visits" (
  "id"       TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "date"     DATE NOT NULL,
  "at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_visits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "client_visits_clientId_date_key" ON "client_visits"("clientId", "date");
ALTER TABLE "client_visits"
  ADD CONSTRAINT "client_visits_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "coin_entries" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "amount"    INTEGER NOT NULL,
  "reason"    TEXT NOT NULL,
  "date"      DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coin_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "coin_entries_clientId_idx" ON "coin_entries"("clientId");
ALTER TABLE "coin_entries"
  ADD CONSTRAINT "coin_entries_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
