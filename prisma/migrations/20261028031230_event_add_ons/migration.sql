-- Event add-ons (ADD_ONS_PLAN.md Batch 1, planned with the owner 2026-10-28):
-- optional items a runner buys with their entry — a shirt, a cap — set by
-- staff per event (EventAddOn), and each runner's purchased lines
-- (RunnerAddOn), plus the order's two add-on totals on Registration.
--
-- Additive only: two new tables and two Int columns defaulting to 0, so every
-- existing order reads unchanged (totalAmount already holds no add-ons) and
-- the old code, which never names them, keeps working — migrating before the
-- deploy is safe. Nothing writes RunnerAddOn until checkout learns add-ons
-- (Batch 2).
--
-- Rollback: DROP TABLE "RunnerAddOn"; DROP TABLE "EventAddOn";
-- ALTER TABLE "Registration" DROP COLUMN "addOnTotal",
--   DROP COLUMN "addOnRunAsOneTotal";
-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "addOnRunAsOneTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "addOnTotal" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EventAddOn" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optionKind" TEXT NOT NULL DEFAULT 'NONE',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxPerRunner" INTEGER NOT NULL DEFAULT 1,
    "stockLimit" INTEGER,
    "salesCloseAt" TIMESTAMP(3),
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "soldBy" TEXT NOT NULL DEFAULT 'ORGANIZER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventAddOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunnerAddOn" (
    "id" TEXT NOT NULL,
    "runnerId" TEXT NOT NULL,
    "addOnId" TEXT,
    "name" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "option" TEXT,
    "soldBy" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunnerAddOn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventAddOn_eventId_idx" ON "EventAddOn"("eventId");

-- CreateIndex
CREATE INDEX "RunnerAddOn_runnerId_idx" ON "RunnerAddOn"("runnerId");

-- CreateIndex
CREATE INDEX "RunnerAddOn_addOnId_idx" ON "RunnerAddOn"("addOnId");

-- AddForeignKey
ALTER TABLE "EventAddOn" ADD CONSTRAINT "EventAddOn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunnerAddOn" ADD CONSTRAINT "RunnerAddOn_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "Runner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunnerAddOn" ADD CONSTRAINT "RunnerAddOn_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "EventAddOn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
