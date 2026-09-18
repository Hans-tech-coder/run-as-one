-- The footer's social links, saved at /admin/settings.
--
-- Additive only: four nullable columns on the one SiteSettings row, no data
-- written. A null link hides that channel's icon in the footer, so the site
-- looks the same until somebody saves a link.

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "tiktokUrl" TEXT,
ADD COLUMN     "youtubeUrl" TEXT;
