-- A promotion may be combined with one other combinable promotion on the same
-- order (a price promotion plus a BUY_X_GET_Y group deal). Additive: the old
-- code ignores all three columns, so migrating first is safe.

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN     "combinable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "combinedDiscountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "combinedPromoCode" TEXT;
