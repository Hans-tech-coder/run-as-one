-- Events that sell packages instead of distance categories.
--
-- Both shapes stay in the Category table. A fun run package is a category with
-- no distance and an optional poster, so nothing about registrations, results
-- or runners has to change — only what the forms ask for.

-- RACE is the only safe default: every existing event has distances filled in,
-- and reading them as packages would hide data the organizer already entered.
ALTER TABLE "Event" ADD COLUMN "eventType" TEXT NOT NULL DEFAULT 'RACE';

-- Nullable, not defaulted: a race category has no poster, and "" would be a
-- broken <img> src rather than an absent one.
ALTER TABLE "Category" ADD COLUMN "imageUrl" TEXT;
