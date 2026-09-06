# Improvements Plan — 14 items, 7 batches

This is an agreed, in-progress work plan. It exists because the work is done
**one batch per session**: a fresh session knows nothing about the conversation
the plan was agreed in, so the decisions live here rather than in a chat.

**How to use this file.** Read the batch marked *Next*, do only that batch, mark
it Done, and stop. Do not roll into the following batch. Update
`PROJECT_GUIDE.md` in the same change (§4 for schema, §5 for new `lib` modules,
§6 for routes). Leave the work **uncommitted** in the main checkout — the user
commits, not us.

## Status

| Batch | Items | Migration | Status |
| --- | --- | --- | --- |
| A | 12, 5, 6 | none | Done |
| B | 4, 7, 13 | none | Done |
| C | 2, 3 | yes | Done |
| D | 1, 10 | yes | Done |
| E | 11, 9 (+ security fix) | yes | Done |
| F | 14 | yes | **Next** |
| G | 8 | yes | Not started |

Batch F is deliberately ahead of the voucher work: the app is going to
production **on Resend's free tier**, so the quota fallback matters before
discounts do.

---

## Batch A — quick wins, no schema — **Done**

Two things came out of it that were not in the plan, both kept:

- Capping a Philippine field at ten digits exposed an ordering bug in
  `PhoneField`: it truncated *before* stripping the trunk zero, so a pasted
  `09171234567` lost its last digit. Normalizing now happens first.
- The "still missing" dialog in both wizards said *"Only these are still
  blank"*, which is untrue of a number that is present but too short. Both
  wizards now say "need your attention".

The icon vocabulary in item 6 was then corrected by the user against their real
inclusion lists: the ticket is the *raffle's*, a race bib gets a chequered race
flag, a bandana gets a bandana, a band or wristband gets `Watch`, a pin gets
`Badge`, and an entitlement gets `Gift`. Lucide carries neither the chequered
flag nor the bandana, so both are drawn in `lib/inclusion-icon.ts` through
`createLucideIcon`.

### 12. Submit button: remove the ellipsis
The loading labels read `"Submitting Registration..."` and `"Processing..."`.
Drop the trailing `...` from all three:
`RegistrationWizardClient.tsx:1405`, `:1550`, `BankTransferWizardClient.tsx:1312`.

### 5. Contact number limited to 10 digits
`lib/phone.ts` currently derives the cap from the E.164 maximum, which allows 13
national digits for `+63` — far too loose. Add a per-country expected national
length (PH = 10), have `maxNationalDigits` respect it, and make the validation
message name the rule ("Contact number must be 10 digits") rather than failing
generically. Applies to both the runner's phone and the emergency contact.

### 6. "What's Included": no cards, one icon per item
`InclusionsGrid` in `src/app/events/[slug]/page.tsx:238` renders every inclusion
as a card — `bg-white/5`, `p-3 sm:p-4`, `rounded-2xl`, a border, and a 40–48px
tile holding the same `CheckCircle2` for every row. That is what makes the boxes
tall.

- Remove the card, the border, and the icon tile. A plain icon-and-text row.
- Replace the generic check with an icon that matches the item: `Shirt` for a
  singlet or finisher shirt, `Medal` for a medal, `Ticket` for a bib or race
  number, `Backpack` for a race kit or bag, `GlassWater` for hydration,
  `Utensils` for a meal, `Camera` for photos, `Timer` for chip timing.
- The mapping goes in a new `src/lib/inclusion-icon.ts` (keyword → lucide icon,
  with a `Check` fallback for anything unrecognised), so the same inclusion
  never draws a different icon on a different screen. Add it to
  `PROJECT_GUIDE.md` §5.

---

## Batch B — casing and export — **Done**

Three things worth carrying forward:

- The uppercasing lives in `src/lib/text-case.ts`, which also names the field
  list (`UPPERCASED_RUNNER_FIELDS`) so the two wizards, the admin edit modal and
  the two checkout routes cannot drift apart on *which* fields are uppercased.
  The runner's club was the exception: it is uppercased one level down, in
  `asRunnerCommunity`, because that function already owned the whole shape of a
  stored club name and the picker's snap-to-approved-casing has to run first.
- The backfill script *was* written in the end, and run. It was skipped at first
  (the test data was going to be deleted anyway), but once the uppercase rule
  reached the category name and the coded columns, existing rows were visibly
  wrong on screen. `scripts/uppercase-existing-data.ts` (`npm run
  uppercase:existing`, `-- --write` to apply) brings any pre-rule row into line;
  it is a dry run by default, idempotent, and leaves every email address alone.
