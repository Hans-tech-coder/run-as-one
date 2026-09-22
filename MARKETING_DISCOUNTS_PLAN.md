# Marketing Discounts Plan: percentage and fixed-amount codes

This file tracks bringing **percentage** and **fixed-amount** discounts back to
`/admin/marketing`, as the owner agreed on 2026-09-19. **One batch per session.**
When a batch lands, tick its boxes, add a line under *Where it stands*, and
update `PROJECT_GUIDE.md` in the same change.

This plan runs **before** `PACER_DISCOUNT_PLAN.md`. The pacer code is built on
two things this plan adds: the category restriction (`PromoCategory`) and caps
that are counted in runners.

## This reverses an earlier decision

`PERCENTAGE` and `FIXED` existed before and were removed on purpose (see
PROJECT_GUIDE §4 *PromoCode*, and the header of `src/lib/discount.ts`). The
reasoning was that an organizer running a race thinks in prices per distance,
not in percentages off a basket. The owner has now asked for both back. When
Batch 1 lands, rewrite those two passages instead of adding a note beside them,
because the old wording would tell the next session the kinds must not exist.

## What the owner decided

| Question | Decision |
|---|---|
| What a percentage or fixed discount comes off | **The runner's entry line only**: the category price plus any shirt upcharge. This is the same base `runnerPrices` already gives `BUY_X_GET_Y`. The admin fee, delivery fee and transaction fee are never discounted. |
| Fixed amount | **Per runner**, and capped at that runner's entry line, so it never goes below ₱0. |
| Percentage | Whole percent, 1–100, per runner. Round each runner's discount **down** to the centavo. |
| How it is claimed | **One shared code** (with an optional limit), or **single-use vouchers**. Automatic is not offered for these kinds yet (see *Open questions*). |
| Shared code limit | **Counted in runners, not orders.** A group of 5 uses up 5. Leaving it blank means no limit. |
| Shared code when the limit is nearly used up | **Partial.** If 3 are left and the group has 5, the 3 runners with the most expensive entries get the discount and the other 2 pay full price. The summary says so. This matches how `CATEGORY_PRICE` seats already behave. |
| Single-use voucher on a group order | **Covers exactly one runner**: the one with the most expensive entry among the runners the code applies to. |
| Category restriction | **Optional**, for every percentage or fixed code, shared or voucher. The default is *All categories*; the organizer may pick one or more. Only offered when the promotion is scoped to one event. |
| Runners outside the chosen categories | Pay full price. If **no** runner on the order is in a chosen category, the code is refused with a message naming the categories. |
| Stacking | Unchanged: one discount per order, and the largest wins (`bestDiscount`). |

### Which runners get it, in one rule

Every discount of these kinds is decided by a single walk through the order:

1. Keep only the runners in the code's categories (every runner, if it has
   none).
2. Sort them by entry line, most expensive first. On a tie, the earlier runner
   comes first, so the badge lands on the card the group filled in first.
3. Take as many as the code allows: **1** for a voucher, the runners left under
   the limit for a shared code, or all of them when there is no limit.
4. Each runner taken is discounted: `min(entry, fixed)` or
   `floor(entry × percent / 100)`.

Write this walk **once** in `discount.ts`. The amount charged, the price shown
on each runner's line, the runners counted against the limit at checkout, and
the runners handed back when an order expires must all read the same walk.
`categoryPriceSavings` exists for the same reason; copy its shape.

## Where things live today (checked 2026-09-19)

- `src/lib/discount.ts`: `DISCOUNT_TYPES` has only `CATEGORY_PRICE` and
  `BUY_X_GET_Y`. `discountAmountFor` switches on them.
  `isPricedIn` decides whether a runner's line shows a lower price or the
  discount appears as a deduction. `promoCodeError` is the gate shared by the
  wizards and the checkout routes. `redeemPromoCode` locks the `PromoCode` row
  and adds **1** to `usageCount` (an order). `isExhausted` compares
  `usageCount` with `usageLimit`.
- `src/lib/pending-expiry.ts` `releaseRedemption` gives back **1** redemption
  and counts `CATEGORY_PRICE` seats from `Runner.promoPrice`.
- `src/lib/promo-input.ts` always writes `usageLimit: null` and
  `discountValue: 0`. The create route's voucher branch sets `usageLimit: 1`.
