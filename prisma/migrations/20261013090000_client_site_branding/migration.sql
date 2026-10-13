-- CLIENT_SUBDOMAIN_PLAN.md Batch 1: a client's own site and its branding.
-- All nullable, so existing rows are untouched; null subdomain = no site.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "heroHeadline" TEXT,
ADD COLUMN     "heroImageUrl" TEXT,
ADD COLUMN     "heroTagline" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "publicEmail" TEXT,
ADD COLUMN     "publicPhone" TEXT,
ADD COLUMN     "subdomain" TEXT,
ADD COLUMN     "tiktokUrl" TEXT,
ADD COLUMN     "youtubeUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Client_subdomain_key" ON "Client"("subdomain");

