-- ONE SIGN-OFF IN FLIGHT PER TEMPLATE.
--
-- The Catalog checks before it sends and the board checks before it resubmits,
-- but two sends racing past the same check would both succeed. This partial
-- unique index is the line the database holds: a template may have any number
-- of sign-offs in its history, and at most one of them SUBMITTED at a time.
-- Prisma's schema language cannot state a partial index, so it lives here;
-- `prisma migrate deploy` applies it and `queues.service.submit` maps the
-- violation (P2002) back to the same 409 TEMPLATE_IN_FLIGHT the check gives.
CREATE UNIQUE INDEX "approvals_one_in_flight_per_template"
  ON "approvals"("templateId")
  WHERE "status" = 'SUBMITTED' AND "templateId" IS NOT NULL;
