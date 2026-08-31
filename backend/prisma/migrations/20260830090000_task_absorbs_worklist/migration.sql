-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "due" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "pill" TEXT,
ADD COLUMN     "sourceRule" TEXT,
ADD COLUMN     "workType" "WorklistType",
ALTER COLUMN "date" DROP NOT NULL,
ALTER COLUMN "startMin" DROP NOT NULL,
ALTER COLUMN "durMin" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────
-- Move the work list into `tasks`.
--
-- The two screens were two tables kept apart by hand. One row, read two ways,
-- is what makes "a task created in the Schedule appears in the Work Queue" true
-- by construction rather than by a mirror write somebody has to remember.
--
-- The ids are CARRIED OVER (w1..w6) rather than regenerated: the seed upserts on
-- them, and a traceable id is worth more here than a uniform cuid.
--
-- `worklist_items` IS NOT DROPPED. Until every reader is switched and verified,
-- the old table is the way back. A later migration removes it.
INSERT INTO "tasks" (
  "id", "title", "kind", "clientId", "pillar",
  "date", "startMin", "durMin",
  "ownerId", "workType", "due", "pill",
  "recurFreq", "assigneeIds", "groupIds", "allowOverlap", "createdAt", "updatedAt"
)
SELECT
  w."id",
  w."text",
  -- a queue row is INTERNAL on a calendar it will never appear on; `workType`
  -- below carries what the work actually is
  'internal'::"TaskKind",
  w."clientId",
  w."pillar",
  NULL, NULL, NULL,            -- no slot: this is what makes it queue-only
  w."ownerId",
  w."type",
  w."due",
  w."pill",
  'none'::"RecurFreq",
  ARRAY[w."ownerId"],          -- the owner is also the assignee of their own work
  ARRAY[]::text[],
  false,
  w."createdAt",
  NOW()
FROM "worklist_items" w
-- The owner is a foreign key on `tasks`. One work row pointing at a user who is
-- no longer there would abort the entire migration, taking the schema change
-- with it — so an orphan is skipped rather than allowed to block the deploy.
WHERE EXISTS (SELECT 1 FROM "users" u WHERE u."id" = w."ownerId")
ON CONFLICT ("id") DO NOTHING;

-- A row somebody had already ticked keeps its completion. Unscheduled work is
-- done ONCE, so the (taskId, date) pair a TaskDone needs takes the day it was
-- closed — which is also the honest record of when the work was finished.
INSERT INTO "task_dones" ("id", "taskId", "date", "byId", "at")
SELECT
  md5(random()::text || clock_timestamp()::text),   -- always available, unlike gen_random_uuid() on some builds
  w."id",
  w."doneAt"::date,
  w."doneById",
  w."doneAt"
FROM "worklist_items" w
WHERE w."status" = 'DONE'
  AND w."doneAt" IS NOT NULL
  -- only for rows that actually made it across above
  AND EXISTS (SELECT 1 FROM "tasks" t WHERE t."id" = w."id")
ON CONFLICT ("taskId", "date") DO NOTHING;
