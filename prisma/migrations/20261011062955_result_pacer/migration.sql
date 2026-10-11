-- CreateTable
CREATE TABLE "ResultPacer" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "bibNumber" TEXT NOT NULL,
    "paceGroup" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultPacer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResultPacer_eventId_bibNumber_key" ON "ResultPacer"("eventId", "bibNumber");

-- AddForeignKey
ALTER TABLE "ResultPacer" ADD CONSTRAINT "ResultPacer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
