-- Per-event wording for the liability, media, and data-privacy waiver, one
-- string per paragraph.
--
-- Empty array rather than NULL so reads never have to tell "no waiver written"
-- from "not set", and so existing events stay valid without a backfill. Empty
-- means the standard wording applies — resolveConsentWaiver() supplies it, so
-- a runner is never shown a blank waiver above the consent checkbox.
ALTER TABLE "Event" ADD COLUMN "consentWaiver" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
