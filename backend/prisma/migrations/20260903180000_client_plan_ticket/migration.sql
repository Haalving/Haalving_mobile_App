-- THE PLAN IS A TICKET.
--
-- The boolean `draft` said one thing about a whole row — thinking, or live —
-- and could not say what the demo's Plan tab needs to say: WHICH template,
-- WHICH days and WHICH numbers are staged while the client keeps reading the
-- plan they were approved onto. The ticket is the staged draft, a full shadow
-- of the live fields (`ticket`), and the live columns gain the two per-client
-- numbers the demo carries beside the hour: the session dose and the daily
-- targets. `log` is the plan's own history as the tab prints it.
--
-- A DRAFT UNDER THE OLD MODEL WAS A PLAN THE CLIENT COULD NOT READ, and it must
-- stay one. Dropping the column with the template still on the row would have
-- promoted every unapproved assignment to LIVE the moment this ran — the client
-- app reads `templateId IS NOT NULL` — so those rows move onto the ticket first:
-- same template, same overrides, nothing live until somebody approves. Written
-- so it can run twice: a database that already has the ticket columns and no
-- `draft` is left exactly as it is.
--
-- `plan_templates.forClientId` is "Saved from this plan" — a template promoted
-- out of a client's plan remembers the client, which the demo encoded in the id.

ALTER TABLE "client_plans"
  ADD COLUMN IF NOT EXISTS "dose" JSONB,
  ADD COLUMN IF NOT EXISTS "log" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "targets" JSONB,
  ADD COLUMN IF NOT EXISTS "ticket" JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'client_plans' AND column_name = 'draft'
  ) THEN
    UPDATE "client_plans"
       SET "ticket" = jsonb_build_object(
             'templateId', "templateId",
             'overrides', COALESCE("overrides", '{}'::jsonb),
             'byId', "assignedById",
             'at', to_jsonb(now())
           ),
           "templateId"   = NULL,
           "overrides"    = '{}'::jsonb,
           "assignedById" = NULL,
           "assignedAt"   = NULL
     WHERE "draft" = true AND "templateId" IS NOT NULL;

    ALTER TABLE "client_plans" DROP COLUMN "draft";
  END IF;
END $$;

ALTER TABLE "plan_templates" ADD COLUMN IF NOT EXISTS "forClientId" TEXT;

CREATE INDEX IF NOT EXISTS "plan_templates_forClientId_idx" ON "plan_templates"("forClientId");
