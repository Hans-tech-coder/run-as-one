-- Step-up confirmation (PAYMENT_CORRECTION_PLAN.md Batch 0, 2026-11-07): when
-- the newest confirmation an account spent was issued (lib/step-up.ts), so a
-- confirmation token works once. One nullable column per account table
-- instead of a table of used token ids — no rows, no cleanup.
--
-- Additive only: nullable, no default, nothing old reads it.
--
-- Rollback: ALTER TABLE "Organizer" DROP COLUMN "stepUpUsedAt";
--           ALTER TABLE "StaffAccount" DROP COLUMN "stepUpUsedAt";
-- AlterTable
ALTER TABLE "Organizer" ADD COLUMN     "stepUpUsedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StaffAccount" ADD COLUMN     "stepUpUsedAt" TIMESTAMP(3);
