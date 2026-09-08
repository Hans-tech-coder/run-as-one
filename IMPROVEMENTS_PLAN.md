# Improvements Plan — 14 items, 7 batches — **all done**

This was an agreed work plan, done **one batch per session**. Every batch has
now landed. The file is kept for the reasoning behind each decision and for the
list at the bottom of things that must not be relitigated — it is no longer a
queue, and nothing here is waiting to be built.

## Status

| Batch | Items | Migration | Status |
| --- | --- | --- | --- |
| A | 12, 5, 6 | none | Done |
| B | 4, 7, 13 | none | Done |
| C | 2, 3 | yes | Done |
| D | 1, 10 | yes | Done |
| E | 11, 9 (+ security fix) | yes | Done |
| F | 14 | yes | Done |
| G | 8 | yes | Done |

Batch F was deliberately ahead of the voucher work: the app is going to
production **on Resend's free tier**, so the quota fallback mattered before
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

- **A solo registration keeps the bare order reference.** The suffix only
  appears on a group order. On an order of one it distinguishes nothing and
  only makes the reference longer to read down a phone line, so
  `RM-11FDE818` stays `RM-11FDE818` — that runner's reference and their
  order's are the same thing. `runnerRef` takes the order's size as a required
  argument so no call site can forget this.
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

## Batch F — email quota fallback (migration) — **Done**

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

### What landed, and what is worth carrying forward

One migration (`20260906180000_email_delivery_record`), one new module
(`src/lib/email-delivery.ts`), one new route
(`api/admin/registrations/[id]/email`), and a rewritten `src/lib/email.ts`.

- **The template is now one document rendered twice.** `email.ts` builds a
  block list and renders it as HTML *and* as plain text, rather than holding
  two templates that would drift apart the first time a line changed in only
  one of them. The HTML output was checked against the version that shipped:
  identical for a solo order, a group order, a delivery, a pickup with no
  details settled, and both emails — whitespace between tags aside. Values are
  held plain in the blocks and escaped by the renderer, so an event or club
  name containing `&` no longer reaches an inbox as broken markup.
- **A hand-sent email stamps the same column an automatic one would.** What
  the column records is that the runner *has* the email, not which system
  delivered it. So the row leaves the backlog when a person sends it, and if a
  later email fails the row rejoins on its own — no separate "handled" flag to
  go stale. Who sent it by hand is kept beside it, as a name.
- **The migration backfills, where Batch E's deliberately did not.** Every
  existing registration *was* emailed — the old code called both sends
  unconditionally, it simply never wrote it down — so leaving the columns null
  would have put the platform's whole history into the backlog on the first
  page load and buried the rows the feature exists to surface. `createdAt` for
  the received email, `updatedAt` for a PAID row's receipt: approximations, and
  the migration says so.
- **The mark is a `danger` badge, not an amber one.** Amber is already spoken
  for by the PENDING status badge sitting directly above it, and an unsent
  email is a failure, not a state that is waiting. `.status-badge.danger` was
  added to `Admin.css` as a reusable tone rather than a one-off pill.
- **Both buttons in the modal are needed and neither replaces the other.** A
  `mailto:` body is plain text by definition and a long one can be cut short by
  the client's own URL limit, so it carries the addressing; the clipboard write
  (`text/html` + `text/plain`) is what preserves the design when it is pasted
  into Gmail. The preview is an iframe, so the email's dark palette neither
  leaks into the admin nor inherits from it.
- **Not verified in the admin UI.** Everything else was — the build, the
  rendered templates against the old ones, and the new route refusing
  unauthenticated `GET` and `POST` with a 401 — but signing into the admin
  needs a password typed into a login form, which the assistant will not do.
  The registrants screen itself is the one part still waiting on a human to
  look at it.

---

## Batch G — discounts and vouchers (migration) — **Done**

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

### What landed, and what is worth carrying forward

One migration (`20260907120000_event_scoped_discounts`), three new modules
(`src/lib/discount.ts`, `src/lib/promo-store.ts`, `src/lib/voucher-codes.ts`),
one new public route (`api/promos/lookup`), one shared wizard control
(`PromoCodeField`) and one new admin primitive (`admin/AdminSelect`).

- **"Single use" turned out to be a usage limit of 1, not a new concept.** The
  plan asked for unique vouchers alongside a total usage cap; the cap already
  described exactly what a voucher is. So a batch is *n* rows sharing a
  `batchLabel`, each capped at one redemption, and the marketing table collapses
  them into a single line that opens to be copied — two hundred codes are one
  promotion an organizer thinks about as one thing.
- **Uniqueness moved from the code to `[organizerId, code]`.** Scoping a code to
  an event means the runner-facing lookup always arrives through an event, so we
  always know whose code we are looking for. The global constraint was only ever
  stopping the second organizer to think of "EARLYBIRD".
