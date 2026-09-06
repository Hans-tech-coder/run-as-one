-- The two ways registration can close while the race is still ahead of us.
--
-- Until now the only thing that closed sign-ups was race day itself. An
-- organizer with 500 singlets had no way to stop at 500, and one who needed to
-- halt for a week had no way to say so.
--
-- Both columns arrive with the answer that matches every existing row: no cap,
-- and not paused. Nothing has to be backfilled.

-- Null means uncapped. The cap sits on the option rather than the event
-- because a full 10K says nothing about the 5K beside it.
ALTER TABLE "Category" ADD COLUMN "slotLimit" INTEGER;

-- The organizer's manual hold, and what runners are told while it is on. A
-- null note falls back to the standard sentence in
-- src/lib/registration-gate.ts, so a paused event is never unexplained.
ALTER TABLE "Event" ADD COLUMN "registrationPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "registrationPauseNote" TEXT;

-- Taken slots are counted by grouping runners per category, and that count now
-- runs on the event page, both wizards, both checkout routes and every public
-- listing. Postgres does not index a foreign key by itself, so without this
-- every one of those reads scans the whole Runner table.
CREATE INDEX "Runner_categoryId_idx" ON "Runner"("categoryId");
