# Pacer Discount Plan: free entries for an event's pacers

This file tracks the **pacer code**, a free entry for one named pacer in one
category of one race, as the owner agreed on 2026-09-19. **One batch per
session.** When a batch lands, tick its boxes, add a line under *Where it
stands*, and update `PROJECT_GUIDE.md` in the same change.

**Start this only after `MARKETING_DISCOUNTS_PLAN.md` has landed.** A pacer
code is locked to its category through the `PromoCategory` table that plan
adds, and it uses the per-runner pricing (`Runner.promoPrice`) that plan
extends.

## What the owner decided

| Question | Decision |
|---|---|
| What a pacer code gives | **100% off the pacer's entry line** (the category price plus any shirt upcharge). |
| The admin fee | A per-code toggle, **"Include admin fee in discount"**. Off: the pacer still pays the admin fee and goes through checkout as usual. On: the total is ₱0 and **the payment step is skipped**. |
| Who may turn the admin fee toggle on | **The Super Admin only.** The admin fee is Run As One's money (`settlement.ts`), so waiving it is Run As One giving it away. Admins see the toggle disabled with a reason; the server refuses it from anyone else. |
| Uniqueness | **One unique code per pacer**, locked to **one event and exactly one category**. It is single-use. |
| Does a pacer take a category slot | **Yes.** They run, and they need a bib and a singlet. |
| Group registration | **Not allowed.** A pacer code is accepted only on a one-runner order. Anyone registering with the pacer uses a separate order. |
| Where it is managed | **A screen for the event**, `/admin/events/[id]/pacers`, reached from the event row's action menu (**Pacers**, with an icon and a label). It is not a top-level navigation item, and it is not added to the Marketing table. |
| Who registers the pacer | **The pacer**, through the public wizard, typing the code. That way they still give consent, the waiver, an emergency contact and, if a minor, guardian consent. |

### Why it is not in `/admin/marketing`

A pacer code is not a promotion; it is a free entry given to a named person.
Listing pacers among promotions would add their entries to *Given Away* and
*Times Redeemed*, and it would put a per-person list into a table built for
campaigns. A pacer is also meaningless without an event and a category, which
is why the screen belongs under the event, next to Registrants and Results.
The URL follows the same rule (`/admin/events/[id]/…`).

### Why a pacer registers on their own

- When the admin fee is waived, a solo order is exactly ₱0, so the free path
  is clean. A group order would be half paid and half free, which complicates
  the receipt, the settlement and any refund.
- The pacer's slot cannot be lost with somebody else's unpaid order. An
  abandoned group checkout that expires would otherwise release the pacer too.
- The code, the order reference and the confirmation email all belong to one
  person.

## Where things live today (checked 2026-09-19)

- `PromoCode` (`prisma/schema.prisma`) with `discountType` a guarded string.
  After `MARKETING_DISCOUNTS_PLAN.md` it has `PromoCategory` rows and
  runner-counted limits.
- `src/lib/discount.ts` `discountAmountFor` says **fees are never
  discounted**. The pacer's admin-fee waiver is the one deliberate exception,
  and it must be written as an exception in that comment, not added silently.
- `src/app/api/checkout/route.ts` recomputes
  `expectedPlatformFee = event.adminFee × participants.length` and pins the
  total. It then always creates a PayMongo payment intent or checkout session.
  PayMongo cannot charge ₱0, so a zero-total order must never reach it.
  `api/checkout/manual/route.ts` is the bank-transfer route and needs the same
  treatment, because an event can use either wizard.
- `src/lib/registration-codes.ts` `PAYMENT_METHODS` is `BANK_TRANSFER`,
  `GCASH` and `CARD`.
- `src/lib/permissions.ts`: `promo:manage` is `OWNER` and `ADMIN`;
  `org:settings` is `OWNER` only and means "set the default platform fee".
- `src/app/admin/events/EventActionsMenu.tsx` lists *Registrants*, *Manage
  Results* and *Edit Event* (~l.172). *Pacers* goes here.
- `src/lib/voucher-codes.ts` generates readable random codes. Reuse it.

## Data

- `discountType` gains **`PACER`**. `discountValue` is unused (the discount is
  always the whole entry line).
- `PromoCode` gains **`waiveAdminFee Boolean @default(false)`**,
  **`assigneeName String?`** (the pacer's name, uppercase like every other
  registrant name, shown only in the dashboard) and **`codeSentAt DateTime?`**
  (when staff marked the code as sent; see *Settled after the plan was
  written*).
- The category is **exactly one `PromoCategory` row**, enforced by the input
  rule rather than the schema.
