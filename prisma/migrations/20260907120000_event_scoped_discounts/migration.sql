-- Discounts a runner can actually redeem.
--
-- PromoCode existed before this migration but was never wired into checkout:
-- an organizer could create a code and nothing anywhere could spend it. These
-- columns are the conditions half of that feature, and the two on Registration
-- are what a redemption leaves behind.

-- Which event the code is for. Null means every event this organizer runs,
-- which is what every code created before scoping existed already was -- so
-- there is nothing to backfill and no existing code changes meaning.
ALTER TABLE "PromoCode" ADD COLUMN "eventId" TEXT;

-- The conditions. All nullable, all meaning "no condition", so an existing
-- code keeps applying exactly as it did.
ALTER TABLE "PromoCode" ADD COLUMN "minSubtotal" INTEGER;
ALTER TABLE "PromoCode" ADD COLUMN "minRunners" INTEGER;

-- BUY_X_GET_Y only: "register 5, the 6th is free" is 5 and 1.
ALTER TABLE "PromoCode" ADD COLUMN "buyQuantity" INTEGER;
ALTER TABLE "PromoCode" ADD COLUMN "getQuantity" INTEGER;

-- The batch a bulk-generated single-use voucher was born in, so two hundred
-- codes read as one promotion in the admin rather than two hundred rows.
ALTER TABLE "PromoCode" ADD COLUMN "batchLabel" TEXT;

ALTER TABLE "PromoCode"
  ADD CONSTRAINT "PromoCode_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Uniqueness moves from the code alone to the code within its organizer. A
-- runner-facing lookup now always arrives through an event, so we know whose
-- code we are looking for; the global constraint only meant the second
-- organizer to think of "EARLYBIRD" could not have it. Every existing row
-- satisfies the narrower constraint by construction, since it satisfied the
-- wider one.
DROP INDEX "PromoCode_code_key";
CREATE UNIQUE INDEX "PromoCode_organizerId_code_key" ON "PromoCode"("organizerId", "code");

-- Read on every code lookup and on the marketing screen's grouping.
CREATE INDEX "PromoCode_eventId_idx" ON "PromoCode"("eventId");
CREATE INDEX "PromoCode_organizerId_batchLabel_idx" ON "PromoCode"("organizerId", "batchLabel");

-- What a redemption leaves on the order. Not backfilled and deliberately so:
-- no registration before this migration was given a discount, and 0 with a
-- null code is the honest record of that rather than an approximation.
ALTER TABLE "Registration" ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Registration" ADD COLUMN "promoCode" TEXT;
