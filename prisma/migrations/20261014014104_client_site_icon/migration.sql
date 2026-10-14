-- CLIENT_SUBDOMAIN_PLAN.md: a client site's own square tab icon. Nullable;
-- null keeps Run As One's mark.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "faviconUrl" TEXT;