- `eventId` is required, `usageLimit` is 1, and `automatic` is false.
- The code is generated as `PACER-<category>-<4 random>`, for example
  `PACER-21KM-7KQ4`, using the `voucher-codes.ts` alphabet. The category part
  is its **distance** with anything that is not a letter or digit removed, and
  shortened; its **name** is the fallback for a category with no distance
  recorded. (The owner chose the distance over the name on 2026-09-22, after
  seeing "HALF-MARATHON" come out as `PACER-HALFMARA-…`.)
- **New permission verb `promo:waive-fee`**, granted to `OWNER` only, with a
  label and a `ROLE_HINTS` line. Do not reuse `org:settings`: that verb means
  "set the default platform fee", and routes check verbs, never role names.
- `PAYMENT_METHODS` gains **`COMPLIMENTARY`**, labelled *Complimentary*.
- A `Registration` from a pacer code already snapshots
  `discountType = 'PACER'`, so the registrants table can badge it without a
  new column.
- One migration, in Batch 1. Production needs `npx prisma migrate deploy` by
  hand when it is released.

## Batch 1: pacer codes and the Pacers screen

- [x] **Migration** for `waiveAdminFee`, `assigneeName` and `codeSentAt`. Add `PACER` to
  `DISCOUNT_TYPES`, and `promo:waive-fee` to the matrix.
- [x] **`src/lib/pacer.ts`** (Prisma-free): the rules for what a pacer code
  is, `pacerCodeFor(categoryName)`, and input checks (a name is required, the
  category must belong to this event, `waiveAdminFee` needs
  `promo:waive-fee`). Each refusal names its field.
- [x] **`api/admin/events/[id]/pacers`**: GET (the list), POST (add a pacer and
  generate the code). **`[pacerId]`**: PATCH (rename, pause or unpause,
  toggle the waiver, mark as sent or not sent) and DELETE (only while the code is unclaimed; once used,
  pause it instead). Require `promo:manage` scoped to the event's organizer.
  If the waiver changes without `promo:waive-fee`, answer 403 with the field.
  Every write is audited; a waiver turned on is its own verb
  (`pacer.fee_waived`) with a label and an Activity group, so it stands out.
- [x] **`/admin/events/[id]/pacers`**, from the action menu's *Pacers* item:
  - The header gives the event name and a line saying what a pacer code is.
  - Pacers are **grouped by category** (in `CATEGORY_ORDER`, name and
    distance). Each row shows the name, the code with a copy button, the
    *Admin fee waived* chip, and the status: *Not yet used* or *Registered*.
    *Registered* shows the order reference and links to that registrant.
  - **Add pacer** opens `.admin-modal-panel` with Category (`AdminSelect`),
    Pacer name (with an uppercase sample placeholder), and the waiver toggle.
    For anyone but the Super Admin the toggle is disabled with the hint "Only
    the Super Admin can waive the admin fee."
  - Row actions show an icon and a label (Copy code, Mark as sent, Rename,
    Pause, Delete), in the Actions column under its header.
  - **The not-sent reminder**: the amber *Code not sent* chip, the header line
    and the count on the action menu's *Pacers* item, all read from one
    `needsCodeSent(pacer)` rule in `pacer.ts`.
  - Buttons use the dashboard's outline style, not the gradient.
  - Below `lg`, rows become cards, with no horizontal scroll at 375px, and the
    loading state draws this layout (`RunnerLoader`).
- [x] **Hide pacer codes from `/admin/marketing`**: `page.tsx`'s query and its
  metric cards exclude `discountType = 'PACER'`, and so does
  `promo-redemptions.ts`.
- [x] `PROJECT_GUIDE.md`: §4 (`PromoCode` columns, `PACER`), §5 (`pacer.ts`,
  `permissions.ts`), §6 (the page, the routes, the action menu), §7 (who may
  waive), §10.

After this batch, a code exists but checkout does not accept it yet;
`promoCodeError` reads it as taking nothing off. **Do not promote `dev` to
`main` until Batch 2 lands.**

## Batch 2: the pacer registers, and the free checkout

- [ ] **`discount.ts`**: `PACER` pricing is the full entry line of the one
  runner in its category. `promoCodeError` refuses:
  - more than one runner: "Pacer codes cover one runner. Register the pacer on
    their own, then register the rest of the group as a separate order."
  - the wrong category: "This pacer code is for the 21K."
  `AppliedDiscount` carries `waivesAdminFee`.
  The pacer code **always wins** over any automatic promotion, because it
  already takes off the whole entry.
