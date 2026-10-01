-- Every runner's home address (RUNNER_ADDRESS_PLAN.md Batch 1). Nullable on
-- purpose: rows written before this, real PENDING orders among them, keep no
-- address rather than an invented one.
ALTER TABLE "Runner" ADD COLUMN "addressStreet" TEXT,
ADD COLUMN "addressBarangay" TEXT,
ADD COLUMN "addressCity" TEXT,
ADD COLUMN "addressProvince" TEXT;
