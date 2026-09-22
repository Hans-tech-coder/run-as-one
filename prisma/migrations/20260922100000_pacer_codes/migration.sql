-- Pacer Discount Plan Batch 1: a pacer code is a PromoCode whose discountType
-- is PACER -- a free entry for one named pacer in one category of one race.
--
-- Three columns, all defaulted or nullable, so every existing promotion is
-- already correct: no promotion before this one waived a fee, none was made
-- for a named person, and none was ever sent by hand.
ALTER TABLE "PromoCode" ADD COLUMN "waiveAdminFee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PromoCode" ADD COLUMN "assigneeName" TEXT;
ALTER TABLE "PromoCode" ADD COLUMN "codeSentAt" TIMESTAMP(3);
