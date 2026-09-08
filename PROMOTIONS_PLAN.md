# Promotions Plan — 7 items, 3 batches

This is an agreed, in-progress work plan. It exists because the work is done
**one batch per session**: a fresh session knows nothing about the conversation
the plan was agreed in, so the decisions live here rather than in a chat.

**How to use this file.** Read the batch marked *Next*, do only that batch, mark
it Done, and stop. Do not roll into the following batch. Update
`PROJECT_GUIDE.md` in the same change (§4 for schema, §5 for new `lib` modules,
§6 for routes, §10 for anything shipped). Leave the work **uncommitted** in the
main checkout — the user commits, not us.

It follows the promotions feature that shipped in `IMPROVEMENTS_PLAN.md` Batch G
and its two follow-ups (automatic promotions; edit / pause / delete). That file
is finished and is kept only for its reasoning; **this** one is the queue.

## Status

| Batch | Items | Migration | Status |
| --- | --- | --- | --- |
| A | 1, 2 | none | Done |
| B | 3 | yes | **Next** |
| C | 4, 5, 6, 7 | none | Not started |

---

## What already exists — read this before starting anything

Do not re-derive these. The reasoning behind each is in the file's own header
comment, and `PROJECT_GUIDE.md` §5 lists them all.

| File | What it already owns |
| --- | --- |
| `src/lib/discount.ts` | The four discount kinds, the conditions, `promoStatus` (ACTIVE / PAUSED / SCHEDULED / EXPIRED / USED_UP), `bestDiscount`, `redeemPromoCode` (locks the row `FOR UPDATE` before incrementing), and every runner-facing sentence. **Free of Prisma** — both wizards import it. |
| `src/lib/promo-store.ts` | The Prisma half: `findPromoCode`, `automaticPromosFor`, `resolveDiscount`, `PROMO_TERMS_SELECT`. |
| `src/lib/promo-input.ts` | Validating the marketing form. Shared by the create and edit routes. |
| `src/lib/registration-gate.ts` | `SLOT_HOLDING_STATUSES = ['PAID','PENDING']`, `reserveSlots`, `takenSlotsByCategory`. |
| `src/app/api/admin/promos/route.ts` | POST — one code, a voucher batch, or an automatic promotion. |
| `src/app/api/admin/promos/[id]/route.ts` | PATCH (full edit, or `{ paused }` alone) and DELETE. Its `batchWhere()` is the rule that **a batch is one promotion**. |
| `src/app/admin/marketing/PromoCodesClient.tsx` | The TanStack table: search, column visibility, pagination, row menu, create/edit modal. |
| `src/app/admin/marketing/PromoActionsMenu.tsx` | The three-dot row menu (Edit · Pause/Resume · Delete). |

### Five facts that will bite

1. **`Registration.promoCode` is a snapshot string, not a relation.** It was
   made that way on purpose so a deleted promotion cannot rewrite a receipt.
   Attribution therefore matches on the **code text**, scoped to the
   organizer's own events — never by id, because there is no id to match.
2. **A batch is one promotion.** Every query, count and total in this plan must
   cover *all* codes sharing a `batchLabel`, exactly as `batchWhere()` does.
3. **`usageCount` counts orders *placed*; money counts orders *paid*.** A code
   is spent the moment the order is created (same as a slot), so an abandoned
   PayMongo checkout has a redemption and no money. The two numbers are
   genuinely different and Batch A must show both without pretending otherwise.
4. **A Prisma schema change needs the dev server restarted** — `next dev`
   bundles the generated client. `npx prisma generate` alone is not enough.
5. **Never auto-expire a `BANK_TRANSFER` registration.** It sits PENDING for
   days by design, waiting for a human to look at the proof. Batch B is only
   ever about abandoned *online* checkouts.

---

## Batch A — what a promotion actually cost, and who used it — **DONE**

Shipped as: `src/lib/promo-redemptions.ts` (attribution, the spend query and
the listing), `GET /api/admin/promos/[id]/redemptions`, the **Given** column,
the *Given Away* metric card and the *View redemptions* panel on
`/admin/marketing`, and `?search=` on `/admin/events/[id]/registrants` so a
redemption links straight to its order. `PROJECT_GUIDE.md` §5, §6 and §10
updated in the same change.


Two questions an organizer cannot answer today, sharing one query, so they are
one batch.

### 1. The peso total a promotion has given away

"Times Redeemed: 12" says how many, never how much. This is the number that
answers *sulit ba ang promo na ito?*

- Sum `Registration.discountAmount` over registrations whose `promoCode` is one
  of this promotion's codes, on events belonging to the signed-in organizer.
- **Count money on `PAID` rows only.** A PENDING online order has spent a
  redemption but no money has moved, and reporting it as given away would
  overstate the cost of every promotion with an abandoned checkout behind it.
- Surface it in three places:
  - a new **Given** column on the marketing table, beside the existing Used
    column, reading `₱4,500.00`;
  - a third metric card on `/admin/marketing` — total given away across every
    promotion;
  - the Used column gains a quiet second line when the two disagree —
    `12 redeemed · 9 paid` — so the gap in fact 3 is visible rather than
    looking like an arithmetic error.

### 2. Which orders used it

- A **View redemptions** item in `PromoActionsMenu`, above Edit.
- New route `GET /api/admin/promos/[id]/redemptions` — auth-checked and scoped
  to the organizer's own events, like every other admin route. Returns the
  orders for **all** of this promotion's codes: order reference, event title,
  runner count, status, `discountAmount`, `createdAt`, and for a voucher batch
  the specific code that was used.
- A modal listing them. Build it from the same pattern as the manual-send email
  modal (`admin/events/[id]/registrants`) — a purpose-built panel, not
  `AlertModal`, because this is a table rather than a question. Never a browser
  dialog (standing rule §8.2).