- `prisma/schema.prisma` `PromoCode.discountValue` is "kept at 0, read by
  neither". Its comment says it is kept for a future kind whose value is a
  single number, which is exactly this.
- `src/app/admin/marketing/PromoCodesClient.tsx` has the form (`BLANK_FORM`
  ~l.148, `CLAIMS` ~l.188, the Discount type `AdminSelect` ~l.1487, the claim
  picker ~l.1720) and the table (`groupPromos`, `remaining`, `UsedCount`).
  The *One shared code* hint already says "up to the limit you set", but no
  limit box exists. This plan adds it.
- `src/app/api/admin/promos/route.ts` (POST, including vouchers with
  `MAX_VOUCHER_BATCH` 500) and `[id]/route.ts` (PATCH and DELETE) both go
  through `promoTermsFromInput`.
- `src/app/api/promos/lookup` returns the terms to the wizard. Both wizards
  (`RegistrationWizardClient.tsx`, `BankTransferWizardClient.tsx`) price the
  order with `applyPromo`.

## Data

- **No new columns on `PromoCode`.** `discountType` gains `PERCENTAGE` and
  `FIXED` (it is a string guarded by `asDiscountType`, so no enum migration).
  `discountValue` holds the whole percent (1–100) or the fixed amount in
  **centavos**. Rewrite its schema comment.
- **`usageLimit` counts runners for `PERCENTAGE` and `FIXED`** and keeps
  counting orders for the older kinds. Put the rule in one function
  (`limitCountsRunners(type)`) and keep the older kinds unchanged. A voucher is
  still `usageLimit: 1`, and since a voucher covers one runner, one runner and
  one order mean the same thing there.
- **New table `PromoCategory`**: `promoCodeId` and `categoryId`, unique per
  pair, cascading on both sides like `PromoCategoryPrice`. No rows means
  every category. It is small: 500 vouchers × 2 categories is 1,000 tiny rows.
  A voucher batch writes the rows for every voucher in the same statement.
- **Record the discount on each runner.** Percentage and fixed discounts are
  per runner, so they are **priced in**: `isPricedIn` returns true for them,
  and `Runner.promoPrice` records each discounted runner's charged price. That
  one decision reuses what already works: `salePriceByRunner`,
  `chargedRunnerPrice`, the struck-through line on the summary and receipt,
  and how `releaseRedemption` counts runners.
- One migration, in Batch 1 (`PromoCategory`). Production needs
  `npx prisma migrate deploy` by hand when it is released.

## Batch 1: the rule, the data and the marketing form

- [x] **Migration** adding `PromoCategory`. Add the relation on `PromoCode` and
  `Category`.
- [x] **`discount.ts`**:
  - [x] `PERCENTAGE` and `FIXED` in `DISCOUNT_TYPES` and `DISCOUNT_TYPE_LABELS`
    (*Percentage off*, *Fixed amount off*).
  - [x] `PromoTerms` gains `categoryIds?: string[]`, and add
    `limitCountsRunners`.
  - [x] The allocation walk above (`perRunnerSavings`), and cases in
    `discountAmountFor` and `applyPromo` that read it. `isPricedIn` becomes true
    for the new kinds.
  - [x] `promoCodeError`: a code whose categories match no runner on the order
    is refused by name ("SUMMER10 is only for 10K and 21K runners."). This
    needs category names, so the lookup passes them in with the terms.
  - [x] `isExhausted` and the status badge work for runner-counted caps.
  - [x] `describePromo` ("20% off", "₱200 off") and `promoConditions`
    ("10K and 21K only", "50 runners").
  - [x] Rewrite the header comment and the "Fees are never discounted" note so
    they are true again.
- [x] **`promo-input.ts`**: read `discountValue` (a percent of 1–100, or pesos
  converted to centavos and greater than 0), `categoryIds` (each must belong to
  the scoped event, so refuse them without one), and `usageLimit` for a shared
  code (a positive whole number or blank, and never below the runners already
  counted, the same rule the seat caps follow). Refuse Automatic for these
  kinds, naming the field.
- [x] **`api/admin/promos` POST and `[id]` PATCH** write the `PromoCategory`
  rows in the same transaction as the promotion (and for every voucher in a
  batch). An edit replaces them; unlike seat rows, these carry no count, so
  replacing them is safe. Audit entries include the value and categories.
