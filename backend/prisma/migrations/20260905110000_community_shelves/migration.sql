-- The hive's two reference shelves: Our Partners, and E-Learning & Content.
--
-- One table for both, because the rows are the same shape. The demo keeps these
-- as constants in the view; they live in the database here because the team adds
-- a partner or publishes a piece without shipping a release.
CREATE TABLE "community_shelf_items" (
  "id"        TEXT NOT NULL,
  "shelf"     TEXT NOT NULL,
  "icon"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "note"      TEXT NOT NULL DEFAULT '',
  "kind"      TEXT,
  "href"      TEXT,
  "position"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "community_shelf_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_shelf_items_shelf_position_idx"
  ON "community_shelf_items"("shelf", "position");
