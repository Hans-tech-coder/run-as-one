-- When an event becomes visible to the public (EVENT_PUBLISH_PLAN.md). Null is
-- a draft; a future instant is a scheduled publish.
--
-- Every event that already exists was public the moment it was created, so the
-- backfill stamps it published as of then. Without it, every live race would
-- vanish from the site the instant the new code shipped.
--
-- Additive: the old code ignores the column, so migrating first is safe. The
-- UPDATE only touches rows still null, so re-running it after the deploy also
-- publishes any event the old code created between this migration and the
-- release.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "publishAt" TIMESTAMP(3);

-- Backfill
UPDATE "Event" SET "publishAt" = "createdAt" WHERE "publishAt" IS NULL;