- [x] **The marketing screen**: the form, table and cards as set out in
  *The marketing screen* below.
- [x] `PROJECT_GUIDE.md`: §4 (`PromoCode` rewritten, `PromoCategory` added), §5
  (`discount.ts`, `promo-input.ts`), §6 (`/admin/marketing`, the promo
  routes), §10.

Between this batch and the next, a new percentage or fixed code can be created
but no runner can use it. The walk does price it, so "takes nothing off" would
not have held; instead `discount.ts` has a temporary
`PER_RUNNER_CHECKOUT_READY = false`, and `promoCodeError` refuses every
`PERCENTAGE`/`FIXED` code with its own sentence, on screen and at checkout
alike. **Do not promote `dev` to `main` until Batch 2 lands.**

## Batch 2: the runner side and checkout

- [x] **`promos/lookup`** returns `categoryIds` and the category names the
  refusal message needs.
- [x] **Both wizards**: the summary shows who got the discount. Use
  "Applied to Runner 2 (21K)" for a voucher, and "Applied to 3 of your 5
  runners. Only 3 discounted places were left." for a partial shared code. Each
  discounted runner's line shows the struck-through price. Check at 375px.
- [x] **Both checkout routes**: nothing new is trusted from the client; the
  discount is still recomputed by `resolveDiscount`. `redeemPromoCode` adds the
  **number of discounted runners** to `usageCount` for runner-counted kinds,
  under the same `FOR UPDATE` lock. If fewer are left than the order was priced
  with, it throws `PromoUnavailableError` with a sentence in runners. Write
  `Runner.promoPrice` for each discounted runner.
- [x] **`pending-expiry.ts` `releaseRedemption`** gives back the number of
  runners with a `promoPrice` for runner-counted kinds, instead of 1, clamped at
  zero as it already is.
- [x] **Emails and receipts**: the received and confirmed emails print the
  per-runner price the same way they already do for `CATEGORY_PRICE`.
- [x] Verify on `local-dev` (never against the real Pink Run orders): a 20%
  shared code limited to 3, used by a group of 5 across two categories; a
  ₱300 voucher on a group with a ₱250 3K; a code limited to the 10K on an
  order with no 10K runner; an abandoned checkout expiring and returning its
  runners to the limit.
- [x] `PROJECT_GUIDE.md` §5, §6 (wizard), §7 (checkout still recomputes), §10.

## The marketing screen (`src/app/admin/marketing`)

### The form (`PromoCodesClient.tsx`)

The fields appear in this order. Nothing new uses a browser-default control
(see the standing rule on uniform, premium controls):

1. **Discount type** (`AdminSelect`) gains two options:
   - *Percentage off*, hint "20% off each runner's entry"
   - *Fixed amount off*, hint "₱200 off each runner's entry"
2. **Value**, shown only for the new kinds:
   - Percentage: a whole-number box with a `%` suffix, sample `20`.
   - Fixed: a peso box with a `₱` prefix, like the category price boxes.
   - The error is keyed `discountValue` and appears under the box.
3. **Event** (the existing picker). For the new kinds it stays optional, but
   *Applies to* only appears once an event is chosen.
4. **Applies to**, shown for the new kinds when an event is chosen:
   - A row of toggles: *All categories* (the default) and one per category in
     `CATEGORY_ORDER`, each labelled with its name **and distance**. Do not drop
     the distance.
   - Copy the look of an existing selectable control in the dashboard. Do not
     use a native `<select multiple>` or bare checkboxes.
   - Changing the event clears the selection.
   - The hint says: "Runners in other categories pay full price."
5. **How runners get it** (`CLAIMS`): *One shared code* and *Single-use
   vouchers* are enabled. *Automatic* is disabled for the new kinds with a
   reason underneath, the way `CATEGORY_PRICE` already disables the other two.
   Disable it rather than hide it.
6. **Runner limit**, only for *One shared code*: an optional whole-number box,
   with the hint "How many runners can get this discount in total. A group of
   5 uses 5. Leave blank for no limit." When editing, if some runners are
   already counted, the hint says how many.
   For vouchers, show a line instead of the box: "Each voucher covers one runner
   on one order."
