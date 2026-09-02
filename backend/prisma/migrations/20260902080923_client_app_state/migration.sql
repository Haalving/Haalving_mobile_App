-- CreateTable
CREATE TABLE "client_prefs" (
    "clientId" TEXT NOT NULL,
    "notifPrefs" JSONB NOT NULL DEFAULT '{"water":true,"workout":true,"meals":true,"sleep":false}',
    "consents" JSONB NOT NULL DEFAULT '{"health":true,"mealai":true}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_prefs_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_moods" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "mood" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_moods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_circle_reads" (
    "clientId" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_circle_reads_pkey" PRIMARY KEY ("clientId")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_clientId_idx" ON "push_tokens"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "client_moods_clientId_cycle_day_key" ON "client_moods"("clientId", "cycle", "day");

-- AddForeignKey
ALTER TABLE "client_prefs" ADD CONSTRAINT "client_prefs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_moods" ADD CONSTRAINT "client_moods_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_circle_reads" ADD CONSTRAINT "client_circle_reads_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

