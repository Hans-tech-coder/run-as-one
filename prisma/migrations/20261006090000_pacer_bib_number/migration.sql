-- A pacer's race bib, so the public results can keep a pacer off the Race
-- Winners podium and tag them on the full leaderboard. Optional because a bib
-- is often assigned after the pacer's code is sent; staff fill it in later.
-- Nullable and additive: every existing promo code and pacer keeps working.
-- Rollback: ALTER TABLE "PromoCode" DROP COLUMN "bibNumber";
ALTER TABLE "PromoCode" ADD COLUMN "bibNumber" TEXT;
