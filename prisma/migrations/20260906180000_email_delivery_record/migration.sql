-- Whether each transactional email actually went out, so a send that never
-- happened stops being invisible.
--
-- The app runs on Resend's free tier in production: 100 recipients a day, and
-- it stops rather than bills. sendEmail() logged its failures and returned
-- void, so on the day the ceiling is reached a registration would sit
-- unconfirmed with nothing on the row to show for it. These columns are what
-- the admin's "email unsent" mark and its backlog filter read.

-- Null means the runner never got it. A hand-sent email stamps the same column
-- as a Resend one: what is recorded is that they *have* the email, not which
-- system delivered it.
ALTER TABLE "Registration" ADD COLUMN "receivedEmailSentAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "confirmationEmailSentAt" TIMESTAMP(3);

-- Resend's own reason for the last failure, so a quota stop is distinguishable
-- from a bad address without opening their dashboard.
ALTER TABLE "Registration" ADD COLUMN "lastEmailError" TEXT;

-- Who sent an outstanding email by hand, and when. A name, not an account id,
-- for the same reason as "remarksBy".
ALTER TABLE "Registration" ADD COLUMN "manualEmailSentAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "manualEmailSentBy" TEXT;

-- Backfilled, unlike consentSignature in the previous migration, and for the
-- opposite reason. Every existing registration *was* emailed: the old code
-- called both sends unconditionally at exactly these two moments, it simply
-- never wrote down that it had. Leaving them null would put the entire history
-- of the platform into the unsent backlog on the first page load, which would
-- bury the handful of rows the feature exists to surface.
--
-- The timestamps are the closest honest approximation, not a recorded send
-- time: a registration's own createdAt is the moment the received email was
-- fired, and for a PAID row updatedAt is the moment it was marked paid, which
-- is when the receipt went out -- unless the row has been edited since.
UPDATE "Registration" SET "receivedEmailSentAt" = "createdAt";
UPDATE "Registration" SET "confirmationEmailSentAt" = "updatedAt" WHERE "status" = 'PAID';