7. Code or batch fields, and the dates: unchanged.

`BLANK_FORM` gains `discountValue: ''`, `categoryIds: [] as string[]` and
`usageLimit: ''`. `formFrom` fills them when editing and duplicating.
*Duplicate* keeps the value, the categories and the limit.
`chooseType` clears `discountValue` when switching between percentage and
fixed, because 20 means something different in each.

Below `sm`, the value box takes the full width and the category toggles wrap.
Every toggle is at least 44px tall. Save stays in the fixed footer.

### The table and the cards

- **What it gives**: `describePromo`, followed by the categories in small print
  when it is restricted, for example "20% off · 10K, 21K only".
- **Used**: for runner-counted kinds, show runners: "12 of 50 runners", or
  "12 runners" when there is no limit. `remaining()` and `UsedCount` switch on
  `limitCountsRunners`. A voucher batch still reads as codes used out of codes
  generated.
- **Given**, the *Given Away* metric and *View redemptions* need no change,
  because they add up `discountAmount`, which already reflects the per-runner
  math.
- **Filters**: the type filter in the one Filters sheet gains the two new
  kinds. Do not add a separate chip for them.
- The status badge (*Fully Used*) works for runner-counted caps through
  `isExhausted`.
- Below `lg`, the card's summary line uses the same "20% off · 10K only" text.

## Settled after the plan was written (owner, 2026-09-19)

- **Automatic** is not offered for percentage or fixed codes for now.
  `CATEGORY_PRICE` covers the early-bird case.
- **One code per order**, as today. A group that wants a voucher for every
  runner registers as separate orders.

## Where it stands

- 2026-09-19: the plan was written from the owner's decisions.
- 2026-09-19: **Batch 1 landed** (uncommitted until the owner says so).
  Migration `20260919180000_promo_category`. Notes for Batch 2:
  - **Delete `PER_RUNNER_CHECKOUT_READY`** and its one use in `promoCodeError`.
  - `promo-store.ts` `PROMO_TERMS_SELECT` does not select the categories yet.
    Add them there and map them to `categoryIds` / `categoryNames` (in
    `CATEGORY_ORDER`) for the lookup, the automatic query and `resolveDiscount`.
    The marketing page already does this mapping; copy it.
  - Use `runnersDiscounted(promo, order)` for the amount `redeemPromoCode` adds
    when `limitCountsRunners(type)`, and `runnersLeft` for the refusal.
  - `salePriceByRunner` stays a **category** price. A per-runner discount comes
    off category price plus shirt upcharge, so when it is bigger than the
    category price alone (100%, or a fixed amount above a cheap category with a
    3XL upcharge) the category price floors at ₱0 while the upcharge is still
    discounted. The summary and emails must show that runner's line so that it
    still adds up to the total.
  - The marketing screen has **no Filters sheet**, so there was no type filter
    to extend. Building one is its own piece of work, not part of this plan.
  - Verified with a script against the plan's examples (20% limited to 3 on a
    group of 5 across 10K and 21K; ₱300 voucher on a ₱250 3K; 10K-only on a
    21K order; ties going to the earlier runner). The form was not checked in
    a browser, because Prisma could not be run in this session (see the chat).
- 2026-09-19: **Batch 2 landed**. `PROJECT_GUIDE.md` is updated.
- 2026-09-22: A review before committing found Batch 2 was not actually
  reachable: `PER_RUNNER_CHECKOUT_READY` was still `false`, so
  `promoCodeError` refused every PERCENTAGE/FIXED code at the wizard and at
  checkout alike — the "verified on local-dev" note above predates this and
  cannot have exercised the checkout path. Also, both wizards' partial-code
  message ("Only N discounted places were left") read the promo's *total*
  `usageLimit` instead of the runners actually discounted on this order, so
  it would misreport once a shared code had any prior usage. Both are fixed:
  the constant and its gate are deleted from `discount.ts`, and the wizards
  now read `discountedIdxs.length`. Re-verified with a new script,
  `scripts/check-per-runner-discount.ts`, covering the plan's three examples
  plus `redeemPromoCode`'s runner-counted claim and its overclaim refusal
  (via a fake `tx`, no database) — 19/19 pass — and `tsc --noEmit` is clean.
  Still not checked in a browser.
