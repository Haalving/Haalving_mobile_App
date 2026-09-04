-- The conversation with somebody who is on the onboarding rail and is not a
-- client yet. Its own table rather than a nullable clientId on circle_messages:
-- the care circle is a room with a pod and five serialisation rules over it, and
-- this is a support thread with the onboarding team.
CREATE TABLE "arrival_messages" (
    "id" TEXT NOT NULL,
    "arrivalId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "fromKind" "MessageFromKind" NOT NULL,
    "text" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arrival_messages_pkey" PRIMARY KEY ("id")
);

-- the room in order; the unique index is also the index a paged reader wants
CREATE UNIQUE INDEX "arrival_messages_arrivalId_seq_key" ON "arrival_messages"("arrivalId", "seq");

ALTER TABLE "arrival_messages" ADD CONSTRAINT "arrival_messages_arrivalId_fkey"
  FOREIGN KEY ("arrivalId") REFERENCES "arrivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- an author who leaves the team does not take the line with them
ALTER TABLE "arrival_messages" ADD CONSTRAINT "arrival_messages_fromUserId_fkey"
  FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