- The uppercase rule then grew past the plan's "leave admin fields alone", on
  the user's instruction and twice over. The **category / package name** is
  uppercased, because it is printed beside runner data in the registrants table,
  the export and the emails. And the three coded columns on a Registration —
  `paymentMethod`, `logisticsMethod`, `deliveryZone` — now store `BANK_TRANSFER`
  / `DELIVERY` / `INSIDE` instead of PayMongo's lowercase, which is what the
  rest of the schema (`status`, `role`, `eventType`, `registrationForm`) always
  did. `src/lib/registration-codes.ts` owns those codes, their guards (which
  accept either casing, so no backfill is needed) and their labels;
  `paymongoPaymentType()` is the only place anything is lowercased again.
- `registrants/page.tsx` was flattening `medicalConditions` to the display word
  `"None"`, and the edit modal PUTs that same row straight back — so every
  admin edit was saving `"None"` as the runner's actual medical history. The row
  now carries the raw value and each screen supplies its own empty wording. It
  was found because item 4 put an uppercase helper on that exact column.


### 4. Registrant details stored in UPPERCASE
The point is the **stored value**, not a CSS transform: uppercase on entry so
the database, the admin table, the runner modal, the CSV export and the
e-certificate are uniform by construction.

Uppercase: first name, last name, emergency contact name, delivery address,
medical conditions, running community.
Leave alone: **email** (case-sensitive on some mail servers — uppercasing breaks
delivery), passwords, phone numbers, blob URLs, and all admin-side fields
(event title, category name, bank name).

Do it in two places: as the runner types (so they see what will be stored) **and**
in the API before the write, because a tab left open can POST directly and the
server has to be the last word. A shared helper — `lib/text-case.ts` — keeps both
wizards, the admin runner-edit modal, and the API agreeing.

*Optional, ask first:* a one-off `scripts/` backfill to uppercase existing rows.
The user plans to delete the test data before production, so if that has already
happened, skip the script rather than leave a throwaway file behind.

### 7. Fix the CSV export
`handleExportCSV` in `RegistrantsTable.tsx:446` has two real bugs:
- Phone numbers are unquoted, so Excel reads `+639171234567` as a formula or a
  number and mangles it.
- Only *some* fields are quoted, so any name or category containing a comma
  shifts every following column.

Escape every field properly, force the phone to render as text, and prepend a
UTF-8 BOM so Excel reads accented characters correctly. Item 4's uppercasing and
item 1's sub-reference both land in this export too.

### 13. Remove the BCC archive
`sendEmail()` in `lib/email.ts:74` blind-copies every send to `ARCHIVE_EMAIL`.
Resend counts **each recipient separately** — to, cc and bcc alike — so this
doubles the quota cost of every email: 4 quota units per registration against a
free-tier ceiling of 100/day, i.e. only ~25 registrations a day.

Remove the `bcc`. `ARCHIVE_EMAIL` in `lib/site-contact.ts:27` then has no
remaining caller, so remove it too. Resend's own dashboard retains a log of what
was sent, which is what the archive mailbox was for. Update the `email.ts` row in
`PROJECT_GUIDE.md` §5, which currently states that every email is archived.

Removing the BCC doubles headroom to roughly 50 registrations a day. **The app
is staying on the free tier, including in production** — that is a decision, not
an oversight, and Batch F exists to make the ceiling survivable rather than
silent.

---

## Batch C — registration gates (migration) — **Done**

Both items landed as planned, on one migration
(`20260906120000_registration_gates`) and one new module,
`src/lib/registration-gate.ts`, which owns the counting, the wording and the
gate. Five things are worth carrying forward:

- **The lock, not just the transaction.** The plan said "enforce inside a
  transaction that re-counts before writing". A transaction alone is not enough
  at Postgres's default isolation: two orders for the last three slots would
  each count three and each be allowed, because neither sees the other's
  uncommitted rows. `reserveSlots` therefore takes `SELECT ... FOR UPDATE` on
  the capped `Category` rows *before* counting, ordered by id so two orders for
  the same event cannot deadlock. Uncapped events take no lock and run no count.
- **A `Runner(categoryId)` index came with it.** Postgres does not index a
  foreign key by itself, and this count now runs on the event page, both
  wizards, both checkout routes and every public listing.
