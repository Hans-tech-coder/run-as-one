-- Settings Plan Batch 3: sign-in activity and "sign out other devices" for
-- the owner. Both nullable, so the existing owner session stays valid.
ALTER TABLE "Organizer" ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);
