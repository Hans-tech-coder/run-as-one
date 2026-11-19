-- Which account a bank transfer was paid into (PAYMENT_CHANNELS_PLAN.md
-- Batch 0, lib/payment-channel.ts). Additive.
--
-- A nullable "paidTo" on Registration, CategoryChange and LogisticsChange: a
-- name snapshot of the event's BankAccount.bankName. No backfill: old rows
-- stay null and read "Untagged" (D3). No index: read per event.
--
-- The old code ignores the new columns, so this can run before the deploy.
--
-- Rollback:
--   ALTER TABLE "Registration" DROP COLUMN "paidTo";
--   ALTER TABLE "CategoryChange" DROP COLUMN "paidTo";
--   ALTER TABLE "LogisticsChange" DROP COLUMN "paidTo";

-- AlterTable
ALTER TABLE "CategoryChange" ADD COLUMN     "paidTo" TEXT;

-- AlterTable
ALTER TABLE "LogisticsChange" ADD COLUMN     "paidTo" TEXT;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "paidTo" TEXT;
