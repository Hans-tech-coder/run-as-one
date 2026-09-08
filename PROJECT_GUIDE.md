# RunAsOne — Project Guide

**Read this file before touching the codebase.** It is the single briefing on what
this app is, how it is built, and the rules it holds itself to, so a fresh session
can start work without reading every file first. It is a map, not a substitute for
the code: the files it names carry the detailed reasoning in their own header
comments, and those comments are the authority when the two disagree.

**Keep it current.** Every feature, schema change, route, or convention that lands
must be reflected here in the same change — see [Keeping this file
updated](#keeping-this-file-updated) at the bottom.

---

## 1. What the product is

RunAsOne is a **running-event registration and results platform for the
Philippines**. Three groups use it:

| Who | What they do | Where |
| --- | --- | --- |
| **Runners** (public, no account) | Browse upcoming races, register solo or as a group, pay, and later look up their times and download an e-certificate | `/`, `/events`, `/events/[slug]`, `/results` |
| **Organizers** (the paying clients) | Create and manage their own events, see registrants, upload race results, run promo codes | `/admin/**` |
| **Super admin** (the platform owner) | Approve organizer accounts, set per-organizer commission, curate the shared running-club list, watch platform revenue | `/superadmin/**` |

Money flows to the organizer through PayMongo or a direct bank transfer; the
platform takes a per-runner admin fee.

---

## 2. Stack and hard constraints

- **Next.js 16.2 (App Router) + React 19**, TypeScript, deployed on **Vercel**.
- **This is NOT the Next.js in your training data.** Breaking API and convention
  changes. **Read the relevant guide in `node_modules/next/dist/docs/` before
  writing Next-specific code.** Two changes that bite immediately:
  - Route params are **async**: `{ params }: { params: Promise<{ id: string }> }`,
    then `const { id } = await params;`.
  - `middleware.ts` is now **`src/proxy.ts`**, default-exporting `proxy()`.
- **Prisma 7 + `@prisma/adapter-pg`** against **Neon Postgres**.
- **Tailwind CSS v4** (`@import "tailwindcss"` + `@theme`) alongside hand-written
  CSS files and CSS custom properties in `src/app/globals.css`.
- **Vercel Blob** for every uploaded file. There is **no local filesystem
  fallback** — Vercel's disk is read-only, so `writeFile` is never an option.
- Other notable deps: `jose` (JWT), `bcryptjs`, `pdf-lib` (e-certificates),
  `xlsx` (results import / registrant export), `@tanstack/react-table`,
  `framer-motion`, `gsap`, `lucide-react`.
- **Hosting budget matters.** Vercel + Neon's free 0.5 GB Postgres tier. Weigh
  storage cost before proposing schema growth, and say so when you do.

### Commands

```bash
npm run dev        # dev server on :3000 (use the Browser pane / launch.json, never a raw shell server)
npm run build
npm run lint
npm run seed:dev   # scripts/seed-dev.ts
npm run uppercase:existing  # brings pre-uppercase-rule rows into line; --write to apply
npm run test:blob  # scripts/test-blob.ts — exercises both blob stores
```

`npx prisma migrate dev` / `npx prisma generate` for schema work. Migrations run
DDL through `DIRECT_URL` (see `prisma.config.ts`); the app itself uses the pooled
`DATABASE_URL` (see `src/lib/db.ts`).

### Environment (`.env`, mirrored in `.env.example`)

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection, used at runtime |
| `DIRECT_URL` | Neon **direct** connection, used by Prisma Migrate (DDL cannot cross PgBouncer) |
| `JWT_SECRET` | Signs the admin session cookie. The app refuses to boot without it |
| `BLOB_READ_WRITE_TOKEN` | **Public** blob store: event banners, race-kit posters, certificate templates |
| `PROOFS_BLOB_READ_WRITE_TOKEN` | **Private** blob store: payment receipts |
| `PAYMONGO_SECRET_KEY`, `NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET` | PayMongo |
| `RESEND_API_KEY` | Resend — sends registration confirmation emails from `info@cresendorunningcommunity.com`. Unset in dev just skips the send (see `lib/email.ts`) |

Two blob stores, not one: a store's access level is fixed at creation, so a
single store cannot hold both public and private blobs.

---

## 3. Directory map

```
src/
  proxy.ts                  # route protection (was middleware.ts)
  app/
    layout.tsx              # fonts, metadata, AlertProvider, ClientLayoutWrapper
    globals.css             # design tokens + most global styling
    page.tsx                # home — showcases upcoming events
    events/                 # public listing, event page, registration wizards, results
    results/                # public results landing (finished events)
    coming-soon/ privacy/ terms/ not-found.tsx
    admin/                  # organizer portal (AdminShell, Admin.css, Auth.css)
    superadmin/             # platform-owner portal (SuperAdminShell)
    api/                    # all route handlers — see §6
  components/               # public-site components (Navbar, Footer, EventGrid, StatusPanel…)
  components/ui/            # cross-app primitives: AlertProvider, AlertModal, FieldError, table
  lib/                      # domain logic — see §5. Read these before re-deriving a rule.
  data/mockEvents.ts        # legacy mock data
prisma/schema.prisma        # the data model, heavily commented
scripts/                    # seed + one-off maintenance scripts
.claude/skills/             # project-scoped skills (ui-ux-pro-max, 21st-*, prisma-*)
```

---

## 4. Data model (`prisma/schema.prisma`)

The schema's own doc comments explain *why* each column exists — read them. The
shape:

- **Organizer** — the client account. `role` is `ORGANIZER` or `SUPER_ADMIN`;
  `status` is `PENDING`/approved; `adminFee` is the per-runner commission in
  centavos. Owns `Event[]` and `PromoCode[]`.
- **Event** — title, unique **`slug`**, `date` (**string `YYYY-MM-DD`**, not
  DateTime), location, imagery, logistics fees, `adminFee`, `shirtSizeUpcharge`,
  `consentWaiver` (string[] of paragraphs), `registrationForm`
  (`ONLINE` | `BANK_TRANSFER`), `eventType` (`RACE` | `FUN_RUN`),
  `registrationPaused` + `registrationPauseNote` (the organizer's manual hold on
  sign-ups and what runners are told), `pickupLocation` + `pickupSchedule`
  (where and when a race kit is collected — `logisticsPickup` only ever said
  *that* pickup existed), certificate template + coordinates. Owns
  `Category[]`, `BankAccount[]`, `Registration[]`, `RaceResult[]`.
- **Category** — what a runner buys. A `RACE` event's categories carry a
  `distance` (`"10K"`); a `FUN_RUN`'s carry a package `imageUrl` and no distance.
  `inclusions` is a string[]. `price` in centavos. `slotLimit` caps how many
  runners it can take (null = uncapped) — per option rather than per event,
  because a full 10K says nothing about the 5K beside it.
- **BankAccount** — per event, not per organizer: bank/account name, number kept
  exactly as typed, optional QR image, `sortOrder`.
- **Registration** — one order. `orderRef` unique; all amounts centavos
  (`subtotal`, `deliveryFee`, `platformFee`, `transactionFee`, `totalAmount`);
  `status` (`PAID`, `PENDING`…), `paymentMethod`, `proofOfPayment` (private blob
  **pathname**, not URL), `transactionNumber`, `consentGiven` + `consentGivenAt` + `consentSignature`
  (the full name typed under the tick, which must match a runner on the order —
  see `consent-signature.ts`), and `remarks` + `remarksBy` + `remarksAt` (the
  payment validator's **internal** notes; the runner never sees them and no
  email is built on them). **Email delivery** is recorded on the same row:
  `receivedEmailSentAt` / `confirmationEmailSentAt` (null = the runner never
  got it), `lastEmailError` (Resend's own reason for the last failure) and
  `manualEmailSentAt` + `manualEmailSentBy` (who sent an outstanding one by
  hand) — see `email-delivery.ts`. A redeemed promo leaves `discountAmount`
  (centavos, 0 on most orders) and `promoCode` (the code text, snapshotted like
  `runningCommunity` so a deleted `PromoCode` cannot rewrite a receipt). Owns
  `Runner[]`.
- **Runner** — one participant on an order: `runnerNo` (their 1..n position on
  the order, and the tail of the reference they quote — see `order-ref.ts`;
  unique per registration), name, contact, gender, birthdate, `singletSize`,
  emergency contact, medical notes, `runningCommunity` (free-text snapshot,
  defaults to `"INDEPENDENT RUNNER"`). Indexed on `categoryId`, which is how
  taken slots are counted.
- **RunningCommunity** — the shared master club list. `slug` is the uppercased
  name and carries uniqueness; `status` is `PENDING` (a runner's write-in) or
  `APPROVED` (appears in pickers). Rejecting deletes the row.
- **PromoCode** — a discount an organizer hands out, redeemed at checkout.
  `discountType` is `PERCENTAGE` (**basis points**, 1000 = 10%), `FIXED`
  (centavos), `FREE_DELIVERY` or `BUY_X_GET_Y` (`buyQuantity`/`getQuantity`).
  `eventId` scopes it to one event; null means every event that organizer runs.
  Conditions are `minSubtotal`, `minRunners`, `validFrom`/`validUntil` and
  `usageLimit` — **a single-use voucher is just a limit of 1**, so there is no
  separate flag, and `batchLabel` is what makes two hundred bulk-generated
  vouchers read as one promotion. **`automatic`** is the promotion nobody
  types: it applies on its own to any qualifying order, and `code` then holds
  its *name* ("EARLY BIRD"), which is what the event page and the receipt
  show. Only one discount is ever given — where several qualify, the largest
  wins. **`paused`** is the organizer's hand on the switch, the same idea as
  `Event.registrationPaused`: expired, scheduled and fully claimed are facts the
  app works out for itself, and this one is a decision.
  Unique on **`[organizerId, code]`**, not on
  the code alone: a lookup always arrives through an event, so we know whose
  code we want, and the global constraint only stopped the second organizer to
  think of "EARLYBIRD". See `discount.ts`.
- **RaceResult** — one finisher: bib (unique per event), name, gender, chip/gun
  time, `chipTimeSecs`, and the three ranks (overall, gender, category).

---

## 5. Domain rules that live in `src/lib` — read before re-inventing

These modules exist so two screens can never disagree about the same rule. If a
task touches one of these subjects, import from here rather than writing the
logic again.

| Module | The rule it owns |
| --- | --- |
| `money.ts` | **All money is integer centavos.** Convert pesos→centavos when data *enters*, centavos→pesos only when *displayed*, never in between. `toCentavos`, `toPesos`, `formatPesos` (no ₱ symbol; add it at the call site). |
| `event-schedule.ts` | The line between upcoming and finished. "Today" is **Asia/Manila**, not the server's UTC. A race stays upcoming through race day itself. `upcomingEvents()`/`finishedEvents()` return Prisma `where`s; `soonestFirst`/`mostRecentFirst` the orderings; `hasFinished()` the per-event check; `formatEventDay(Short)` and `formatEventTime` for display. `isCalendarDay` guards the `YYYY-MM-DD` format at the API door. |
| `registration-gate.ts` | **Whether an event is taking sign-ups, and why not.** Three things close registration and a runner turned away must be told which: the race has been run (that line stays in `event-schedule.ts`), every option is full, or the organizer paused it. A cap is per `Category` (`slotLimit`), so `everyOptionIsFull` is what closes an event — one uncapped option keeps it open. **A slot is held by a `PAID` *or* `PENDING` registration**, because a bank transfer sits pending for days and counting only PAID would oversell every event that takes them. `takenSlotsByCategory` counts in one grouped query (the same call inside a transaction when a checkout route passes its `tx`), `withSlotCounts` does the arithmetic (`isFull`, and `isLastCall` under `LAST_CALL_SLOTS` = 20, which is when the picker starts naming the number), `registrationState` gives the one answer every screen asks for, `pauseNote` falls back to standard wording so a hold is never unexplained, and `forListing` tags public cards and drops the categories so capacity data never ships to the browser. **`reserveSlots` is the gate.** Both checkout routes call it inside the transaction that writes the registration: it locks the capped `Category` rows `FOR UPDATE` (ordered by id, so two orders cannot deadlock) *before* counting, because a check made before the write is one two simultaneous orders both pass. It throws `SlotsUnavailableError` carrying a message that names the option and the shortfall — "FULL PACKAGE has only 2 slots left and you entered 3 runners" — which both wizards show as-is. |
| `discount.ts` | **What a promo code is worth, and why it cannot be used.** `PromoCode` rows existed for a long time and were never wired into checkout — an organizer could create a code and nothing could spend it. This is the rule that makes one real, and it lives here because *four* screens have to agree about it: both wizards price the code as the runner types, and both checkout routes recompute it from the database and are the last word. Four kinds — `PERCENTAGE` (basis points), `FIXED` (centavos), `FREE_DELIVERY` (exactly the order's delivery fee, so the line always cancels) and `BUY_X_GET_Y` (whole groups only, and the **cheapest** runners are the free ones). **Fees are never discounted**: the platform fee is the platform's and the transaction fee is PayMongo's, so a percentage applies to the goods alone. Every branch is capped at what it discounts, so a ₱500 code on a ₱300 order takes off ₱300. `promoCodeError` returns one sentence naming the code and the condition it failed — "SUMMER10 needs at least 5 runners on one order — you have 3" — and the wizards and the routes return the identical string, because a code accepted on screen and refused by the server would be worse than no code box. **A promotion may need no code at all** (`automatic`): an early bird is a discount tied to a date, and a group deal is one a group discovers by being a group — neither should depend on having been told a password. `bestDiscount` weighs every qualifying promotion, automatic and typed alike, and returns the largest; stacking is refused because two promotions at once is a number the organizer never agreed to, and a tie goes to the automatic one so a typed voucher stays unspent. A good code that merely lost is not an error — `outshoneByMessage` says so in a neutral voice. `freeSlotOffer` is what makes buy-X-get-Y claimable: the promotion pays nothing at five runners, so step 1 offers the sixth rather than leaving a group of five looking at a discount that does nothing, and it stays silent whenever the next free one would cost more paid entries than it gives. **`promoStatus` is the one answer to "is this running?"** — ACTIVE, PAUSED, SCHEDULED, EXPIRED or USED_UP, in that order of precedence, since the switch an organizer just flipped is the answer they will look for and a promotion that has been fully claimed is finished even with its window still open. The marketing table's badge, the event page's offers block, the "Running Now" metric and `promoCodeError` all read it, so a badge saying EXPIRED while the checkout still honours the code is not a state this app can reach. `freeRunnerIndexes` says which cards wear the FREE badge, breaking ties towards the **last** runner, because a group of six at one price plainly means the sixth. `redeemPromoCode` is the gate, and mirrors `reserveSlots`: it locks the row `FOR UPDATE` inside the write transaction before incrementing, since a usage cap checked before the write is one two simultaneous orders both pass. **A code is spent when the order is placed, not when it is paid** — the same moment a slot is taken, or one voucher could be attached to any number of pending orders. Deliberately free of Prisma, so the wizards can import it. |
| `promo-store.ts` | Reading promo codes out of the database, kept apart from `discount.ts` for the same reason `running-community-store.ts` is kept apart from `running-community.ts`: the rule is imported by client components and must not drag Prisma into the browser bundle. `findPromoCode` scopes a lookup to the event's organizer and then to the event (or to a code that names none) and **skips automatic promotions, which are not codes**; `automaticPromosFor` is the query the event page and both wizards run on load; `resolveDiscount` weighs the automatic promotions and any typed code together and is what both checkout routes call instead of reading a discount off the request. |
| `components/PromoHighlights.tsx` | The offers on a race, on the event page. Only **automatic** promotions appear: a code is the organizer's to publish where they choose, and printing every code on a public page would hand out the single-use vouchers meant for named invitees. It reads `describePromo` and `promoConditions`, the same two functions the wizard and the admin table read, so what this page promises and what the order summary applies cannot be worded differently. |
| `promo-redemptions.ts` | **What a promotion actually cost, and which orders spent it.** "Times Redeemed: 12" says how many, never how much, and an organizer deciding whether to run a promotion again is asking the second question. The peso column on the marketing table, the *Given Away* metric card and the list behind *View redemptions* all read from here, so a column saying ₱4,500 and a modal adding up to ₱5,200 is not a state this app can reach. **Attribution is by the code text, scoped to the organizer's own events** — `Registration.promoCode` is a snapshot string rather than a relation (kept that way so a deleted promotion cannot rewrite a receipt), so there is no id to join on and the text is all there is. Two accepted consequences: a promotion deleted and recreated under the same code inherits its own history, and an **automatic** promotion is attributed the same way, since checkout snapshots its *name* into that column. Scoping is done in the query, not after it: the code text is not proof of ownership, and two organizers may each run an `EARLYBIRD`. **Money is counted on `PAID` rows only, redemptions on placement** — a code is spent the moment the order is created, the same instant a slot is taken, so an abandoned online checkout leaves a redemption with no money behind it; counting it would overstate the cost of every promotion with an abandoned checkout in its past. Both numbers are shown rather than one being quietly preferred (the Used column grows a second line, `12 redeemed · 9 paid`, exactly when they disagree). `spendByCode` is **one grouped query for the whole screen**, not one per row, because a page with a voucher batch on it would otherwise make two hundred round trips; `redemptionsFor` takes *every* code of the promotion, since a batch is one promotion, and stops at `MAX_REDEMPTIONS_LISTED` (500) saying so rather than showing part of the truth silently. Server-only, like `promo-store.ts` and for the same reason. |
| `promo-input.ts` | **What the marketing form is allowed to say about a promotion.** Turning the posted fields into the columns they become, and refusing them by name when they cannot be — a percentage outside 1-100, a buy-X-get-Y with no X, an end date before its start. It lives apart from the routes because *two* of them need exactly this check: creating a promotion and editing one, and a create route that caught a 500% discount while an edit route let it through would be worse than neither checking. It also owns the Manila day boundaries: a window that starts on the 1st starts at 00:00 Manila and one that ends on the 30th runs to 23:59 of it, because `new Date('2026-03-30')` is midnight **UTC**, eight hours early. |
| `voucher-codes.ts` | Generating a batch of single-use vouchers. The alphabet drops every character that can be misread off a printed card — no O against 0, no I or L against 1, no S against 5, no U against V — and codes are **random rather than sequential**, because SUMMER-001…200 hands anyone who receives one the other 199. `MAX_VOUCHER_BATCH` (500) is a ceiling on the free Postgres tier as much as on the promotion. Web Crypto, not `Math.random`. |
| `event-slug.ts` | Public event URLs. `slugifyEventTitle` → `uniqueEventSlug` on write; `eventByParam` matches slug **or** legacy cuid on read, and `canonicalEventPath` redirects old cuid links to the slug. |
| `event-type.ts` | `RACE` vs `FUN_RUN`. `asEventType` guards untrusted input (defaults to `RACE`); `sellsPackages(event)` is the branch the forms and wizards use. |
| `registration-form.ts` | `ONLINE` vs `BANK_TRANSFER` checkout. `asRegistrationForm` defaults to `ONLINE`; `offersBankTransfer`. |
| `shirt-size.ts` | The size chart, whether a category needs a size at all, and the 4XL-and-up upcharge. `subtotalWithUpcharge` is the priced truth. `shouldAskShirtSize(categories, categoryId)` decides whether the wizards show the field and whether validation requires it: the chosen category decides once one is picked, and before then the field is already visible when **every** option the event sells includes something to wear. It hides up front only for an event that also sells an option with nothing to wear (the Tarlac band-only package), where the answer is genuinely undecided. |
| `app/events/[slug]/register/delivery.ts` | Race-kit delivery tiers — the **money** only. A fee of `0` means **not offered**. `deliveryTiers`, `deliveryFeeFor`. Shared by both wizards so they can never charge differently. The zone codes, their guard and their labels moved to `registration-codes.ts`; this module re-exports them. |
| `app/events/[slug]/register/validation.ts` | What step 1 requires. Returns *which* fields are wrong, driving the red states, the summary dialog, and where the caret lands. Missing answers are most of it; a phone number that is present but the wrong length for its country is the exception, and it is named as such ("Mobile number must be 10 digits") rather than reported as blank. |
| `consent-waiver.ts` | The liability/media/data-privacy waiver. Organizers may override it per event; the default wording is supplied here. **Never present an empty waiver.** |
| `consent-signature.ts` | **Who signed the waiver, and what counts as their name.** The tick records that a box was clicked; the typed signature records a person, which is the thing an organizer can hold up afterwards. The rule is that it must match **any one runner on the order**, not the first: a group registers together constantly, and demanding runner 1's name would stop whoever is actually doing the paperwork from signing their own. `normalizeSignature` decides what is not part of a name — case, runs of whitespace, and the full stops and commas around a suffix — so "DELA CRUZ, JR." and "Dela Cruz Jr" are one signature; a hyphen survives, because it is part of the name. Either name order is accepted (`JUAN DELA CRUZ` / `DELA CRUZ JUAN`), since Filipino forms ask for the surname first about as often as last. `consentSignatureError` returns the two failures separately — an empty box is asked for the name, a filled one quotes what was typed and names an actual runner as the example — per the project's rule that validation says what is wrong. Both wizards and both checkout routes import it, because a signature accepted on screen and refused by the server would be worse than the checkbox alone. |
| `running-community.ts` + `running-community-store.ts` | Club names, `INDEPENDENT RUNNER`, and the pending/approved flow for runner write-ins. `asRunnerCommunity` is what a runner's club is stored as: normalized, then **uppercased** like every other registrant field (see `text-case.ts`), with a blank answer landing on `INDEPENDENT RUNNER`. The picker snaps a typed club to an approved entry's own casing *before* that, so matching is still on the list's terms. |
| `inclusions.ts` | Free text (one item per line) ⇄ stored string[] for what a category includes. |
| `text-case.ts` | **Registrant text is stored UPPERCASE** — first and last name, gender, emergency contact name, delivery address, medical conditions, running community. The stored value, not a CSS transform: the same runner is read back by the admin table, the runner modal, the CSV export, both emails and the e-certificate, and a `text-transform` fixes exactly one of those. `upperCaseAsTyped` runs in both wizards and the admin's runner-edit modal (it does not trim, or a space between two given names would vanish as it is typed); `upperCaseForStorage` / `optionalUpperCaseForStorage` run in both checkout routes and the runner PUT, because a tab left open can POST past the UI. **Email is never uppercased** — the local part is case-sensitive on some mail servers — and neither are passwords, phone numbers, blob URLs, or most of what an organizer types about their own event. The **category / package name is the exception** and *is* uppercased (in `EventOptionsPanel` as it is typed, and in both admin event routes on the write): it is printed beside runner data in the registrants table, the export and the emails, so it has to match them. A closed picker carries the casing in its own options (`GenderField` offers `MALE`/`FEMALE`), and a **sample** placeholder is uppercase too — `JUAN`, `DELA CRUZ` — so the hint matches what will appear in the box. A placeholder that *describes the shape of the answer* counts as a sample and is uppercased too — the delivery address reads "HOUSE/UNIT NO., STREET, BARANGAY, CITY/MUNICIPALITY, PROVINCE, ZIP CODE". Only a placeholder that tells the runner what to **do** stays in sentence case: "Select Gender", "Select or type a size", the club picker's "Type to search, or add your own", and the email address. Where such an instruction **quotes a sample**, that quoted part alone is uppercased — medical conditions reads "e.g. ASTHMA, ALLERGIES (Leave blank if none)". |
| `registration-codes.ts` | The three coded columns on a `Registration` — `paymentMethod`, `logisticsMethod`, `deliveryZone` — and the words a person reads instead. They are stored **UPPERCASE** (`BANK_TRANSFER`, `DELIVERY`, `INSIDE`) like every other coded column in the schema; they used to be the only lowercase ones, because they were kept in PayMongo's casing. `asLogisticsMethod` / `asDeliveryZone` / `asPaymentMethod` **accept either casing**, so a registration written before the change still prices and displays correctly and no backfill is needed. `paymongoPaymentType()` is the **only** place a method is lowercased, at the PayMongo API boundary in `api/checkout` — their API rejects anything else. The labels are title case for a runner choosing or reading a receipt; `registrants/page.tsx` uppercases them once for the admin, where they are stored data beside a runner's uppercase name. `delivery.ts` re-exports the zone type and guard from here and keeps only the money. |
| `inclusion-icon.ts` | Which icon stands for a line of "What's Included". Keyword → icon, whole-word matched with an optional plural, first rule wins, and a plain `Check` for anything unrecognised — a wrong icon misinforms, a check merely fails to inform. It lives here so the same inclusion never draws a different icon on a different screen. The vocabulary is the organizer's: a **bib** is the chequered race flag, the **ticket** belongs to a *raffle*, a **band** or wristband is `Watch`, a **pin** or badge is `Badge`, an **entitlement** is `Gift`, a **bandana** or scarf is the bandana icon — plus `Shirt`, `Medal`, `Timer`, `GlassWater`, `Utensils`, `Camera`, `Backpack` (last, so "race kit" never beats a line naming what is in it). The race flag and the bandana are not in lucide, so they are drawn here through lucide's own `createLucideIcon` and inherit its grid, stroke and props. |
| `order-ref.ts` | **The reference a runner quotes back at us.** An order gets `RM-D918005C`; each runner on a **group** order gets that plus their position — `RM-D918005C-1`, `-2`, `-3`. A **solo** registration keeps the bare order reference: the suffix exists to tell members of a group apart, so on an order of one it distinguishes nothing and only makes the reference longer to read out and easier to mistype. `runnerRef` therefore takes the order's size and will not accept being called without it. The two answer different questions and both are kept: the order reference is what was paid and what an organizer matches against a bank line, the runner reference is one person inside a group who registered together. `newOrderRef` (both checkout routes) and `runnerRef` (the registrants table, the detail modal, the CSV export and both emails) live here so a reference is never formatted one way on screen and another in an email. `newOrderRef` uses **Web Crypto**, not node's `crypto`, so the module stays importable from the client component that renders the table. |
| `pickup.ts` | **What a runner choosing on-site pick-up is told.** `logisticsPickup` says only that the option exists; `Event.pickupLocation` and `Event.pickupSchedule` say where and when, and either may be blank because a venue is usually settled before the hours. The rule: never show a pick-up option with nothing under it — `pickupDetails` returns the trimmed halves, `hasPickupDetails` whether anything was said, `pickupSummary` the one-line form, and `PICKUP_FALLBACK` the honest sentence when the organizer has not settled it, the same way `pauseNote` refuses to leave a hold unexplained. The same wording appears on the pick-up card in both wizards, on the confirmation screen and in the received email — the moment of choosing, the moment of finishing, and the thing still in the inbox on race week. |
| `bank-accounts.ts` | Validating and normalizing per-event bank accounts between form, API and wizard. |
| `phone.ts` + `request-country.ts` | Phone numbers stored in **E.164**. Country list from dial codes; names via `Intl.DisplayNames`. The country is *guessed* from `x-vercel-ip-country` and always overridable. `NATIONAL_DIGITS` carries the exact national length for the countries we are sure of (**PH = 10**) and is deliberately short: `maxNationalDigits` caps the field at it, `isPlausiblePhone` requires it, and everything unlisted stays loose under E.164's 15-digit ceiling. The trunk zero is stripped **before** the cap applies, or a pasted `09171234567` loses its last digit. |
| `blob.ts` | Every upload. `uploadPublicFile` (returns a URL) vs `uploadPrivateProof` (returns a **pathname**) + `signedProofUrl`. 4 MB cap, because a Vercel function body caps at 4.5 MB. |
| `auth.ts` / `jwt.ts` | bcrypt hashing, the `admin_token` httpOnly cookie (1 day), `getAuthCookie()` in server code. |
| `signed-in-user.ts` | The name and initial the admin sidebars show — read from the record, not the token, so a rename is never stale. |
| `site-contact.ts` | Site name, contact email, legal "last updated", social channels. **Site-wide details belong here**, destined to become superadmin-editable settings — never inline them in a component. |
| `email.ts` | Transactional email via Resend, sent from `CONTACT_EMAIL`. Two emails per registration, never one, and they differ in purpose, not just timing: `sendRegistrationReceivedEmail` fires the moment the row is created (`checkout` for online, `checkout/manual` for bank transfer) — before any payment is confirmed — and shows every field submitted (per-runner emergency contact, gender, birthdate, community, etc.) so a typo is caught before payment. `sendRegistrationConfirmationEmail` (the receipt) fires only once status reaches `PAID` — from the PayMongo webhook, or the admin status route once a bank transfer is verified — and stays focused on the money (compact runner list, full cost breakdown), since the received email already covered the data. No artificial delay sits between the two; the PayMongo webhook is itself asynchronous, so "received" always lands first. The HTML template mirrors the app's own look (the real site logo on a dark header, orange→blue gradient accent bar, a color-coded status pill — blue "pending" for received, green "success" for the receipt — instead of plain caption text). **The whole body is one table, and that is the layout strategy — do not split it back into separate tables per section.** Gmail's Android app renders every nested table shrink-to-fit: it sizes each to its own content and ignores the declared width, whether that width is a percentage, a pixel value, an HTML `width` attribute or `table-layout: fixed` (all four were tried; all four failed, as did wrapping each section in a bordered card). Separate tables therefore end up at *different* widths, so a block of short money values stops well short of the right edge while a block holding a long venue name reaches it. Rows of a single table cannot disagree that way — one set of columns means every value right-aligns to the same edge by construction — and the long paragraphs, sitting in that same table as full-width rows, are what push the shared width out to the container. `cardHtml()` is the one sanctioned exception: it nests a bordered block inside a full-width row, and **only blocks whose values are long** (event title, venue, email, phone) may go in one, because those fill the width on their own content — which is why they always rendered correctly. Blocks of short values (the money summary, the compact runner list) must stay plain rows of the body table. **One recipient per send, and no bcc.** Resend meters its free tier by *recipient*, counting a bcc as one of them, so the archive copy this used to carry doubled the quota cost of every email and put a registration at four units against a ceiling of a hundred a day. Resend's own dashboard keeps the log that mailbox existed for. Subjects include the order reference so Gmail can't thread two emails together and hide one behind "Show trimmed content". Each runner block carries that runner's own reference (`order-ref.ts`) and the pick-up email now names the venue and hours rather than saying "Pickup at Venue", since this email is what the runner still has on race week. Any layout change here is a mobile-first bug: verify in the Gmail app, since desktop looks fine either way. **Each email is one document rendered twice**: the block list (`paragraph`, `heading`, `card`, `rows`, `note`, and typed rows inside them) is what the email *is*, `renderHtml` produces what Resend sends and `renderText` the plain-text rendering a person pastes into a `mailto:` — two renderings of one source, never two templates that can drift. Values are held plain in the blocks and escaped by the HTML renderer, so an event or club name containing `&` can no longer arrive as broken markup. A discount, when there is one, is a negative amount row directly under the goods it came off and before the fees — the same order the wizard's summary showed it in, since this email is what the runner checks the charge against; the sign sits outside the peso symbol, because "₱-150.00" reads as a broken number. A send failure is still logged and swallowed, never thrown, so a bounced email can't undo a payment — but `sendEmail` now *reports* it as an `EmailOutcome`, which is what `email-delivery.ts` writes down. |
| `email-delivery.ts` | **Whether the runner actually got their email, and what happens when they did not.** Every send in the app goes through here rather than calling `email.ts` directly — `deliverReceivedEmail` / `deliverConfirmationEmail` send and then write the outcome onto the registration — because a send whose outcome nobody recorded is exactly the silence this exists to end: the free tier stops at 100 recipients a day, and a swallowed failure left a registration unconfirmed with nothing on the row to say so. The recording is itself wrapped in a try/catch and never throws: bookkeeping about an email must not fail a checkout, and a lost record only shows the row in the backlog, which is the safe direction to be wrong in. **`outstandingEmail` is the rule everything reads**: every registration owes the received email (it is sent at submission, so a row without it never got one), and the receipt is owed only once status is `PAID` — a bank transfer sits `PENDING` for days with no receipt to be missing yet. **A hand-sent email stamps the same column an automatic one would**, because what the column records is that the runner *has* the email, not which system delivered it; the row therefore leaves the backlog, and rejoins on its own if a later email fails. `recordManualSend` stamps that column plus `manualEmailSentBy`/`At` — a name, not an account id, for the same reason as `remarksBy`. `asEmailKind` guards the kind at the API door. |

---

## 6. Routes

### Public
| Path | What it is |
| --- | --- |
| `/` | Home. Hero + up to 6 **upcoming** events, soonest first. Events are the point of this page. |
| `/events` | Full upcoming listing |
| `/events/[slug]` | Event detail and registration entry point (closed once the race is over). Carries `PromoHighlights`: the automatic promotions running on this race, named before the runner starts. Codes are never listed there — those are the organizer's to hand out |
| `/events/[slug]/register` | The wizard — `RegistrationWizardClient` (ONLINE: 3 steps, plus step 4 for proof when the runner picks bank transfer) or `BankTransferWizardClient` (3 steps). Steps: **1** runners & categories, **2** logistics, **3** checkout/payment, **4** proof upload. |
| `/results` | Finished-event landing, most recent first — the same `EventGrid` card as `/events`, with `action="results"` |
| `/events/[slug]/results` | Winners board |
| `/events/[slug]/results/full` | Full searchable table; category filter via query param |
| `/events/[slug]/results/[resultId]` | One runner's result plus `ECertificateGenerator` (pdf-lib) |
| `/coming-soon`, `/privacy`, `/terms`, `not-found` | Real designed pages — see the no-dead-links rule in §8 |

### Organizer (`/admin`, gated by `src/proxy.ts`)
`/admin` dashboard · `/admin/login` · `/admin/register` · `/admin/events` (plus
`/new` and `/[id]/edit`) · `/admin/events/[id]/registrants` (rows whose email
never went out carry an **Email Unsent** badge, an *Unsent Email* toolbar toggle
lists exactly those, and a mail icon opens the manual-send modal; **`?search=`
prefills the search box**, which is how the marketing screen's redemptions panel
links straight to one order) ·
`/admin/events/[id]/results` (the uploader detects the sheet's real header row —
timing exports open with banner rows — and maps columns by sheet index, not by
label) · `/admin/marketing` (promotions: the kind, the event it is scoped to, its
conditions, whether it is claimed by a code, a voucher batch or automatically,
**how much it has given away**, and a row menu to view its redemptions, edit,
pause or delete — a batch collapses into one row that opens to be copied, on
the same searchable, sortable, paginated table the events and registrants
screens use. Three metric cards: Running Now, Times Redeemed and **Given
Away**, the last being the Given column added up) ·
`/admin/settings` (profile + password) · `/admin/[...missing]` → the admin's own 404.

### Super admin (`/superadmin`)
`/superadmin` dashboard (platform revenue, fees) · `/superadmin/organizers`
(approve, suspend, set commission) · `/superadmin/communities` (approve, rename,
reject clubs) · `/superadmin/[...missing]`.

### API (`src/app/api/**/route.ts`)
| Route | Methods | Notes |
| --- | --- | --- |
| `auth/login`, `auth/logout`, `auth/register` | POST | Sets / clears `admin_token` |
| `checkout` | POST | PayMongo checkout session. Re-derives every amount from the database. |
| `checkout/manual` | POST | Bank transfer: multipart, proof file → private blob |
| `webhooks/paymongo` | POST | HMAC-verified; marks the registration `PAID` |
| `upload` | POST | Organizer-only image upload (public store) |
| `admin/events`, `admin/events/[id]` | POST / GET, PUT, PATCH, DELETE | Event CRUD including categories and bank accounts. `PATCH` is the registration hold on its own (the events table toggles it without re-posting a form it never rendered) and is scoped to the signed-in organizer's own events |
| `admin/events/[id]/results/upload` | POST | CSV/XLSX results import; dedupes by bib, computes seconds and the three ranks |
| `admin/registrations/[id]/status` | PATCH | Confirm or reject a manual payment, and write the validator's internal `remarks`. Takes either or both; the status is guarded against a fixed list and the receipt email fires only on the *transition* into `PAID`, so a later remarks-only PATCH cannot send a second receipt. Auth-checked and scoped to the signed-in organizer's own events — **this route had none at all until Batch E**, which made it the one way for anyone on the internet to mark a registration `PAID` |
| `admin/registrations/[id]/email` | GET, POST | The email a registration is owed, rendered for a person to send by hand — `GET` returns the recipient, subject and **both** renderings (HTML for the clipboard, plain text for a `mailto:`), `POST` records that a staff member sent it. Auth-checked and scoped like the status route, which matters more here than most: the rendered email carries every runner's contact details, birthdate and emergency contact |
| `admin/runners/[id]`, `admin/runners/bulk-delete` | PUT/DELETE, POST | Registrant editing |
| `admin/proof/[id]` | GET | Auth-checked redirect to a short-lived signed proof URL |
| `promos/lookup` | POST | **Public.** The terms of a code a runner just typed, scoped to the event they are registering for. Returns the *terms*, not a computed discount — the order keeps changing under the runner, so the wizard recomputes with `applyPromo` and nothing here is trusted at checkout. A code we do not have comes back as `{ promo: null }` with a 200, since "we don't have that" is an answer rather than a failure; the response carries no id, organizer or batch |
| `admin/promos` | POST | Creates one code, a whole batch of single-use vouchers in one call, or an automatic promotion. Refuses rather than repairs, naming the field it refused, and scopes `eventId` to the signed-in organizer's own events |
| `admin/promos/[id]/redemptions` | GET | Which orders used this promotion — order reference, event, runner count, status, `discountAmount`, `createdAt`, and for a voucher batch the specific code that was used. Covers **all** of the promotion's codes, since a batch is one promotion, and is capped at 500 with a flag saying when it was cut short. Auth-checked and scoped to the organizer's own events, which matters twice here: an id from the browser is not proof of ownership and neither is the code text |
| `admin/promos/[id]` | PATCH, DELETE | Edits, pauses or removes a promotion. A body carrying **only** `{ paused }` is the hold on its own and touches nothing else — the row menu has no form open, so it has no terms to re-post, exactly as `admin/events/[id]` PATCHes its registration hold. Any fuller body is a real edit and is validated in full. **A batch is one promotion, not two hundred**, so an operation on any of its vouchers is an operation on all of them, and the response says how many rows it touched. What a promotion *is* cannot be edited — a code cannot become codeless, a batch's shared label and its random codes stay put, and a voucher stays single-use — because those changes would take the promotion away from people already holding it. Deleting is safe for history: `Registration.promoCode` and `discountAmount` are snapshots, so it removes the ability to redeem, not the record of a redemption. Auth-checked and scoped to the organizer's own rows |
| `admin/profile`, `admin/profile/password` | PATCH | Self-service only; the id comes from the cookie, never the body |
| `superadmin/organizers`, `superadmin/organizers/[id]` | GET, PATCH | Status and commission |
| `superadmin/communities`, `superadmin/communities/[id]` | GET/POST, PATCH/DELETE | Club curation |

---

## 7. Security model

- `src/proxy.ts` guards `/admin/**` (except `/login` and `/register`) and
  `/superadmin/**`: no token → `/admin/login`; a `SUPER_ADMIN` on `/admin` →
  `/superadmin`; a non-super-admin on `/superadmin` → `/admin`.
- **Route handlers re-check auth themselves.** The proxy does not cover
  `/api/**`, so every admin route calls `getAuthCookie()` and scopes its queries
  to the signed-in organizer.
- **Never trust client amounts.** `checkout` and `checkout/manual` refetch the
  event and recompute the delivery fee, platform fee, subtotal (including the
  shirt upcharge) and **the promo discount** before writing or billing.
  Mismatches are rejected. The request carries the promo *code*, never what it
  is worth. Both routes now also pin the **total** — with a discount in play, an
  order that under-reports it would be billed more than the summary promised and
  one that over-reports it would be billed less.
- **Server-side gates, not just UI ones.** Consent (`consentGiven !== true`),
  the finished-race check (`hasFinished`), the organizer's registration hold,
  the per-category slot limits and **every promo condition** are all enforced in
  the API, because a tab left open yesterday will still POST — a code that has
  expired or filled up since the page loaded is refused with the same sentence
  the wizard would have shown. The slot check runs *inside* the write
  transaction and locks the capped category rows first (`reserveSlots`), since a
  count taken before the write is a count two simultaneous orders both pass. A
  code's usage cap is spent the same way, by `redeemPromoCode`.
- Payment proofs are **private** blobs, served only through
  `/api/admin/proof/[id]` with a roughly five-minute signed URL.
- Passwords are bcrypt-hashed; the session cookie is httpOnly, `sameSite=lax`,
  `secure` in production, with a one-day expiry.

---

## 8. Standing rules for this project

These are the user's own standing preferences. Follow them without being asked.

1. **No dead links, ever.** A runner or organizer must never hit a placeholder
   `href="#"` or a bare 404. A destination that is not built yet gets a real,
   designed page — that is what `/coming-soon` and `StatusPanel` exist for.
2. **The UI must look expensive and uniform.** Browser and OS default controls
   (native `<select>`, `alert()`, `confirm()`) are unacceptable. A new control
   copies an existing one: `SelectField`, `Combobox`, `AlertProvider`'s
   `alert`/`confirm`, `AlertModal`, `StatusPanel`, `FieldError`.
3. **Consult the project's `ui-ux-pro-max` skill for UI/UX work** rather than
   designing ad hoc. Skills stay project-scoped in `.claude/skills/` — nothing is
   installed globally.
4. **Validation messages must be specific.** Name exactly what is missing and
   highlight the offending fields; never a generic catch-all. See
   `app/events/[slug]/register/validation.ts` and `FieldError`.
5. **The home page exists to showcase events.** Events stay the focal point.
6. **Table action icons align under their column header**, never pushed to the
   row's right edge.
7. **Site-wide contact and social details live in `lib/site-contact.ts`**, headed
   for superadmin-editable settings — never inline in a component.
8. **Work must reach the user's dev server.** They test on their own
   `localhost:3000` running the **main checkout**, so anything left in a git
   worktree is invisible to them. Edit in the main checkout — that alone is
   enough for them to see the change.
9. **Never commit or push until the user says so.** Finish the work, verify it,
   report it, and leave it uncommitted in the working tree. `git commit` and
   `git push` wait for their explicit command — say plainly that the change is
   sitting there unstaged rather than assuming a finished change should land.
10. **Weigh storage cost** (Neon's free 0.5 GB tier) before growing the schema.
11. **Comment the *why*.** This codebase's header comments explain the reasoning
    behind a decision, not what the code does. Match that voice.

---

## 9. Conventions

- **Server Components by default**; `'use client'` only where interaction needs
  it. Pages fetch with Prisma directly and client islands take props.
- Imports use the `@/` alias for `src/`.
- Registrant text is stored **UPPERCASE**, email excepted (§5, `text-case.ts`).
  A field whose value is stored uppercase shows an uppercase *sample*
  placeholder; a placeholder that is an instruction stays sentence case.
- Money is centavos everywhere (§5). Dates are `YYYY-MM-DD` strings against a
  Manila "today". Phones are E.164.
- String columns instead of Postgres enums (`status`, `role`, `paymentMethod`,
  `logisticsMethod`, `deliveryZone`, `eventType`, `registrationForm`) — which is
  exactly why each has an `asX()` guard in `lib/` that the API must call on
  untrusted input. **Every one of them is stored UPPERCASE**, and the guards
  accept either casing so rows written before that rule still read correctly.
  PayMongo is the one consumer that needs lowercase, and
  `paymongoPaymentType()` is the only place that converts.
- **One admin table.** Every table in the dashboard — events, registrants,
  results and marketing — is `components/ui/table` driven by TanStack, wearing
  the same furniture: an `.admin-toolbar` above it holding the search box, the
  dark `.btn-filter` chips (View, and whatever else that screen filters by) and
  the one `.btn-light` primary action; a bordered, rounded table with a select
  column, a `No.` column and sortable headers; and the rows-per-page menu and
  pager beneath. Copy that arrangement rather than hand-rolling a `<table>`, so
  an organizer reads a promotion the way they read a registrant. A row that
  opens (the marketing screen's voucher batches) is a second `TableRow` under
  the first, not a column of its own. The `No.` cell counts by row **id**, not
  by object identity: sorting rebuilds the rows, so an `indexOf` on them finds
  nothing and every line numbers itself 0 the moment a header is clicked.
- **One public event card.** `components/EventGrid` renders every public event
  listing — `/`, `/events`, `/results` — so an event looks like itself wherever
  it appears. It differs only by its `action` prop (`'register'` → the event
  page, `'results'` → the winners board), a string rather than a callback
  because the pages rendering it are Server Components. Never fork a rival card.
- **One option row at sign-up.** `events/[slug]/register/CategoryPicker` renders
  a race's distances and a fun run's packages with the *same* full-width radio
  row — poster thumbnail, name, price on a shared right edge — because to the
  runner it is one decision either way. A race's distance is a chip beside the
  name; that chip is the only difference. Do not bring back a separate grid.
- **Stopping something is a pause, not a deletion.** An organizer switching a
  promotion off gets Pause / Resume, the same word and the same reversible
  gesture as the events table's registration hold. Deleting is for a mistake;
  pausing is for a decision, and a code printed on a poster does not stop
  existing because its row did.
- **A discount is never a surprise at the end.** An automatic promotion is named on the event page, priced into the order summary from the first render of step 1, and — for a group deal — offered as a free slot with a FREE badge on the runner it belongs to. A promotion the runner only meets on the payment step cannot do the thing it was created to do.
- **A closed list of answers is never a native `<select>`.** The wizard has
  `events/[slug]/register/SelectField`; the admin now has `admin/AdminSelect`,
  the same interaction wearing `.form-label` / `.form-input`. Two components
  rather than one because they live in different design systems. The admin's
  remaining native selects (the results uploader, the registrants table's size
  field) are the ones to move onto it as they are next touched.
- **One status badge, four tones** (`Admin.css`): `success` for done, `pending`
  (amber) for a state that is simply waiting and needs nobody, `danger` for
  something that failed and a person must act on — an email that never went out
  — and `neutral` for a fact that is neither, like a sold-out event. Reach for
  one of these rather than a one-off pill.
- **No gradient buttons inside the admin.** Every action in the dashboard —
  toolbar, panel header, form footer, modal submit — wears `.btn-light`
  (`Admin.css`): a **light pill** — `#e4e4e7` fill, `#09090b` label, white on
  hover — inverting the near-black panel it sits on, so the one thing worth
  pressing is the brightest thing on the screen. Icons are lucide and draw in
  `currentColor`, so they darken with the label on their own. It stands
  **48px** tall everywhere except inside `.toolbar-actions`, where it drops to
  the 40px of the `.btn-filter` chips sharing its row. A table toolbar holds
  exactly one `.btn-light` — its page's primary action, and the four are
  peers that must look alike: Create Event, New Promotion, Upload results,
  Export to CSV. Everything else in that row (Category, Logistics, Payment,
  View, Unsent Email) stays a dark `.btn-filter` chip, and a destructive one
  like Delete Selected keeps its red. The orange gradient
  (`.btn-gradient`) keeps the surfaces a runner sees: the public site, the
  registration wizard, and the `/admin/login` and `/admin/register` sign-in
  CTAs. Do not add Tailwind padding or flex utilities on top of
  `.btn-light` — sizing it per site is what made the admin uneven before.
- Styling: Tailwind utilities plus the CSS variables in `globals.css` (motion,
  spacing, radius, glass, gradient tokens). The admin has `Admin.css` and
  `Auth.css`; the wizard and event page have their own CSS files. Dark,
  glassmorphic, with an orange (`#FF6B00`) → blue (`#007AFF`) gradient.
- Fonts: Outfit (`--font-sans`, headings), Inter (`--font-body`).
- Commit style: `feat:` / `fix:` / `refactor:` plus a sentence saying what changed
  for the user.

---

## 10. Current state

`FEATURES_CHECKLIST.md` tracks the roadmap; every major section is ticked through
the results and e-certificate module.

**`IMPROVEMENTS_PLAN.md` is finished.** All fourteen improvements across its
seven batches have landed; the file is kept only for the reasoning behind each
one, and it records the decisions that must not be relitigated. It is no longer
a queue.

**`PROMOTIONS_PLAN.md` is the active work queue.** Seven follow-ups to the
promotions feature, in three batches, with the decisions behind each already
settled. The user works it **one batch per session** to keep conversations
short, so a session picking it up should read the batch marked *Next*, do only
that batch, mark it Done, and stop. Delete the file once every batch is done.
**Batch A is done**; Batch B — releasing what an abandoned checkout holds, and
the one migration in the plan — is next.

Known open threads:

- Site contact and social links are constants awaiting a **superadmin settings
  screen**; the social icons currently point at `/coming-soon`.
- PayMongo runs in **test mode**.
- Registration emails send via **Resend** from
  `info@cresendorunningcommunity.com` (a Hostinger Titan mailbox; Resend only
  handles outbound sending, not the inbox) — a "received" email at submission
  plus a "receipt" email once PAID (see `email.ts`). No results-ready or
  reminder emails yet. The app stays on Resend's **free tier in production** —
  100 recipients a day, and it stops rather than bills — which is a decision,
  not an oversight. Dropping the bcc archive brought a registration back to two
  recipients, so the ceiling is roughly 50 registrations a day. That ceiling is
  now **visible rather than silent** (Batch F): every send is recorded on the
  registration, a row whose email never went out is marked in the registrants
  table and listed by the *Unsent Email* filter, and a staff member sends the
  missing email themselves from the manual-send modal — copying the formatted
  email for Gmail, or opening their own mail app through a `mailto:` — then
  marks it sent.
- **Discounts are live end to end** (Batch G, extended). An organizer scopes a
  promotion to one event or to all of theirs, picks percentage / fixed / free
  delivery / buy-X-get-Y, sets conditions, and chooses how it is claimed: one
  shared code, a batch of single-use vouchers, or **automatically, with no code
  at all**. A runner types a code in step 3 of either wizard; an automatic
  promotion is on their order from the first render and named on the event page
  before they start. Both checkout routes recompute whichever applies, and only
  one discount is ever given.
  A promotion can be edited, paused or deleted from the row menu on
  `/admin/marketing`, and its Status column names all five states rather than
  calling an expired code "Active". **What a promotion cost is now on the same
  screen** (Promotions Batch A): a **Given** column of pesos beside Used, a
  *Given Away* metric card totalling it, and a *View redemptions* panel listing
  the orders that spent it, each linking through to that event's registrants
  with the order reference already in the search box. Money is counted on paid
  orders only and redemptions on placement, and the Used column reads
  `12 redeemed · 9 paid` whenever the two disagree rather than letting the gap
  look like an arithmetic error — see `promo-redemptions.ts`.
  The organizer dashboard's revenue tile
  subtracts `discountAmount` — it did not until the promotions work landed,
  and was reporting money that had been given away. Two things are still deliberately left out, and are
  decisions rather than oversights: **an abandoned online checkout keeps its
  redemption**, exactly as it keeps its slot — a PENDING order holds both
  until it is cleaned up, which is `PROMOTIONS_PLAN.md` Batch B — and the
  public code-lookup route has **no rate limit**, which is Batch C.
- `src/data/mockEvents.ts` is legacy and is no longer the source for real pages.
- A **Prisma schema change needs the dev server restarted** before it takes
  effect: `next dev` bundles the generated client, so a running server keeps
  the pre-migration data model and rejects a write to a brand-new column with
  a 500 even though the column exists. `npx prisma generate` alone is not
  enough.
- **`/` and `/events` are prerendered at build time** (they take no dynamic
  API), so on Vercel their cards — including the new FULL and PAUSED badges —
  are a snapshot of the last deploy rather than live. This predates the badges
  and applies equally to a newly published event; the event page, the register
  page and both checkout routes are dynamic and always current, so nothing can
  be *registered* against a stale listing. Making those two pages dynamic is a
  decision that has not been taken yet.

---

## Keeping this file updated

**Whenever you add or change a feature, update this file in the same change.**
Specifically:

- A new or changed **model or column** → §4, and §5 if a new rule module came
  with it.
- A new **page or API route** → §6, and §7 if it changes who may reach what.
- A new **shared module in `src/lib`** → §5, described by the *rule* it owns, not
  just its name.
- A new **reusable UI primitive** → §8 or §9, so the next session copies it
  instead of inventing a rival.
- A **standing instruction from the user** → §8, phrased as a rule.
- Anything shipped or unblocked → §10.

Keep it a briefing: dense, current, and short enough to read in full at the start
of a session. If a detail is only true of one file, the explanation belongs in
that file's header comment and only its headline belongs here.
