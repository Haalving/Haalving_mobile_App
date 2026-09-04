-- The arrival's own record of what the person said when they signed up:
-- { goals[], conditions[], fitness }. Nullable and additive — every arrival
-- written before self-sign-up simply has none, which is the truth about them.
-- `birthClient` carries it onto the Client's typed columns at promotion.
ALTER TABLE "arrivals" ADD COLUMN "intake" JSONB;
