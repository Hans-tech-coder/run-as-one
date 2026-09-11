-- A fixed position for each of an event's categories.
--
-- Nothing ordered them before this, so every read came back in Postgres's
-- physical row order -- and an UPDATE writes a new row version at the end of
-- the table. Saving an event updates every category it still has, so each save
-- reshuffled the list: "1K PAWMAKER", entered first, came back fourth.
ALTER TABLE "Category" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Existing rows get the order they were created in. Their ids are cuids, which
-- begin with a timestamp and a counter, so sorting an event's categories by id
-- recovers the order the organizer entered them even where the physical order
-- has already been scrambled by an edit.
UPDATE "Category" AS c
SET "sortOrder" = ranked.position
FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "eventId" ORDER BY "id") - 1)::INTEGER AS position
  FROM "Category"
) AS ranked
WHERE c."id" = ranked."id";
