-- Where an event is run (VIRTUAL_RUN_PLAN.md D2, D4): "ONSITE" — one race day
-- at a venue, which every existing event is — or "VIRTUAL", run anywhere
-- between `date` and `virtualEndDate`.
--
-- Additive: the old code ignores both columns, and the default keeps every
-- existing row on-site, so migrating before the deploy is safe.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'ONSITE',
ADD COLUMN     "virtualEndDate" TEXT;