- **The picker says how many are left, not only whether it is full.** A group of
  four picking an option with three slots left would otherwise fill in four
  forms and be refused at checkout. Under twenty left (`LAST_CALL_SLOTS`), the
  option carries the number; above it, a running count on a 500-slot race is
  noise. The checkout error names the option and the shortfall either way.
- **Paused events got the badge too.** The plan asked for a FULL badge on
  `EventGrid`; a paused event still showing "Register Now" would have been the
  same lie in a different colour, so one mechanism carries both, and the button
  becomes a plain "View Event" that still opens the page where the reason is.
- **The pause toggle is a menu item, not a switch.** `/admin/events` had no
  switch primitive to copy, and inventing one would have broken the "a new
  control copies an existing one" rule. It is an item in the existing
  `EventActionsMenu` plus a Registration column showing OPEN / PAUSED / FULL /
  RACE OVER, on the existing `status-badge` (a `neutral` variant was added for
  the two states that are neither good news nor a warning). The toggle sends a
  new `PATCH /api/admin/events/[id]` rather than re-posting the whole event, and
  the *note* is written in the edit form, where there is room for it.

Also worth knowing, found while verifying: **`/` and `/events` are prerendered
at build time**, so on Vercel their badges are a deploy-time snapshot. That
predates this batch — a newly published event has the same problem — and the
dynamic pages and both checkout routes are always current, so nothing can be
registered against a stale card. Noted in `PROJECT_GUIDE.md` §10; making those
two pages dynamic is a decision, not a fix to slip in here.

### 2. Per-category slot limit
The limit belongs to the **`Category`**, not the event: 500 slots on the 10K and
300 on the 5K, and when the 10K fills the 5K stays open. The event closes only
when every category is full.

- `Category.slotLimit Int?` — null means uncapped.
- Count taken slots from `Runner` rows whose registration is `PAID` **or**
  `PENDING`. Counting only `PAID` would oversell every event that takes bank
  transfers, because those sit pending until a human verifies them.
- Enforce inside a transaction that re-counts before writing, in both
  `api/checkout` and `api/checkout/manual`. Two runners submitting at once will
  otherwise both pass a check made outside the write.
- UI: a "FULL" chip and a disabled row in `CategoryPicker`, a "FULL" badge on
  `EventGrid`, and a `StatusPanel` on the register page when everything is full.

### 3. Pause registration
A manual hold, distinct from item 2's automatic one — the organizer stops
sign-ups even though slots remain and the race has not happened.

- `Event.registrationPaused Boolean @default(false)` and
  `Event.registrationPauseNote String?` (what runners are told).
- A toggle on `/admin/events` and in the event edit form.
- Server-side gate in both checkout routes, plus a `StatusPanel` on the register
  page. UI-only would not hold: an open tab will still POST.

---

## Batch D — order identity and logistics (migration) — **Done**

Landed on one migration
(`20260906140000_runner_number_and_pickup_details`) and two new modules,
`src/lib/order-ref.ts` and `src/lib/pickup.ts`. Four things are worth carrying
forward:

- **The order reference is not replaced, it is joined.** The registrants table
  and the CSV now lead with the runner's own reference, but the order reference
  stays beside it in both the export and the detail modal. They answer
  different questions: the runner reference identifies a person, the order
  reference is what the group paid under and what an organizer matches against
  a line on their bank statement.
- **`newOrderRef` moved into `order-ref.ts` with it**, because the same
  `crypto.randomBytes(4)` was written out in both checkout routes and the
  format now has a second half that must agree with it. It uses **Web Crypto**
  rather than node's `crypto` module: the registrants table is a client
  component and imports the same file, and pulling a node built-in into the
  browser bundle to format a string would be a poor trade.
- **`runnerNo` has no default and is unique per registration.** The migration
  adds it nullable, backfills with `ROW_NUMBER()` over each registration, then
  sets NOT NULL — a blanket `DEFAULT 1` would have made every member of an
  existing group "runner 1". Leaving the default off afterwards means a future
  write has to say which position it is rather than silently claiming the
  first. The emails sort by it rather than trusting the order a Prisma include
  returns rows in.
- **The pick-up card was the whole point of item 10.** It used to read "Pick up
  your race kit at designated partner stores 3 days before the event" — wording
  invented by the app, naming no store and no date. It now carries the
  organizer's own address and hours, and where they have not settled them yet,
  a sentence saying the organizer will confirm. The same words repeat on the
  confirmation screen and in the received email, which is what the runner
  actually still has on race week.


