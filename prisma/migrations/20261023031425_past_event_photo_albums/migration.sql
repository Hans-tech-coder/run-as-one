-- One photo album link becomes a list (the owner, 2026-10-23,
-- PAST_EVENTS_PLAN.md D7): a race often has several albums — a page per
-- photographer, a Drive folder beside a Facebook set. Event.photoAlbums is
-- [{ url, label }], read and written only through src/lib/photo-albums.ts.
--
-- Released together with 20261023025133_past_event_photos_timing, which added
-- "photosUrl"; no build ever shipped with that column, so no code reads it.
-- Any link it holds is carried into the list before it is dropped, so the
-- drop loses nothing. Rollback: add "photosUrl" TEXT back, copy
-- "photoAlbums"->0->>'url' into it, drop "photoAlbums".

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "photoAlbums" JSONB NOT NULL DEFAULT '[]';

UPDATE "Event"
SET "photoAlbums" = jsonb_build_array(jsonb_build_object('url', "photosUrl", 'label', ''))
WHERE "photosUrl" IS NOT NULL;

ALTER TABLE "Event" DROP COLUMN "photosUrl";
