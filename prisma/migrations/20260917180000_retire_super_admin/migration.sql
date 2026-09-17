-- ADMIN_MERGE_PLAN.md, Batch 5: retire the super admin and the approval era.
--
-- 1. The two test Organizer rows the owner named on 2026-09-17, and their
--    Client copies from 20260917120000_clients_and_viewer_role:
--      cmtk6bfz8000084et6j1utync  "System Owner"      superadmin@stridesync.com  (SUPER_ADMIN)
--      cmtk6bhzz0000ncetvvitguj8  "Super Admin Test"  admin@stridesync.com       (ORGANIZER)
--    Deleted by id, never by a rule, and only while each still owns nothing:
--    a row that has since gained an event, promotion, membership, viewer or
--    linked event is left alone and this step is a no-op for it. On a database
--    that never held them (a fresh dev branch) nothing matches.
--    Their AuditLog rows are not touched — the trail is append-only and has no
--    foreign keys, so it keeps reading correctly with the account gone.
--
-- 2. The application columns Organizer carried for the self-serve sign-up,
--    now held on Client, and the two columns that only served approve/reject.
--    Organizer.role and Organizer.adminFee stay, by the owner's call.

DELETE FROM "Client" c
WHERE c."id" IN ('cmtk6bfz8000084et6j1utync', 'cmtk6bhzz0000ncetvvitguj8')
  AND NOT EXISTS (SELECT 1 FROM "Event" e WHERE e."clientId" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "StaffMembership" m WHERE m."clientId" = c."id");

DELETE FROM "Organizer" o
WHERE o."id" IN ('cmtk6bfz8000084et6j1utync', 'cmtk6bhzz0000ncetvvitguj8')
  AND NOT EXISTS (SELECT 1 FROM "Event" e WHERE e."organizerId" = o."id")
  AND NOT EXISTS (SELECT 1 FROM "PromoCode" p WHERE p."organizerId" = o."id")
  AND NOT EXISTS (SELECT 1 FROM "StaffMembership" m WHERE m."organizerId" = o."id");

ALTER TABLE "Organizer"
  DROP COLUMN "statusNote",
  DROP COLUMN "statusChangedAt",
  DROP COLUMN "orgType",
  DROP COLUMN "contactFirstName",
  DROP COLUMN "contactLastName",
  DROP COLUMN "contactRole",
  DROP COLUMN "phone",
  DROP COLUMN "city",
  DROP COLUMN "province",
  DROP COLUMN "website",
  DROP COLUMN "experience",
  DROP COLUMN "services",
  DROP COLUMN "firstEventName",
  DROP COLUMN "firstEventDate",
  DROP COLUMN "firstEventLocation",
  DROP COLUMN "expectedRunners",
  DROP COLUMN "applicationNote";
