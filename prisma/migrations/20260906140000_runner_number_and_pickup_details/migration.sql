-- Order identity and logistics: which runner on an order this is, and where
-- an on-site pick-up actually happens.
--
-- Until now an order reference covered a whole group: three colleagues who
-- registered together all quoted "RM-D918005C", and nothing distinguished
-- them. And "Allow On-site Pickup (Free)" never said where or when, so the
-- runner who chose it was told nothing at the moment they chose it.

-- Which runner on the order this is, 1..n. Stored rather than derived from row
-- order: createMany gives no read-back order, and a number that changes
-- between two page loads is worse than no number at all.
--
-- Added nullable, backfilled, then made NOT NULL, because every existing row
-- needs a real position and a blanket DEFAULT 1 would make every member of an
-- existing group "runner 1". The order within a registration is the order the
-- rows were written in, which is the order the wizard collected them in.
ALTER TABLE "Runner" ADD COLUMN "runnerNo" INTEGER;

UPDATE "Runner" AS r
SET "runnerNo" = numbered."position"
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "registrationId"
      ORDER BY "createdAt", "id"
    ) AS "position"
  FROM "Runner"
) AS numbered
WHERE r."id" = numbered."id";

ALTER TABLE "Runner" ALTER COLUMN "runnerNo" SET NOT NULL;

-- No default on purpose: the number is a position within an order, so the two
-- checkout routes have to say which one it is. A default would let a future
-- write silently make everyone runner 1.
--
-- The uniqueness is the point of the column. Two runners sharing "-2" on the
-- same order would hand two people the same reference, which is exactly the
-- ambiguity this replaces.
CREATE UNIQUE INDEX "Runner_registrationId_runnerNo_key" ON "Runner"("registrationId", "runnerNo");

-- Where and when a race kit is collected, in the organizer's own words. Null
-- on every existing event, which is honest: none of them ever recorded it, and
-- the wizards fall back to standard wording rather than showing a blank line.
ALTER TABLE "Event" ADD COLUMN "pickupLocation" TEXT;
ALTER TABLE "Event" ADD COLUMN "pickupSchedule" TEXT;
