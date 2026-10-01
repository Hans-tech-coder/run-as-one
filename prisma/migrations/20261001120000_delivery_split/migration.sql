-- Whether a group delivery ships each kit to its runner's own home address
-- (RUNNER_ADDRESS_PLAN.md Batch 2). Every existing order shipped to one
-- address, so false is the truth for them, real PENDING orders included.
ALTER TABLE "Registration" ADD COLUMN "deliverySplit" BOOLEAN NOT NULL DEFAULT false;
