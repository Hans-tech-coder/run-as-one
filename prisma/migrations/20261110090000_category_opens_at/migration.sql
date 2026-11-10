-- When a Bib + Medal option goes on sale (its schedule). Additive: one
-- nullable column, null meaning "on sale as soon as it is saved", so no
-- backfill and no change for the options that exist today.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "opensAt" TIMESTAMP(3);
