-- Address events by a slug made from their title instead of by their cuid.
--
-- /events/cmtmj0qqe00006getf0b15627 told a runner nothing about which race the
-- link opened. /events/tagaytay-trail-run-2026 does.
--
-- The column arrives nullable so the existing rows can be filled in, then is
-- tightened to NOT NULL and made unique. The old cuid URLs still resolve —
-- the routes match on either — so posters already printed keep working.
ALTER TABLE "Event" ADD COLUMN "slug" TEXT;

-- Backfill: lowercase the title, collapse everything that is not a letter or a
-- digit into single hyphens, cap it at the same 80 characters the application
-- uses, and trim the hyphens that leaves at the ends. A title with nothing
-- sluggable in it (all punctuation, say) falls back to 'event'.
--
-- Duplicate titles are numbered by age, oldest keeping the bare slug, matching
-- what uniqueEventSlug() does for events created from here on.
WITH slugged AS (
    SELECT
        "id",
        "createdAt",
        COALESCE(
            NULLIF(
                trim(BOTH '-' FROM left(regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g'), 80)),
                ''
            ),
            'event'
        ) AS base
    FROM "Event"
),
numbered AS (
    SELECT
        "id",
        base,
        ROW_NUMBER() OVER (PARTITION BY base ORDER BY "createdAt", "id") AS rn
    FROM slugged
)
UPDATE "Event" e
SET "slug" = CASE WHEN n.rn = 1 THEN n.base ELSE n.base || '-' || n.rn END
FROM numbered n
WHERE e."id" = n."id";

ALTER TABLE "Event" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");
