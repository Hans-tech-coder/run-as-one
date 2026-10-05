-- How long an unpaid online order keeps its slot once staff have sent the
-- runner a payment link (UNPAID_FOLLOWUP_PLAN.md Batch 3, decision D4).
-- Nullable and additive: every existing order keeps its createdAt-based
-- window, and code that does not know the column keeps working.
-- Rollback: ALTER TABLE "Registration" DROP COLUMN "holdUntil";
ALTER TABLE "Registration" ADD COLUMN "holdUntil" TIMESTAMP(3);
