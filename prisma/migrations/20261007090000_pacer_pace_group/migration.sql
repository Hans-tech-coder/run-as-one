-- The pace group a pacer leads ("SUB1", "1:00 pace group"), printed on that
-- pacer's e-certificate. Optional: staff set it on the Pacers screen when the
-- groups are decided. Nullable and additive: every existing promo code and
-- pacer keeps working, and the code before this ignores the column.
-- Rollback: ALTER TABLE "PromoCode" DROP COLUMN "paceGroup";
ALTER TABLE "PromoCode" ADD COLUMN "paceGroup" TEXT;
