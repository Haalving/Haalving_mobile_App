-- A zone learns who SUBMITTED it, which is not who it reads as.
--
-- `zones.createdById` already exists and is presentational: the Zones tab prints
-- "made by ...", and `createZone` writes NULL on purpose so an official zone reads
-- as HAALVING's rather than as whichever admin typed it. Reusing that column for
-- the approval gate would have quietly changed what that line says on every zone
-- the console creates.
--
-- One nullable column, one foreign key. Additive.
ALTER TABLE "zones" ADD COLUMN "proposedById" TEXT;

ALTER TABLE "zones"
  ADD CONSTRAINT "zones_proposedById_fkey" FOREIGN KEY ("proposedById")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