- **The wizard is handed the code's terms, not a computed discount.** The order
  keeps moving under the runner — a fifth runner joins, delivery becomes pickup
  — so an amount worked out at the moment the code was typed would quietly stop
  matching the total being charged. The lookup route returns the terms, both
  wizards recompute with `applyPromo` on every render, and both checkout routes
  recompute again and are the last word.
- **The total is now checked, which it never was before.** The routes verified
  the subtotal, the delivery fee and the platform fee but billed whatever
  `amount` the client sent. That was survivable while every line was pinned;
  with a discount in play it is not, in either direction. The transaction fee is
  still the client's own figure — PayMongo's rate table lives in the wizard —
  so the check pins the total against it rather than re-deriving it.
- **PayMongo cannot show a discount as its own line.** It totals a checkout
  session from its line items and will not take a negative one, so a discounted
  order is billed as a single collapsed goods line naming the code. Per-runner
  lines that still summed to the full subtotal would have charged the runner
  more than the summary promised, which is the one outcome that matters.
- **A code is spent when the order is placed, not when it is paid**, exactly as
  a slot is held by a PENDING registration. A voucher that only counted on
  payment could be attached to any number of unpaid orders at once. The cost is
  that an abandoned PayMongo checkout keeps its redemption — the same known
  cost the slot limits already carry.
- **Fees are never discounted.** The platform fee is the platform's and the
  transaction fee is PayMongo's; a percentage that quietly ate the commission
  would be a bug nobody notices until the month's payout.
- **The admin got its own closed-list select.** The marketing modal needed an
  event picker and a type picker, and the project's rule is that a new control
  copies an existing one — but the wizard's `SelectField` wears the wizard's CSS.
  `admin/AdminSelect` is the same interaction in the admin's own styling, and
  the admin's remaining native `<select>`s now have somewhere to move to.

Also worth knowing, found while verifying: **the dev server has to be restarted
after a migration**, again. The promo lookup returned a 500 —
`Unknown argument 'eventId'` — from a `next dev` process started before the
columns existed, exactly as §10 of the guide warns. It also exposed a real bug
worth keeping: the promo field was reporting *any* failed lookup as "we don't
have a code called X", which would send a runner hunting a typo that isn't
there. A non-OK response now says the check failed and that they can continue
without it.

Deliberately not built, and decisions rather than omissions: **a code cannot be
edited or deleted from the admin** — creating one and letting it expire is the
whole of the feature for now — and the public lookup route has **no rate
limit**, since there is no infrastructure here for one and a promo code is meant
to be shared.

---

## Follow-up to Batch G — automatic promotions

Asked for after Batch G landed, and built in the same working tree. Two things
the code-only engine could not do: an **early bird**, which is a discount tied
to a date rather than to something a runner was told, and a **group deal** that
a group should discover by being a group.

One migration (`20260908090000_automatic_promotions`, adding `PromoCode.automatic`),
one new component (`components/PromoHighlights.tsx`), one new wizard control
(`register/FreeSlotOffer.tsx`), and new rules in `discount.ts`.

Four decisions were the user's, and all four were taken as recommended:

- **The free slot is offered, not added.** A sixth runner card appearing on its
  own is a required form nobody asked for, and a group that really is five would
  have to work out that they must delete it before they can move on.
- **The cheapest entry on the order is the free one**, which keeps the existing
  engine rule. The FREE badge therefore *moves* when a runner changes category,
  which is the rule being shown rather than a decoration — and it is why the
  summary names which runner it landed on.
- **Best-one-wins, never stacking.** An early bird on top of a voucher is a
  number the organizer never agreed to. A tie goes to the automatic promotion,
  so the typed voucher stays unspent for its next use.
- **Shown on the event page as well as in the wizard**, because a promotion
  nobody knows about cannot bring a decision forward, which is the whole point
  of an early bird.

Worth carrying forward:

- **A promotion's name lives in the `code` column.** Both answer the same
  question — what do we call this when we show it to a runner — and one column
  keeps the unique constraint, the receipt and the badge reading from one place.
  The runner-facing code lookup skips `automatic` rows, so typing "EARLY BIRD"
  into the promo box finds nothing: it is already on the order.
- **The offer stays silent when the next free runner is not actually free.** At
  ten runners on a buy-5-get-1, reaching the next free one costs two more paid
  entries. "Add 2 more and 1 is free" is an upsell, not a free runner, so the
  banner only appears when the group has already covered the paid part of the
  cycle.
- **Ties on the FREE badge break towards the last runner.** Six runners at one
  price are six identical numbers; badging Runner 1 would be true arithmetic and
  a confusing thing to read beside the card the group filled in first.
