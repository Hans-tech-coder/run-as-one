-- Category-price promotions.
--
-- Three of the four kinds of promotion go: PERCENTAGE, FIXED and
-- FREE_DELIVERY. What replaces them is CATEGORY_PRICE -- a second price list
-- for one race, so the 10K can be cut from P1,200 to P900 while the 5K stays
-- where it is. BUY_X_GET_Y is untouched.
--
-- The rows are deleted rather than converted. There is no honest conversion:
-- a percentage is not a price, and guessing one per category would publish
-- numbers the organizer never typed. Registration.promoCode and
-- Registration.discountAmount are snapshots (see promo-redemptions.ts), so no
-- receipt is rewritten by this -- only the ability to redeem those promotions
-- again is removed.
DELETE FROM "PromoCode"
WHERE upper("discountType") IN ('PERCENTAGE', 'FIXED', 'FREE_DELIVERY');
-- One category put on a lower price by one promotion. Only the discounted
-- price is stored; the price it is discounted from is Category.price, read
-- live, so raising a category's price cannot leave a promotion quoting a
-- struck-through number the event page no longer charges.
CREATE TABLE "PromoCategoryPrice" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "PromoCategoryPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCategoryPrice_promoCodeId_categoryId_key" ON "PromoCategoryPrice"("promoCodeId", "categoryId");
CREATE INDEX "PromoCategoryPrice_categoryId_idx" ON "PromoCategoryPrice"("categoryId");

ALTER TABLE "PromoCategoryPrice" ADD CONSTRAINT "PromoCategoryPrice_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCategoryPrice" ADD CONSTRAINT "PromoCategoryPrice_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Both order-level minimums go with them. A per-category price is not a
-- discount an order qualifies for by being big enough, and buy-X-get-Y already
-- carries its own group size, so neither field had a kind of promotion left to
-- condition.
--
-- These two drops are what makes this migration one to run *with* the deploy
-- rather than ahead of it: the build currently on main still selects both
-- columns, so it will fail to read a promotion from the moment they go until
-- the new build is live. The new code never mentions either.
ALTER TABLE "PromoCode" DROP COLUMN "minSubtotal";
ALTER TABLE "PromoCode" DROP COLUMN "minRunners";
