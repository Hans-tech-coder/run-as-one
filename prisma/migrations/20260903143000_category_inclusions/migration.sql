-- Per-category inclusions. Empty array rather than NULL so reads never have to
-- distinguish "no inclusions" from "not set", and so existing rows are valid
-- without a backfill.
ALTER TABLE "Category" ADD COLUMN "inclusions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
