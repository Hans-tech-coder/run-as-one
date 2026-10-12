-- AlterTable
ALTER TABLE "StaffAccount" ADD COLUMN     "googleSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccount_googleSub_key" ON "StaffAccount"("googleSub");

