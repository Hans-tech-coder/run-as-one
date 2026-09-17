-- ADMIN_MERGE_PLAN.md, Batch 1: clients and the client viewer.
--
-- Additive only. Every new column is nullable, and no Event, Registration,
-- Runner, Organizer or StaffMembership row is rewritten: the live orders on
-- production (PENDING bank transfers included) are untouched by this file.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "StaffMembership" ADD COLUMN     "clientId" TEXT;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "orgType" TEXT,
    "contactFirstName" TEXT,
    "contactLastName" TEXT,
    "contactRole" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "province" TEXT,
    "website" TEXT,
    "experience" TEXT,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstEventName" TEXT,
    "firstEventDate" TEXT,
    "firstEventLocation" TEXT,
    "expectedRunners" TEXT,
    "applicationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMembership" ADD CONSTRAINT "StaffMembership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Copy each applicant Organizer row into a Client, keeping its id so the two
-- stay traceable until the originals are retired (Batch 5). A copy, not a
-- move: the Organizer rows are left exactly as they are.
--
-- An applicant is an ORGANIZER-role row that owns nothing — no event, no
-- promotion, no team. That excludes Run As One's own row (it owns every live
-- event, its promotions and every staff membership) and the SUPER_ADMIN row,
-- by what the rows hold rather than by a hard-coded id, so the same file is
-- right on every Neon branch.
--
-- Status: an application nobody refused is NEW (waiting for staff to send an
-- invite); one that was rejected or suspended is ARCHIVED, which keeps it on
-- record without putting it back in the queue.
INSERT INTO "Client" (
  "id", "name", "email", "status",
  "orgType", "contactFirstName", "contactLastName", "contactRole", "phone",
  "city", "province", "website", "experience", "services",
  "firstEventName", "firstEventDate", "firstEventLocation", "expectedRunners",
  "applicationNote", "createdAt", "updatedAt"
)
SELECT
  o."id", o."name", lower(o."email"),
  CASE WHEN o."status" IN ('REJECTED', 'SUSPENDED') THEN 'ARCHIVED' ELSE 'NEW' END,
  o."orgType", o."contactFirstName", o."contactLastName", o."contactRole", o."phone",
  o."city", o."province", o."website", o."experience", o."services",
  o."firstEventName", o."firstEventDate", o."firstEventLocation", o."expectedRunners",
  o."applicationNote", o."createdAt", CURRENT_TIMESTAMP
FROM "Organizer" o
WHERE o."role" = 'ORGANIZER'
  AND NOT EXISTS (SELECT 1 FROM "Event" e WHERE e."organizerId" = o."id")
  AND NOT EXISTS (SELECT 1 FROM "PromoCode" p WHERE p."organizerId" = o."id")
  AND NOT EXISTS (SELECT 1 FROM "StaffMembership" m WHERE m."organizerId" = o."id")
ON CONFLICT ("email") DO NOTHING;
