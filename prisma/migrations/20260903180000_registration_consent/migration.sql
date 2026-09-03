-- Records whether the customer checked the liability & data-privacy consent
-- box at submission.
--
-- Both columns are additive with safe defaults. Existing registrations get
-- consentGiven = false and consentGivenAt = null, which is the honest state:
-- they were never asked, not that they refused.
ALTER TABLE "Registration" ADD COLUMN "consentGiven" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Registration" ADD COLUMN "consentGivenAt" TIMESTAMP(3);
