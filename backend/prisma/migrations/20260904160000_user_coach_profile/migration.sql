-- The marketplace listing for a coach: { price, years, rating, spec[] }.
-- Nullable and additive — a seat with none is simply not offered in the app.
-- Replaces a typed module of invented coaches, so a real hire can be listed.
ALTER TABLE "users" ADD COLUMN "coach" JSONB;
