-- Guardian Consent Plan Batch 3: the parent or guardian who consented for a
-- runner aged 12 or under on race day. All nullable; existing rows stay null
-- and are not backfilled.
ALTER TABLE "Runner" ADD COLUMN "guardianName" TEXT,
ADD COLUMN "guardianRelationship" TEXT,
ADD COLUMN "guardianConsentAt" TIMESTAMP(3);
