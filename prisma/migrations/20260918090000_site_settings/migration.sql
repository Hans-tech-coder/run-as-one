-- Site-wide settings, starting with the admin (contact) email.
--
-- Additive only: one new table, no row written. Until somebody saves the form
-- at /admin/settings, the app keeps using the default address in
-- src/lib/site-contact.ts, so this is safe to deploy ahead of the code.

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL DEFAULT 'site',
    "contactEmail" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);
