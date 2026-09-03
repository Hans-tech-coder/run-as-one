-- Per-event admin fee, two-tier delivery, and a per-event choice of checkout.
--
-- Hand-written on purpose. `prisma migrate dev` renders a rename as DROP + ADD,
-- which would have thrown away the delivery fee of every existing event.
-- RENAME COLUMN keeps the values.

-- The single delivery fee becomes the inside-province tier: that is what the
-- existing amounts already meant, since there was nowhere else to put them.
ALTER TABLE "Event" RENAME COLUMN "logisticsDeliveryFee" TO "logisticsDeliveryFeeInside";

-- 0 means "this tier is not offered", matching how the inside tier already
-- behaves. Existing events therefore keep offering exactly one tier until an
-- organizer sets an outside price.
ALTER TABLE "Event" ADD COLUMN "logisticsDeliveryFeeOutside" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Event" ADD COLUMN "adminFee" INTEGER NOT NULL DEFAULT 6000;

ALTER TABLE "Event" ADD COLUMN "registrationForm" TEXT NOT NULL DEFAULT 'ONLINE';

-- The fee used to be read off the organizer at checkout, so the organizer's
-- value is what existing events were actually charging. Copy it across rather
-- than letting the 6000 default silently re-price them — an organizer on ₱0
-- would otherwise start charging ₱60.
UPDATE "Event" e
SET "adminFee" = o."adminFee"
FROM "Organizer" o
WHERE e."organizerId" = o."id";

-- Which tier the runner picked. NULL for pickup, and for every registration
-- taken before this migration.
ALTER TABLE "Registration" ADD COLUMN "deliveryZone" TEXT;