### 1. Per-runner sub-reference
One `orderRef` covers a whole group today. Give each runner
`RM-D918005C-1`, `-2`, `-3`.

- `Runner.runnerNo Int`, assigned 1..n at creation in both checkout routes.
  Stored rather than derived from row order: `createMany` does not guarantee
  read-back order, and a number that changes between page loads is worse than no
  number. Four bytes is nothing against Neon's 0.5 GB.
- Surface it in the registrants table, the runner detail modal, the CSV export,
  and both registration emails.

### 10. On-site pick-up location
`logisticsPickup` is only a boolean — "Allow On-site Pickup (Free)" — and never
says *where*.

- `Event.pickupLocation String?` and `Event.pickupSchedule String?`.
- Fields in the admin new/edit forms; shown on the pick-up card in both wizards,
  on the confirmation screen, and in the registration email — a runner choosing
  pick-up needs the address at the moment they choose it, not later.

---

## Batch E — consent and payment review (migration) — **Done**

Landed on one migration (`20260906160000_consent_signature_and_remarks`) and
one new module, `src/lib/consent-signature.ts`. Five things are worth carrying
forward:

- **The match is deliberately loose about everything that is not the name.**
  Case, runs of whitespace, and the punctuation around a suffix are stripped
  before comparing, so "DELA CRUZ, JR." and "Dela Cruz Jr" are one signature —
  and **either name order is accepted**, because Filipino forms ask for the
  surname first about as often as last, and refusing `DELA CRUZ MARIA` would
  reject a correct name on a technicality. A hyphen survives normalization: it
  is part of the name, not typing noise.
- **The error is shown on blur, not on every keystroke.** Every correct name is
  a mismatch while it is half-typed, so complaining as the runner types would
  be true and useless. The inline message under the field quotes what was typed
  and names an actual runner as the example; the same string is what the server
  returns, so the two can never say different things.
- **The signature does not disable the submit button.** The consent tick still
  does, but a filled box holding the wrong name has something specific to say,
  and a greyed-out button says nothing — so clicking submit is what produces
  the named error and puts the caret back in the box.
- **The status route's receipt email now fires on the transition only.** It
  used to send whenever a PATCH carried `status: 'PAID'`. With remarks sharing
  that route, a second PATCH on an already-paid registration would have sent
  the runner a second receipt, so the send is now gated on the previous status.
  The status itself is guarded against a fixed list, like every other coded
  column.
- **A remark belongs to the order, not the row it was opened from.** A group of
  five shares one note, so saving updates every one of their rows and the modal
  says "2 runners" rather than naming one of them. `remarksBy` stores the
  organizer's *name*, not their id: it is a line in a log and has to keep
  reading correctly after an account is removed.

Also worth knowing, found while verifying: **a Prisma schema change needs the
dev server restarted.** `next dev` bundles the generated client, so a running
server keeps the pre-migration data model and 500s on a write to a brand-new
column even though `prisma generate` has already run and the column exists.
Noted in `PROJECT_GUIDE.md` §10.

And one thing deliberately left alone: three admin routes
(`admin/events/[id]`, `admin/runners/[id]`, `admin/runners/bulk-delete`) test
`auth.role !== 'SUPERADMIN'` where the role is actually spelled `SUPER_ADMIN`,
so the super-admin bypass in them never fires. It fails *closed* — those routes
still scope to the organizer — so it is a correctness wart rather than a hole,
and fixing it is a change to who can reach what, which is not this batch's
call. The new code in the status route uses the correct spelling.


### 11. Typed signature on the disclaimer
Beyond the existing checkbox, the runner types their full name as a digital
signature.

- `Registration.consentSignature String?`, beside the existing `consentGiven` /
  `consentGivenAt`.
- **Validation: the typed name must match any one runner on the order**
  (case- and whitespace-insensitive), so one member of a group can process the
  whole registration. A specific error naming the mismatch, per the project's
  validation rule — never a generic failure.
- Gate it server-side in both checkout routes as well as in the wizard.

### 9. Remarks for the payment validator
**Internal only.** No email goes to the runner — an assigned staff member
reaches out manually. Do not build a rejection email in this batch.

- `Registration.remarks String?`, `remarksBy String?`, `remarksAt DateTime?`.
- An icon in the registrants table's Actions column, **aligned under its column
  header** (standing rule §8.6), opening a modal built from the existing
  `AlertModal` / `AlertProvider` primitives — never a browser dialog.
- `PATCH /api/admin/registrations/[id]/status` accepts the remarks; the runner
  detail modal displays them.

