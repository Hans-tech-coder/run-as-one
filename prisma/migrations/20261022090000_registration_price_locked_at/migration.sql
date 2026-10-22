-- The promo price lock on the order itself (PROMO_PRICE_LOCK_PLAN.md §7,
-- approved 2026-10-22): when the runner's lock was taken, on an order the
-- lock priced. Until now only the `Price lock held:` log line recorded it,
-- and Vercel Hobby keeps runtime logs too briefly to answer a complaint.
--
-- Additive and nullable: no backfill (orders before this column were priced
-- without a stored lock time), the old code ignores it, so migrating before
-- the deploy is safe. Rollback is dropping "Registration"."priceLockedAt".
-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "priceLockedAt" TIMESTAMP(3);
