-- ADMIN_MERGE_PLAN.md, Batch 6: remittances to organizers.
--
-- Additive only: one new table. No Event, Registration or Runner row is read
-- or rewritten — what an organizer is owed is computed from the registrations
-- at request time (src/lib/settlement.ts), so nothing here touches live orders.

-- CreateTable
CREATE TABLE "Remittance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PAYOUT',
    "amount" INTEGER NOT NULL,
    "paidOn" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "proof" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidedByName" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Remittance_eventId_createdAt_idx" ON "Remittance"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
