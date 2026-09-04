-- The accounts a runner can transfer to, per event.
--
-- These used to be a hardcoded constant in the bundle, so every event pointed
-- runners at the same three banks regardless of whose event it was — money to
-- the wrong account, in other words. Now the organizer sets them per event.
--
-- Nothing references a bank account, so the update path can replace the whole
-- set for an event without worrying about foreign keys.
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    -- Null is normal: plenty of accounts have no QR, and the numbers alone are
    -- enough to pay.
    "qrImageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- The runner-facing list reads every account for one event in display order.
CREATE INDEX "BankAccount_eventId_sortOrder_idx" ON "BankAccount"("eventId", "sortOrder");

ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