- [ ] **The fee in the wizard summary**: when `waivesAdminFee` applies, the
  admin fee line shows as waived (struck through at ₱0), and the transaction
  fee is 0 because there is nothing to charge.
- [ ] **Both wizards, total ₱0**: the payment step disappears (the step
  counter shows one fewer step) and the last button reads *Complete
  registration* instead of a payment button.
- [ ] **The free checkout path, on the server.** One shared helper in `lib`,
  called by both checkout routes **only when their own recomputed total is
  exactly 0**. The client never decides this. The helper:
  - runs every existing check (consent, the waiver, birthdate, guardian
    consent, slots and `redeemPromoCode`) inside the same transaction;
  - writes the registration as `PAID` with `paymentMethod = 'COMPLIMENTARY'`,
    `platformFee = 0`, `transactionFee = 0` and `totalAmount = 0`;
  - **never calls PayMongo**;
  - sends the confirmation email right away, and not the "received, awaiting
    payment" email, because there is nothing to wait for.
  Both routes change `expectedPlatformFee` to 0 for a waived pacer order, so
  the fee pin still holds.
- [ ] **Non-waived pacer**: nothing new. The total is the admin fee (plus any
  delivery), and it goes through the normal checkout.
- [ ] Verify on `local-dev`: a waived pacer completing with no payment page and
  one confirmation email; a non-waived pacer paying only the admin fee; a
  pacer code refused on a group of 2 and on the wrong category; a used code
  refused a second time; a posted total of 0 on an order that is **not** free
  being refused with 409.
- [ ] `PROJECT_GUIDE.md`: §5 (the helper, `discount.ts`), §6 (both wizards),
  §7 (the ₱0 path is decided on the server only), §10.

## Batch 3: pacers everywhere else the dashboard shows an order

- [ ] **Registrants**: a *Pacer* chip on the row, the card and the detail
  modal (read from `Registration.discountType`); a *Type → Pacers* option in
  the one Filters sheet; and a Pacer column in the CSV export.
- [ ] **Payments and validation**: a `COMPLIMENTARY` order never appears as
  waiting for a payment check, and its detail says *Complimentary: pacer
  entry*.
- [ ] **Settlement** (`settlement.ts`): check that a ₱0 order adds nothing
  owed and that a non-waived pacer's admin fee is counted as Run As One's.
  Add a line to the settlement breakdown if pacers appear there.
- [ ] **The Pacers screen**: *Registered* links go to the registrant, and the
  header shows "N of M pacers registered".
- [ ] Check every screen that prints a payment method or a fee so none shows
  "₱0 via undefined" (the fix-display-defects-everywhere rule).
- [ ] `PROJECT_GUIDE.md` §6, §10.

## Settled after the plan was written (owner, 2026-09-19)

- **Delivery fee**: the pacer pays it. The code covers the entry and, when
  waived, the admin fee, never delivery. A pacer who chooses delivery goes
  through checkout for that amount.