### Security fix — do this in the same batch
`src/app/api/admin/registrations/[id]/status/route.ts` **has no auth check**. It
is the only one of the ten admin API routes that never calls `getAuthCookie()`,
and it does not scope to the signed-in organizer. Anyone on the internet who
guesses a registration id can mark it `PAID` and trigger a receipt email.

This contradicts `PROJECT_GUIDE.md` §7, and `src/proxy.ts` does not cover
`/api/**`. Add the auth check and scope the update to an event belonging to the
signed-in organizer. It is fixed here because this batch already opens that file
and adding a remarks feature to an unauthenticated route would be worse than
leaving it alone.

---

## Batch F — email quota fallback (migration)

### 14. Flag unsent emails, and let a person send them by hand
The app stays on Resend's free tier in production: 100 recipients a day, no
overage — it stops rather than bills. When that ceiling is hit, a registration
must not silently go unconfirmed. It gets a visible mark in the admin, and an
assigned staff member sends the email themselves, from their own address.

**Record whether each send actually happened.** `sendEmail()` in `lib/email.ts`
currently logs and swallows every failure and returns `void`, so nothing
downstream can tell a delivered email from a dropped one. Have it report its
outcome, and have the callers write that down:

- `Registration.receivedEmailSentAt DateTime?`
- `Registration.confirmationEmailSentAt DateTime?`
- `Registration.lastEmailError String?` — Resend's reason, so a quota stop is
  distinguishable from a bad address.

`sendEmail()` must still **never throw**. A registration and a payment cannot
depend on Resend being up; that rule does not change, only the reporting does.

**Show it.** A clear mark on any registrant row whose email never went out, and
a filter to list exactly those — on a day the quota runs out, the staff member
needs the whole backlog on one screen, not a hunt row by row.

**Send by hand.** A button opens a modal holding the recipient, the subject, and
the rendered email, with two ways out:

1. *Open in my email app* — a `mailto:` carrying a **plain-text** rendering of
   the same template, with the recipient and subject prefilled.
2. *Copy formatted email* — writes the **HTML** to the clipboard, so pasting
   into Gmail's compose window keeps the real design: logo, gradient bar, status
   pill.

Both are needed because **`mailto:` cannot carry HTML.** Its body is plain text
only, and URL length limits truncate anything long, so a `mailto:` alone would
quietly send a mangled fragment of the template. The clipboard route is what
actually preserves the design; the `mailto:` is what fills in the addressing.
The same constraint rules out a Gmail compose deep link.

Build the plain-text rendering from the **same source** as the HTML — one
template producing two renderings, never two templates that can drift apart.

Mark the registration as handled once sent, so it leaves the backlog.

---

## Batch G — discounts and vouchers (migration)

### 8. Event-scoped discount engine
Modelled on Shopify's discounts: the admin chooses **what kind** of promo to
create for a specific event. Note that `PromoCode` today is organizer-wide and
**is not wired into checkout at all** — it is admin CRUD only, so this batch
builds the runner-facing half from scratch.

- Scope a code to an event (`eventId`), not just an organizer.
- Discount types: **percentage off**, **fixed amount off**, **free delivery**
  (waiving the race-kit delivery fee — the local equivalent of Shopify's free
  shipping), and **buy X get Y** for groups ("register 5, the 6th is free").
- Conditions: minimum spend or minimum runner count, an active date range, a
  total usage cap, and **single-use codes** — that is the "unique voucher": a
  bulk-generated batch of distinct codes, each redeemable once.
- `Registration.discountAmount Int @default(0)` and `Registration.promoCode
  String?`.
- **The server recomputes the discount** from the database in both checkout
  routes. A discount arriving from the client is never trusted, exactly as the
  subtotal, delivery fee and platform fee already are not.

Existing conventions to respect: percentages are stored as **basis points**
(1000 = 10%) and fixed amounts as **centavos**, per §4 of the guide.

---

## Decisions already settled — do not relitigate

- Slot limits are **per category**, not per event.
- The signature must match **any** runner on the order.
- Registrant data is uppercased **in storage**, and **email is excluded**.
- The remarks feature is **internal only** — no rejection email to runners.
- The BCC archive is **removed**; Resend's dashboard is the archive.
- The app **stays on Resend's free tier in production**. Do not propose the paid
  plan again — Batch F is the agreed answer to the daily ceiling.
- The manual send in Batch F goes out from the staff member's **own** address,
  not the app's, and reuses the same template through the clipboard route.
