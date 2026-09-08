-- Promotions that need no code.
--
-- Every promo so far had to be typed by a runner who had been told about it.
-- An early bird is not that: it is a discount tied to a date, and a runner who
-- qualifies for it should not have to know a password to get it. The same is
-- true of "register 5, get 1 free", which a group discovers by being a group
-- rather than by reading a poster.

-- False for every existing row, which is exactly what they are: codes.
ALTER TABLE "PromoCode" ADD COLUMN "automatic" BOOLEAN NOT NULL DEFAULT false;

-- Read on every event page and by both wizards on load. This is the only promo
-- query that runs on a public page, so it is the one that has to be cheap.
CREATE INDEX "PromoCode_organizerId_automatic_idx" ON "PromoCode"("organizerId", "automatic");
