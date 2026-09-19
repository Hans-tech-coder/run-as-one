-- Marketing Discounts Plan Batch 1: the categories a PERCENTAGE or FIXED
-- promotion is restricted to. No rows means every category, so existing
-- promotions need no backfill.
CREATE TABLE "PromoCategory" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "PromoCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromoCategory_categoryId_idx" ON "PromoCategory"("categoryId");

CREATE UNIQUE INDEX "PromoCategory_promoCodeId_categoryId_key" ON "PromoCategory"("promoCodeId", "categoryId");

ALTER TABLE "PromoCategory" ADD CONSTRAINT "PromoCategory_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromoCategory" ADD CONSTRAINT "PromoCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