- Each row links to that event's registrants screen with the order reference in
  the search box, so "who is this person" is one click away rather than a hunt.

**No migration.** Everything needed is already on `Registration`.

### Decisions already taken for this batch

- Money is counted on `PAID` only; redemptions are counted on placement. Both
  numbers are shown rather than one being quietly preferred.
- Attribution is by code text scoped to the organizer (fact 1). A promotion
  deleted and later recreated with the same code will merge with its own
  history — accepted, and worth one sentence in the modal's header comment.
- Empty state: a promotion nobody has used shows `₱0.00` and a modal saying so,
  not a hidden column.

---

## Batch B — release what an abandoned checkout is holding (migration)

### 3. Stale PENDING registrations hold a slot and a voucher forever

An online checkout that is never paid stays `PENDING` for ever. It holds its
category slot (`SLOT_HOLDING_STATUSES` counts PENDING) and, since the
promotions work, a voucher redemption too. Nothing in the app has ever cleaned
these up.

- Add `EXPIRED` to the `Registration.status` vocabulary. Preferred over reusing
  the existing `CANCELLED`: an organizer cancelling an order and a checkout
  nobody completed are different facts, and the registrants screen will want to
  tell them apart. Add it to `ALLOWED_STATUSES` in
  `api/admin/registrations/[id]/status/route.ts` too.
- Add `Registration.expiredAt DateTime?` so the sweep is auditable and a row
  cannot be expired twice.
- **Only `paymentMethod` values that are not `BANK_TRANSFER`**, only `PENDING`,
  and only older than a stated window. **Start at 24 hours** — long enough that
  a runner who wandered off mid-payment and came back the same evening is not
  cut off, short enough that a sold-out race frees its slots the next day.
- Releasing must be one transaction per registration: set the status, stamp
  `expiredAt`, and **decrement `usageCount`** on the promotion it used, taking
  the same `FOR UPDATE` lock `redeemPromoCode` takes. Never let the count go
  below zero. The slot needs no action — it is released the moment the status
  leaves `SLOT_HOLDING_STATUSES`.
- Trigger: `POST /api/cron/expire-pending`, guarded by a secret header
  (`CRON_SECRET` in `.env` and `.env.example`), plus a `vercel.json` cron entry.
  **Vercel's Hobby plan allows one cron run per day** — check the plan before
  promising anything more frequent, and say so in the guide if it is once daily.
- Put the rule in a new `src/lib/pending-expiry.ts`, not in the route, so the
  window and the "never a bank transfer" condition have one home. The route is
  a trigger; the module is the rule.
- The runner is **not** emailed. It costs a Resend recipient against a free-tier
  ceiling of 100 a day to tell someone their abandoned checkout has been tidied
  up, and they abandoned it on purpose. Show it in the admin instead.

### Decisions already taken for this batch

- Bank transfers are never swept (fact 5).
- The row is marked, never deleted: the proof, the runners and the history stay.
- No email to the runner.
- The window is a named constant, not a magic number, so changing it is one
  edit and its reasoning stays attached to it.

---

## Batch C — the smaller gaps

### 4. No rate limit on the public code lookup

`POST /api/promos/lookup` is public and unthrottled. A promo code is meant to
be shared, so this is not a secret to protect — but nothing stops a script
walking the alphabet against it either.

- An in-memory sliding window keyed by IP (`x-forwarded-for`), in a new
  `src/lib/rate-limit.ts`. **Be honest in the comment about what it does and
  does not do**: serverless instances do not share memory, so it stops a naive
  script and not a distributed one. There is no Redis here and adding one for
  this is not worth the hosting cost.
- On a refusal, return the same shape a miss returns rather than a distinct
  error, so the endpoint does not become a nicer oracle when throttled.

### 5. Duplicate a promotion

A **Duplicate** item in `PromoActionsMenu` that opens the create modal
prefilled from the row, with the code blanked (it must be unique) and the batch
fields cleared. No new route — it is the existing create form with values in
it, which is why `formFrom()` in `PromoCodesClient.tsx` already does most of it.

### 6. An event's promotions are invisible from the event

From `/admin/events/[id]/edit` there is no way to see what promotions are
running on that race. Add a small read-only panel listing them (name, what it
gives, status) with a link through to `/admin/marketing`. Read-only on purpose:
one screen owns promotions, and a second place to edit them is a second place
for them to drift.

### 7. No warning before a promotion expires

A promotion whose `validUntil` is within the next few days gets an amber
`pending` badge hint on the marketing table — the tone already means "waiting
and needs nobody", which is exactly right. **In-app only, no email**, for the
same free-tier reason as Batch B.

---

## Decisions already settled — do not relitigate

These carry over from the promotions work in `IMPROVEMENTS_PLAN.md`.

- A **single-use voucher is a usage limit of 1**, not a separate flag.
- A discount **never touches the platform fee or the transaction fee**.
- A promo code is **spent when the order is placed**, not when it is paid.
- Buy-X-get-Y counts **whole groups only**, and the **cheapest** runners on the
  order go free.
- Promotions **never stack**: where more than one qualifies, only the largest
  applies, and a tie goes to the automatic one.
- A free slot is **offered in step 1, never added silently**.
- A **batch of vouchers is one promotion**: editing, pausing or deleting any of
  them does the whole batch.
- **How a promotion is claimed cannot be edited** — only what it gives.
- Stopping a promotion is **Pause / Resume**, matching the events table's
  registration hold. Deleting is for a mistake, not for a decision.
- The app **stays on Resend's free tier in production** — 100 recipients a day.
  Do not propose an email for anything in this plan.
