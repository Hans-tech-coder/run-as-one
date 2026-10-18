-- Switching a paid order between kit pickup and delivery
-- (LOGISTICS_CHANGE_PLAN.md): the per-event deadline, the LogisticsChange
-- table (one switch, paid once) and LogisticsChangeOrder (the orders it moves,
-- with what each was before).
--
-- Additive: the old code ignores the new column, its null is the default
-- deadline (7 days before race day), and both tables start empty, so migrating
-- before the deploy is safe. Rollback is DROP TABLE "LogisticsChangeOrder",
-- DROP TABLE "LogisticsChange" and dropping "Event"."logisticsChangeUntil".
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "logisticsChangeUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LogisticsChange" (
    "id" TEXT NOT NULL,
    "changeRef" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "deliveryZone" TEXT,
    "deliveryAddress" TEXT,
    "deliverySplit" BOOLEAN NOT NULL DEFAULT false,
    "ridesOnRegistrationId" TEXT,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "transactionFee" INTEGER NOT NULL DEFAULT 0,
    "totalCharged" INTEGER NOT NULL DEFAULT 0,
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

    CONSTRAINT "LogisticsChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsChangeOrder" (
    "id" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "fromLogisticsMethod" TEXT NOT NULL,
    "fromDeliveryZone" TEXT,
    "fromDeliveryAddress" TEXT,
    "fromDeliverySplit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LogisticsChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsChange_changeRef_key" ON "LogisticsChange"("changeRef");

-- CreateIndex
CREATE INDEX "LogisticsChange_eventId_idx" ON "LogisticsChange"("eventId");

-- CreateIndex
CREATE INDEX "LogisticsChange_status_holdUntil_idx" ON "LogisticsChange"("status", "holdUntil");

-- CreateIndex
CREATE INDEX "LogisticsChangeOrder_registrationId_idx" ON "LogisticsChangeOrder"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsChangeOrder_changeId_registrationId_key" ON "LogisticsChangeOrder"("changeId", "registrationId");

-- AddForeignKey
ALTER TABLE "LogisticsChange" ADD CONSTRAINT "LogisticsChange_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsChange" ADD CONSTRAINT "LogisticsChange_ridesOnRegistrationId_fkey" FOREIGN KEY ("ridesOnRegistrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsChangeOrder" ADD CONSTRAINT "LogisticsChangeOrder_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "LogisticsChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsChangeOrder" ADD CONSTRAINT "LogisticsChangeOrder_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

