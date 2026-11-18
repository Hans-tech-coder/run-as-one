-- One payment reference, one payment (PAYMENT_REFERENCE_UNIQUE_PLAN.md
-- Batch 2, lib/payment-reference.ts). Additive.
--
-- 1. A nullable "transactionRef" on Registration, CategoryChange and
--    LogisticsChange: "transactionNumber" normalized (uppercase, letters and
--    digits only), each with a plain index.
-- 2. Backfill from "transactionNumber" where it is not blank. Old rows are
--    not rewritten otherwise (R6).
-- 3. Partial unique indexes on Registration and CategoryChange, over the
--    statuses that hold a reference (R3). None on LogisticsChange: two
--    APPLIED switches from 2026-10 (RM-FF1E56E5-L1, RM-B95DADDC-L1) share one
--    and the owner left them as they are.
--
-- Fails at step 3 if two live orders (or upgrades) already share a
-- reference. Run the scan in docs/current-state.md (payment reference entry)
-- on the target branch first.
--
-- The old code ignores the new columns, so this can run before the deploy.
--
-- Rollback:
--   DROP INDEX "Registration_transactionRef_live_key";
--   DROP INDEX "CategoryChange_transactionRef_live_key";
--   ALTER TABLE "Registration" DROP COLUMN "transactionRef";
--   ALTER TABLE "CategoryChange" DROP COLUMN "transactionRef";
--   ALTER TABLE "LogisticsChange" DROP COLUMN "transactionRef";

-- AlterTable
ALTER TABLE "CategoryChange" ADD COLUMN     "transactionRef" TEXT;

-- AlterTable
ALTER TABLE "LogisticsChange" ADD COLUMN     "transactionRef" TEXT;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "transactionRef" TEXT;

-- Backfill (R2: the same normalization as normalizeReference)
UPDATE "Registration" SET "transactionRef" = upper(regexp_replace("transactionNumber", '[^A-Za-z0-9]', '', 'g'))
  WHERE coalesce(btrim("transactionNumber"), '') <> '';
UPDATE "CategoryChange" SET "transactionRef" = upper(regexp_replace("transactionNumber", '[^A-Za-z0-9]', '', 'g'))
  WHERE coalesce(btrim("transactionNumber"), '') <> '';
UPDATE "LogisticsChange" SET "transactionRef" = upper(regexp_replace("transactionNumber", '[^A-Za-z0-9]', '', 'g'))
  WHERE coalesce(btrim("transactionNumber"), '') <> '';
-- A reference of only punctuation normalizes to nothing; it holds nothing.
UPDATE "Registration" SET "transactionRef" = NULL WHERE "transactionRef" = '';
UPDATE "CategoryChange" SET "transactionRef" = NULL WHERE "transactionRef" = '';
UPDATE "LogisticsChange" SET "transactionRef" = NULL WHERE "transactionRef" = '';

-- CreateIndex
CREATE INDEX "CategoryChange_transactionRef_idx" ON "CategoryChange"("transactionRef");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryChange_transactionRef_live_key" ON "CategoryChange"("transactionRef") WHERE ("transactionRef" IS NOT NULL AND status IN ('AWAITING_PAYMENT', 'APPLIED', 'REFUND_DUE', 'REFUNDED'));

-- CreateIndex
CREATE INDEX "LogisticsChange_transactionRef_idx" ON "LogisticsChange"("transactionRef");

-- CreateIndex
CREATE INDEX "Registration_transactionRef_idx" ON "Registration"("transactionRef");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_transactionRef_live_key" ON "Registration"("transactionRef") WHERE ("transactionRef" IS NOT NULL AND status IN ('PENDING', 'PAID', 'REFUNDED'));