- **Shirt upcharge** (4XL and up): covered, as part of the entry line.
- **Sending the code**: the app sends no email to the pacer. Staff copy the
  code and send it themselves. **The owner asked for a visible reminder of
  which pacers have not been sent their code yet**, so the dashboard has to
  track it:
  - `PromoCode` gains **`codeSentAt DateTime?`**, which is null until staff
    mark the code as sent. It is part of Batch 1's migration.
  - Each row has a **Mark as sent** action (with an icon and a label), and
    **Mark as not sent** to undo it. Both are audited, so the trail shows who
    marked it.
  - A pacer **needs a reminder** when `codeSentAt` is null **and** the code is
    unused. Once the pacer has registered, they clearly received it, and the
    reminder goes away whatever the mark says.
  - The reminder shows in three places:
    - an amber **Code not sent** chip on the row and on the card;
    - an amber line in the screen header ("3 pacers have not been sent their
      code");
    - a count on the event action menu's **Pacers** item ("Pacers · 3 not
      sent"), so it is visible without opening the screen.
  - Copying the code does **not** mark it as sent. Copying is not sending, and
    a guessed mark would hide a pacer who was never told.

## Where it stands

- 2026-09-19: the plan was written from the owner's decisions. Waits on
  `MARKETING_DISCOUNTS_PLAN.md`.
- 2026-09-22: **Batch 1 landed** (uncommitted until the owner says so).
  Migration `20260922100000_pacer_codes`, applied to `local-dev` only —
  production needs `npx prisma migrate deploy` at release. `tsc --noEmit` is
  clean and `next build` compiles, with all three new routes registered.

  What was built beyond the letter of the checklist, and why:

  - **`src/lib/pacer-store.ts`** as well as `pacer.ts`. `pacer.ts` had to stay
    Prisma-free (the screen is a client component and imports its rules), so the
    queries, `PACER_SELECT` and `NOT_A_PACER` live in a store module beside it,
    the same split `promo-store.ts` / `discount.ts` already uses. `PACER_SELECT`
    started life as an export from the POST route, which Next would have been
    entitled to reject as a non-handler export from a `route.ts`.
  - **`randomCodeBlock`** exported from `voucher-codes.ts`, so `pacerCodeFor`
    uses that module's unambiguous alphabet rather than a second copy of it.
  - **A *Waive / Charge admin fee* row action**, Super Admin only, withheld by
    not passing its handler. The plan's row-action list does not name it but the
    PATCH route does, and something has to be able to call it — otherwise the
    waiver could only ever be set at creation.
  - **A new shared `.admin-switch-row`** in `Admin.css` for the waiver toggle:
    the account menu's Dark Mode switch generalised out of
    `.account-theme-switch`, since nothing reusable existed. A disabled row keeps
    its hint at full contrast and dims only the track — the person who may not
    use it is the one who has to read why. Documented in `PROJECT_GUIDE.md` §9.
  - **`PROJECT_GUIDE.md` drift fixed in passing**: its `discount.ts` entry still
    described `PER_RUNNER_CHECKOUT_READY`, which `MARKETING_DISCOUNTS_PLAN.md`
    Batch 2 deleted from the code on 2026-09-22.

  Notes for Batch 2:

  - `discountAmountFor` has a `case DISCOUNT_TYPES.PACER: return 0` that Batch 2
    replaces with the real pricing. `describePromo` already says "Free pacer
    entry".
  - **`promo-store.ts` was deliberately left alone**, which is the one rough edge
    of this batch. `findPromoCode` will therefore *find* a pacer code, and
    `acceptsPromoCodes` counts one when deciding whether to show the wizard's
    promo box — so an event whose only typed code is a pacer's now shows that
    box, and a pacer typing their code would be told it takes nothing off. Both
    are Batch 2's territory (it is the batch that teaches checkout the kind), and
    **this is the concrete reason `dev` must not reach `main` in between.**
  - The `PacerRow` the screen receives already carries `order`
    (`pacerOrdersByCode`), so Batch 3's *"N of M pacers registered"* header needs
    no new query.
- 2026-09-22: **Batch 1 verified in the browser** on `local-dev`, signed in as
  the Super Admin, against BizRun V2.0. Confirmed end to end: the *Pacers* item
  and its “Pacers · 1 not sent” count; the screen, its empty state and the amber
  header line; the modal (category options keeping name **and** distance, the
  uppercase placeholder, the switch off by default and enabled for the Super
  Admin); field-specific validation on both boxes; creation (a lowercase name
  stored uppercase, `PACER-HALFMARA-RFGG` generated); **copying leaving the
  *Code not sent* chip in place**; mark as sent / not sent; rename leaving the
  code untouched; pause; the fee waiver and its blue chip; delete with its
  confirmation; the trail carrying `pacer.created`, five `pacer.updated` and a
  separate `pacer.fee_waived`; the Activity *Pacers* group; the matrix row
  (Super Admin only); and `/admin/marketing` unchanged — the pacer code absent
  and all three metric cards identical to their pre-test values. 375px: cards,
  no horizontal scroll, nothing overflowing. The test pacer was deleted
  afterwards and the event is back to zero.

  Two defects were found by looking and are fixed:

  - **The rename trail entry read circularly** — “Pacer MARIA SANTOS: renamed to
    MARIA SANTOS” — because the PATCH route summarised the change under the
    *new* name. It now uses the name as it was (`priorName`), while the waiver
    entry keeps the current one, since that entry identifies a person rather
    than describing a change to their name.
  - **The card footer had a lone ⋮ on the left**, where every other card list in
    the dashboard pairs a labelled shortcut with the menu pushed right. The
    pacer card now carries a *Copy code* button beside the menu.

  One thing was raised and then settled: the code's middle section was the
  category **name**, shortened to 8 characters, so “HALF-MARATHON” became
  `PACER-HALFMARA-RFGG`. **The owner chose the distance instead** — cleaner and
  shorter — so `pacerCodeFor` now takes the category and prefers
  `Category.distance`, keeping the name only as the fallback for a category
  that has no distance. The data section above and `PROJECT_GUIDE.md` §5 say
  the same.

  Also worth knowing: the dev server must be **restarted** after this batch is
  pulled, or the newly-created `api/.../pacers` directory is not registered and
  every write answers 404.
