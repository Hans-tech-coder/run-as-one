-- Which door an order came through, and who encoded it
-- (STAFF_REGISTRATION_PLAN.md step 1). Additive.
--
-- "source" defaults to 'WEB', so every existing row reads as the runner's own
-- checkout, which is what it was. "createdById" / "createdByName" are null
-- except on STAFF orders. No index: read per order on the registrants list.
--
-- The old code ignores the new columns, so this can run before the deploy.
--
-- Rollback:
--   ALTER TABLE "Registration" DROP COLUMN "source",
--     DROP COLUMN "createdById", DROP COLUMN "createdByName";

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'WEB',
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "createdByName" TEXT;
