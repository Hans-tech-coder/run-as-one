-- The province an event is held in, which the delivery tiers are measured from.
-- Nullable: existing events keep asking the runner until an organizer sets it.
ALTER TABLE "Event" ADD COLUMN "province" TEXT;
