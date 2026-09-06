-- Consent and payment review: who actually signed the waiver, and what the
-- organizer's payment validator found when they looked at the proof.
--
-- Both columns sit on Registration rather than Runner because both are facts
-- about the order: one person types the signature on behalf of everyone on it,
-- and one deposit slip covers the whole group.

-- The typed signature that accompanies the consent tick. Nullable, and left
-- null on every existing row: those registrations were never asked for one,
-- and backfilling the customer's name would invent evidence that nobody gave.
-- Validated against the runners on the order at checkout -- see
-- src/lib/consent-signature.ts.
ALTER TABLE "Registration" ADD COLUMN "consentSignature" TEXT;

-- The validator's own notes. Internal: no email is built on these, and the
-- runner never sees them. "remarksBy" holds a name rather than an organizer id
-- so the note still reads correctly after an account is removed.
ALTER TABLE "Registration" ADD COLUMN "remarks" TEXT;
ALTER TABLE "Registration" ADD COLUMN "remarksBy" TEXT;
ALTER TABLE "Registration" ADD COLUMN "remarksAt" TIMESTAMP(3);