- **A code that merely lost is not an error.** It keeps its box, is marked "not
  applied", and gets a plain sentence saying the bigger promotion was kept and
  its own code has not been used — in the secondary voice, not the red one
  reserved for a field that needs fixing.

---

## Follow-up — editing and deleting a promotion

The one thing Batch G and the automatic-promotions follow-up both left out.
An organizer who mistyped a discount had no way back except waiting for it to
expire.

One new module (`lib/promo-input.ts`), one new route
(`api/admin/promos/[id]`, PATCH and DELETE), one new control
(`marketing/PromoActionsMenu.tsx`), and an Actions column on the marketing
table.

- **The validation moved out of the create route before the edit route was
  written.** Two routes needed exactly the same check, and a create route that
  caught a 500% discount while an edit route quietly let it through would be
  worse than neither of them checking. `promoTermsFromInput` is now the only
  place that reads the form.
- **A batch is one promotion.** The table already showed two hundred vouchers
  as one row because that is how an organizer thinks about them, so an edit or
  a delete aimed at any one of them applies to the whole batch. What is *not*
  editable there is the batch label (it is the key the rows are grouped on, so
  renaming it would split the batch rather than rename it), the codes
  themselves (already printed and handed out), and the single-use limit (that
  is what a voucher is).
- **What a promotion is cannot be edited, only what it gives.** A code cannot
  become codeless and the reverse: the first would take it away from everyone
  already holding the code, the second would leave a promotion nobody was ever
  told about. The route refuses the change and the form hides the control, so
  the rule is stated in both places rather than enforced silently in one.
- **Deleting is safe for history, and the dialog says so.** The confirm names
  how many times the promotion has been used and adds that those registrations
  keep the discount they were given — `Registration.promoCode` and
  `discountAmount` were made snapshots in Batch G for exactly this. Without
  that sentence an organizer would reasonably assume deletion unwinds a
  discount somebody has already been charged against.
- **The menu is a copy of `EventActionsMenu`, not a new idea.** Same three
  dots, same portal (a dropdown inside a table cell is clipped by the table's
  own `overflow-x: auto`), same closing animation, and the icon sits under its
  own column header rather than at the row's right edge, per the standing rule.

---

## Follow-up — pausing a promotion

Deleting was the only way to stop a promotion, and it is the wrong tool: a
code printed on a poster or shared in a group chat does not stop existing
because the row did, and a runner typing it then gets "we don't have a code
called that" for something the organizer put in their hands.

One migration (`20260908140000_pause_a_promotion`, adding `PromoCode.paused`),
a `Pause` / `Resume` item in the row menu, and a `promoStatus` rule in
`discount.ts`.

- **"Pause", not "Deactivate" or "Close".** Shopify calls it Deactivate, but
  this app already had the exact idea under its own word: the events table
  pauses sign-ups, `Event.registrationPaused` stores it, and `status-badge`
  already had a `neutral` tone for "a state that is neither good news nor a
  warning". Reusing the vocabulary was worth more than matching Shopify's.
  "Close" and "Stop" were rejected for sounding permanent, which is the one
  thing this action is not — being reversible is the whole point of having it
  beside Delete.
- **The Status column had to start telling the truth.** It said only "Active"
  or "Fully Used", so an expired code and one that had not started yet both
  read as Active. Shipping PAUSED beside that would have been half a job, so
  `promoStatus` now answers with all five and the badge, the event page, the
  metric card and the runner-facing gate all read it.
- **Pausing is its own request.** `{ paused }` alone toggles the switch and
  touches nothing else — the row menu has no form open, so making it re-post
  a full set of terms would be inventing values it never rendered. A fuller
  body is still a real edit and still fully validated.
- **An edit does not silently resume.** The edit form does not carry the
  switch, so `paused` survives a change to the terms. An organizer who paused
  a promotion, fixed its percentage and saved has still paused it.
- The runner-facing lookup still **returns** a paused code rather than
  pretending it does not exist, so the wizard can say "not being accepted at
  the moment, contact the organizer" instead of "check the spelling" about a
  code that is spelled perfectly.

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
- A **single-use voucher is a usage limit of 1**, not a separate flag.
- A discount **never touches the platform fee or the transaction fee**.
- A promo code is **spent when the order is placed**, not when it is paid.
- Buy-X-get-Y counts **whole groups only**, and the **cheapest** runners on the
  order are the ones that go free.
- Promotions **never stack**: where more than one qualifies, only the largest
  applies, and a tie goes to the automatic one.
- A free slot is **offered in step 1, never added silently**.
- A **batch of vouchers is one promotion**: editing or deleting any of them
  does the whole batch.
- **How a promotion is claimed cannot be edited** — only what it gives.
- Stopping a promotion is **Pause / Resume**, matching the events table's
  registration hold. Deleting is for a mistake, not for a decision.
