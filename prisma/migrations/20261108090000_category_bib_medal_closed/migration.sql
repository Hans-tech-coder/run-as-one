-- Bib + Medal options and closing one option (BIB_MEDAL_PLAN.md Batch 1).
-- Additive: a nullable link and a defaulted flag, so no backfill and no change
-- for code that does not read them yet.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "bibMedalOfId" TEXT,
ADD COLUMN     "closed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Category_bibMedalOfId_key" ON "Category"("bibMedalOfId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_bibMedalOfId_fkey" FOREIGN KEY ("bibMedalOfId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
