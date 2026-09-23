-- An optional screenshot on a feedback message: a pathname in the private
-- Blob store. Nullable, so every existing row stays as it was.
ALTER TABLE "Feedback" ADD COLUMN "screenshot" TEXT;
