-- Per-category seat caps, and the two snapshots a receipt needs.
--
-- These belong to the same feature as the migration before this one and would
-- have been part of it, but that one had already been deployed by the time they
-- were written. A migration that has run is history: it is not edited, it is
-- followed. So the columns arrive here instead, which is also what makes a
-- database that already ran the first one and a database starting from empty
-- end up in the same place.

-- How many runners may take each category's promotion price, and how many
-- already have. Runners rather than orders, unlike PromoCode.usageLimit: this
-- counts seats at a price, the same thing Category.slotLimit counts, so a group
-- of three eats three of them.
--
-- Null usageLimit is the uncapped price every row created before this had.
ALTER TABLE "PromoCategoryPrice" ADD COLUMN "usageLimit" INTEGER;
ALTER TABLE "PromoCategoryPrice" ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0;

-- Which kind of promotion an order used, snapshotted beside the code and the
-- amount. The receipt email renders from the registration row long after
-- checkout, and has to know whether the discount was a price the goods were
-- already sold at or a deduction from them -- a question the amount alone
-- cannot answer, and one the PromoCode row may no longer be around to.
--
-- Nullable with no backfill: the orders written before this column existed
-- carry no discount at all, and a null reads as "a deduction", which is what
-- every discount before this change was.
ALTER TABLE "Registration" ADD COLUMN "discountType" TEXT;

-- What each runner was actually charged for their category, when a repricing
-- promotion gave them a seat at its price. Null means they paid the category's
-- own price, which is every runner on every other kind of order.
--
-- Per runner because a promotion can run out halfway through one order, and
-- because the abandoned-checkout sweep counts these to hand back exactly the
-- seats the order took -- recomputing them from the promotion would hand back
-- three for an order that only ever took two.
ALTER TABLE "Runner" ADD COLUMN "promoPrice" INTEGER;
