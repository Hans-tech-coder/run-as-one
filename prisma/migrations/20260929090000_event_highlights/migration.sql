-- Event highlights: several captioned posters (race kit, trophies, venue,
-- after party) in place of the single race kit poster.
ALTER TABLE "Event" ADD COLUMN "highlights" JSONB NOT NULL DEFAULT '[]';

-- Carry every existing race kit poster over as the first highlight, so no
-- event loses the image it shows today. "raceKitImageUrl" itself is left in
-- place (unread) so production code from before this release keeps working
-- between this migration running and the release going live; it is dropped in
-- a later migration.
UPDATE "Event"
SET "highlights" = jsonb_build_array(
  jsonb_build_object('url', "raceKitImageUrl", 'caption', 'Race Kit')
)
WHERE "raceKitImageUrl" IS NOT NULL AND btrim("raceKitImageUrl") <> '';
