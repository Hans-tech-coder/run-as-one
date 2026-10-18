-- Category changes after payment (CATEGORY_CHANGE_PLAN.md): three per-event
-- settings and the CategoryChange table, one row per move of a runner.
--
-- Additive: the old code ignores the new columns, their defaults (no deadline,
-- NO_REFUND, no fee) are what every existing event already behaves as, and the
-- new table starts empty, so migrating before the deploy is safe. Rollback is
-- DROP TABLE "CategoryChange" and dropping the three Event columns.
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "categoryChangeFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "categoryChangeUntil" TIMESTAMP(3),
ADD COLUMN     "downgradeRefundPolicy" TEXT NOT NULL DEFAULT 'NO_REFUND';

-- CreateTable
CREATE TABLE "CategoryChange" (
    "id" TEXT NOT NULL,
    "changeRef" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "runnerId" TEXT NOT NULL,
    "fromCategoryId" TEXT NOT NULL,
    "toCategoryId" TEXT NOT NULL,
    "basis" INTEGER NOT NULL,
    "basisEstimated" BOOLEAN NOT NULL DEFAULT false,
    "basisAdjustReason" TEXT,
    "toPrice" INTEGER NOT NULL,
    "changeFee" INTEGER NOT NULL DEFAULT 0,
    "difference" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "transactionFee" INTEGER NOT NULL DEFAULT 0,
    "totalCharged" INTEGER NOT NULL DEFAULT 0,
    "refundAmount" INTEGER NOT NULL DEFAULT 0,
    "refundReference" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundedBy" TEXT,
    "fromInclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "toInclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "checkoutSessionId" TEXT,
    "proofOfPayment" TEXT,
    "transactionNumber" TEXT,
    "holdUntil" TIMESTAMP(3),
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "expiredAt" TIMESTAMP(3),
    "createdEmailSentAt" TIMESTAMP(3),
    "appliedEmailSentAt" TIMESTAMP(3),
    "lastEmailError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryChange_changeRef_key" ON "CategoryChange"("changeRef");

-- CreateIndex
CREATE INDEX "CategoryChange_toCategoryId_status_idx" ON "CategoryChange"("toCategoryId", "status");

-- CreateIndex
CREATE INDEX "CategoryChange_runnerId_idx" ON "CategoryChange"("runnerId");

-- CreateIndex
CREATE INDEX "CategoryChange_eventId_idx" ON "CategoryChange"("eventId");

-- AddForeignKey
ALTER TABLE "CategoryChange" ADD CONSTRAINT "CategoryChange_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryChange" ADD CONSTRAINT "CategoryChange_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryChange" ADD CONSTRAINT "CategoryChange_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "Runner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryChange" ADD CONSTRAINT "CategoryChange_fromCategoryId_fkey" FOREIGN KEY ("fromCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryChange" ADD CONSTRAINT "CategoryChange_toCategoryId_fkey" FOREIGN KEY ("toCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

