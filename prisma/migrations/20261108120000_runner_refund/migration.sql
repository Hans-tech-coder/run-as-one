-- CreateTable
CREATE TABLE "RunnerRefund" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "runnerId" TEXT NOT NULL,
    "entryAmount" INTEGER NOT NULL,
    "suggestedAmount" INTEGER NOT NULL,
    "discountShare" INTEGER NOT NULL,
    "combinedDiscountShare" INTEGER NOT NULL DEFAULT 0,
    "addOnOrganizerAmount" INTEGER NOT NULL DEFAULT 0,
    "addOnRunAsOneAmount" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "paidBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "approvedOn" TEXT NOT NULL,
    "approvalProof" TEXT NOT NULL,
    "promoHandBack" JSONB,
    "paymentReference" TEXT,
    "paymentProof" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunnerRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RunnerRefund_runnerId_key" ON "RunnerRefund"("runnerId");

-- CreateIndex
CREATE INDEX "RunnerRefund_eventId_status_idx" ON "RunnerRefund"("eventId", "status");

-- CreateIndex
CREATE INDEX "RunnerRefund_registrationId_idx" ON "RunnerRefund"("registrationId");

-- AddForeignKey
ALTER TABLE "RunnerRefund" ADD CONSTRAINT "RunnerRefund_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunnerRefund" ADD CONSTRAINT "RunnerRefund_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunnerRefund" ADD CONSTRAINT "RunnerRefund_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "Runner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

