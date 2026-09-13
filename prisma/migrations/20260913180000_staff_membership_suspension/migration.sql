-- AlterTable
ALTER TABLE "StaffMembership" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedById" TEXT;
