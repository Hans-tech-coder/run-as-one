# Run As One by: CRC — Project Guide

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

Run As One by: CRC is a **running-event registration and results platform for the
Philippines**. Three groups use it:

| Who | What they do | Where |
| --- | --- | --- |
| **Runners** (public, no account) | Browse upcoming races, register solo or as a group, pay, and later look up their times and download an e-certificate | `/`, `/events`, `/events/[slug]`, `/results`, `/results/[slug]` |
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
- **Production is live** at `https://run-as-one.cresendorunningcommunity.com`
  — Vercel project `run-as-one`, linked to `Hans-tech-coder/run-as-one`. Every
  push to `main` deploys to production; there is no manual deploy step. That
  custom domain is the *only* public hostname the project answers on, and it is
  what `SITE_URL` in `lib/site-contact.ts` must name.
- **Work lands on `dev`, not `main`.** Because a push to `main` ships to
  production, day-to-day commits go to the long-lived `dev` branch, and every
  push to `dev` gets its own Vercel preview deployment. `main` is only advanced
  — by fast-forwarding it onto `dev` and pushing — when the owner explicitly
  asks to deploy. The local checkout (which the owner runs `localhost:3000`
  from) tracks `dev`. Never push to `main` without being told to.
- **Hosting budget matters.** Vercel + Neon's free 0.5 GB Postgres tier. Weigh
  storage cost before proposing schema growth, and say so when you do.

### Commands

```bash
npm run dev        # dev server on :3000 (use the Browser pane / launch.json, never a raw shell server)
npm run build      # prisma generate + next build (see below)
npm run lint
npm run seed:dev   # scripts/seed-dev.ts
npm run uppercase:existing  # brings pre-uppercase-rule rows into line; --write to apply
npm run test:blob  # scripts/test-blob.ts — exercises both blob stores
```

`npx prisma migrate dev` / `npx prisma generate` for schema work. Migrations run
DDL through `DIRECT_URL` (see `prisma.config.ts`); the app itself uses the pooled
`DATABASE_URL` (see `src/lib/db.ts`).

**`npm run build` runs `prisma generate` before `next build`, and must keep doing
so.** The generated client is git-ignored, and a fresh install on Vercel does not
run Prisma's postinstall hook (npm now withholds install scripts it has not been
told to allow), so without that step the build type-checks against a client that
is not there and fails.

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
| `CRON_SECRET` | Guards `/api/cron/expire-pending`, the daily abandoned-checkout sweep. Vercel Cron sends it as `Authorization: Bearer …`; **unset, the route refuses to run rather than running unguarded** |

### Databases: production and development are separate Neon branches

**Local development must never dial the live database.** Until this was split,
`.env` and the deployed site pointed at the same Neon branch, so a `prisma
migrate reset`, a seed script, or a stray `deleteMany` on a laptop would have
destroyed real customer orders — including bank-transfer registrations sitting
`PENDING` while a runner waits for their slot to be confirmed.

Neon project **`run-as-one`** (`wispy-rain-76789112`, free tier, 10 branches,
0.5 GB):

| Branch | Endpoint | Used by |
| --- | --- | --- |
| `dev` — **this is production**, `br-calm-darkness-b3tqh63k` | `ep-still-pine-b3n210bs` | The live site (Vercel Production). Holds every real registration and all 2,149 race results. |
| `local-dev`, `br-dry-grass-b3ubrfhy` | `ep-shiny-sunset-b3gzfro9` | The local checkout's `.env`. A copy-on-write branch of production. |
| `legacy-empty-root`/`production`, `br-spring-pine-b35lahiy` | `ep-silent-pond-b38yfoxa` | Nothing. The original root branch, **it has no tables at all** and never held data. Kept only because Neon cannot delete a root branch. |

**The branch named `dev` is the production database.** The names are backwards
because the project was built on the branch Neon created second, and the
rename is a console-only step that has not been taken. Go by the endpoint, not
by the name: `ep-still-pine-b3n210bs` is live.

**Syncing production data down is a Neon branch reset, not a feature.** To
refresh `local-dev` with what production holds now, reset it from its parent in
the Neon console (Branches → `local-dev` → Reset from parent). It is instant and
nearly free, because a branch stores only its diff. There is deliberately **no
"sync from production" button inside the app**: such a button would ship a
code path that exports every customer's personal data into the production
bundle, hidden behind a flag that is one environment-variable mistake away from
being on, and it would require production credentials to be reachable from a
developer's machine — the exact coupling the split removes.

**`git push` never touches a database.** Promoting `dev` to `main` ships code
only. The only things that can write to production are the running app and
whatever a connection string is pointed at, which is why the protection lives
in `.env` and in the guard below rather than in the branching workflow.

**Every maintenance script calls `assertNotProduction()` first**
(`scripts/guard-environment.ts`). It refuses to run when `DATABASE_URL` or
`DIRECT_URL` names the production endpoint, and refuses equally when neither is
set. It checks the **host**, not `NODE_ENV`: `NODE_ENV` is a property of the
process and reads "development" on a laptop no matter which database that
laptop is dialling. Any new script in `scripts/` that writes must call it too.

**Migrations no longer reach production by themselves.** They used to, because
the two shared a branch. `npm run build` still runs `prisma generate` only —
deliberately, since a build that silently mutates the production schema is a
build that can break the live site without anyone asking it to. A schema change
now reaches production as its own step at deploy time, with `DIRECT_URL`
pointed at `ep-still-pine-b3n210bs`:

```bash
npx prisma migrate deploy
```

**Still shared, and still a hazard:** both Vercel Blob stores are common to
local and production. Deleting an event banner or a payment proof locally
deletes it from the live site too.

Two blob stores, not one: a store's access level is fixed at creation, so a
single store cannot hold both public and private blobs.

**Scheduled work lives in `vercel.json`.** One cron entry today — the
abandoned-checkout sweep at `0 18 * * *` (18:00 UTC = 02:00 Manila, the quietest
hour for a job that cancels orders). **Vercel's Hobby plan runs a cron at most
once a day** and within the hour rather than on the minute, so nothing here may
be designed around a tighter schedule. Vercel Cron issues a **GET**, which is
why that route answers GET as well as POST.

---

## 3. Directory map

```
src/
  proxy.ts                  # route protection (was middleware.ts)
  app/
    layout.tsx              # fonts, metadata, AlertProvider, ClientLayoutWrapper
    globals.css             # design tokens + most global styling
    page.tsx                # home — showcases upcoming events
    events/                 # public listing, event page, registration wizards
    results/                # everything about a race that has been run:
                            #   landing, winners board, leaderboard, one runner
    feedback/               # the public feedback form (page + FeedbackForm)
    coming-soon/ privacy/ terms/ not-found.tsx
    admin/                  # organizer portal (AdminShell, Admin.css, Auth.css)
    superadmin/             # platform-owner portal (SuperAdminShell)
    api/                    # all route handlers — see §6
  components/               # public-site components (Navbar, Footer, EventGrid,
                            #   StatusPanel, RunAsOneLogo, HeroArcBackground,
                            #   PublicRouteLoading…)
  components/ui/            # cross-app primitives: AlertProvider, AlertModal, Toast,
                            #   Skeleton, LoadingDots, LinkPending, FieldError, table,
                            #   RunnerLoader, LinkPendingIcon, RunnerOverlay
  lib/                      # domain logic — see §5. Read these before re-deriving a rule.
  data/mockEvents.ts        # legacy mock data
prisma/schema.prisma        # the data model, heavily commented
vercel.json                 # scheduled work (crons) — see §2
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
  sign-ups and what runners are told), `registrationOpensAt` (the instant
  sign-ups start, for a race listed ahead of taking them; null — the normal
  case — means it is registrable the moment it is published), `pickupLocation`
  + `pickupSchedule`
  (where and when a race kit is collected — `logisticsPickup` only ever said
  *that* pickup existed), certificate template + coordinates. Owns
  `Category[]`, `BankAccount[]`, `Registration[]`, `RaceResult[]`.
- **Category** — what a runner buys. A `RACE` event's categories carry a
  `distance` (`"10K"`); a `FUN_RUN`'s carry a package `imageUrl` and no distance.
  `inclusions` is a string[]. `price` in centavos. `slotLimit` caps how many
  runners it can take (null = uncapped) — per option rather than per event,
  because a full 10K says nothing about the 5K beside it. **`sortOrder` is its
  place in the event's list, fixed at creation** (the order the organizer
  entered them): an edit never renumbers an existing option, and one added
  later joins the end. Read through `CATEGORY_ORDER` (§5).
- **BankAccount** — per event, not per organizer: bank/account name, number kept
  exactly as typed, optional QR image, `sortOrder`.
- **Registration** — one order. `orderRef` unique; all amounts centavos
  (`subtotal`, `deliveryFee`, `platformFee`, `transactionFee`, `totalAmount`);
  `status` (`PAID`, `PENDING`…), `paymentMethod`, `proofOfPayment` (private blob
  **pathname**, not URL), `transactionNumber`, `consentGiven` + `consentGivenAt` + `consentSignature`
  (the name typed under the tick — any non-empty text is accepted, see
  `consent-signature.ts`), and `remarks` + `remarksBy` + `remarksAt` (the
  payment validator's **internal** notes; the runner never sees them and no
  email is built on them). **Email delivery** is recorded on the same row:
  `receivedEmailSentAt` / `confirmationEmailSentAt` (null = the runner never
  got it), `lastEmailError` (Resend's own reason for the last failure) and
  `manualEmailSentAt` + `manualEmailSentBy` (who sent an outstanding one by
  hand) — see `email-delivery.ts`. A redeemed promo leaves `discountAmount`
  (centavos, 0 on most orders), `promoCode` (the code text, snapshotted like
  `runningCommunity` so a deleted `PromoCode` cannot rewrite a receipt),
  **`Runner.promoPrice`** (what that runner's category was actually charged, per
  runner because a capped promotion can run out halfway through one order) and
  **`discountType`** — snapshotted for the same reason and needed for one
  `promoCode` cannot serve: the receipt has to know whether the discount was a
  *price* or a *deduction*. **`subtotal` is always the list total** whichever
  it was, so what a promotion cost stays one subtraction away and the revenue
  tile keeps working. The
  `status` vocabulary is `PAID`, `PENDING`, `CANCELLED`, `REFUNDED` and
  **`EXPIRED`**, guarded against that list wherever it is written. `EXPIRED` is
  not a synonym for `CANCELLED` — one is a decision somebody made, the other is
  an online checkout nobody came back to finish — and `expiredAt` records when
  the sweep in `pending-expiry.ts` released it, which is also the mark that
  stops a row being expired twice. Owns `Runner[]`.
- **Runner** — one participant on an order: `runnerNo` (their 1..n position on
  the order, and the tail of the reference they quote — see `order-ref.ts`;
  unique per registration), name, contact, gender, birthdate, `singletSize`,
  emergency contact, medical notes, `runningCommunity` (free-text snapshot,
  defaults to `"INDEPENDENT RUNNER"`). Indexed on `categoryId`, which is how
  taken slots are counted.
- **RunningCommunity** — the shared master club list. `slug` is the uppercased
  name and carries uniqueness; `status` is `PENDING` (a runner's write-in) or
  `APPROVED` (appears in pickers). Rejecting deletes the row.
- **Feedback** — **the one table that is about the software rather than about a
  race.** One message somebody sent through `/feedback`: `kind` (`ISSUE` |
  `SUGGESTION` | `FEATURE`, guarded by `asFeedbackKind`), the `message` itself,
  an optional `name` and `email`, the `pagePath` they came from and a truncated
  `userAgent`, plus `status` (`NEW` | `REVIEWED`) — the platform owner's own
  triage mark, which the sender never sees. **It deliberately has no relation to
  Organizer or Registration**: most feedback arrives from a signed-out runner, so
  a foreign key would be null on the majority of rows and would tempt a later
  reader into thinking a null meant something. Nothing in the product reads this
  table and no email is built on it. The message is capped at
  `MAX_FEEDBACK_MESSAGE` and the user agent is truncated on the way in, so a row
  is under 3 KB even at its worst — a thousand of them is a rounding error
  against the 0.5 GB tier.
- **PromoCode** — a discount an organizer hands out, redeemed at checkout.
  `discountType` is **`CATEGORY_PRICE`** (a second price list for one race —
  the amounts live in `PromoCategoryPrice`) or **`BUY_X_GET_Y`**
  (`buyQuantity`/`getQuantity`, and **one group per registration**: the two
  numbers add up to the largest order the promotion covers, so a group of seven
  on a "register 5, get 1" is six on one receipt and one on another). There used to be four; `PERCENTAGE`, `FIXED`
  and `FREE_DELIVERY` were removed together, because an organizer running a
  race thinks in prices per distance rather than in percentages off a basket.
  `discountValue` survives as an unread 0 — see its own note in the schema.
  `eventId` scopes it to one event; null means every event that organizer runs,
  which a `CATEGORY_PRICE` promotion may never be, since categories belong to
  an event. A promotion's window is `validFrom`/`validUntil`, both optional, and
  that is the only thing the marketing form sets — **`usageLimit` is no longer
  offered**. It briefly was, as a choice against the date window, and it was
  removed because it had no kind of promotion left to limit: a repricing
  promotion is capped per category on its price rows, in runners, and a group
  deal is bounded by the group it needs. The column survives because **a
  single-use voucher is just a limit of 1**, so there is no separate flag, and `batchLabel` is what makes two
  hundred bulk-generated vouchers read as one promotion. A `CATEGORY_PRICE`
  promotion never uses `usageLimit` at all — its caps live on its price rows,
  per category — so `isExhausted` answers for both shapes, and such a promotion
  is Fully Used only once **every** category it reprices has filled. There are
  no order minimums left: `minSubtotal` and `minRunners` went with the kinds
  that used them. **`automatic`** is the promotion nobody
  types: it applies on its own to any qualifying order, and `code` then holds
  its *name* ("EARLY BIRD"), which is what the event page and the receipt
  show. Only one discount is ever given — where several qualify, the largest
  wins. **`paused`** is the organizer's hand on the switch, the same idea as
  `Event.registrationPaused`: expired, scheduled and fully claimed are facts the
  app works out for itself, and this one is a decision.
- **PromoCategoryPrice** — one category put on a lower price by one promotion:
  `promoCodeId`, `categoryId`, `price` (centavos), `usageLimit`/`usageCount`,
  unique per pair, cascading on both sides. **Only the discounted price is
  stored.** The price it is discounted *from* is `Category.price`, read live, so
  an organizer who later raises the 10K cannot leave the event page crossing out
  a figure it no longer charges. **The cap is per category and counted in
  runners**, unlike `PromoCode.usageLimit` which counts orders — 50 seats on the
  10K and 30 on the 5K are two decisions, and a group of three eats three of
  them. An edit **updates these rows in place and never replaces them**, because
  deleting one would reset its `usageCount` and let a capped early bird be sold
  all over again.
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
| `event-schedule.ts` | The line between upcoming and finished. "Today" is **Asia/Manila**, not the server's UTC. A race stays upcoming through race day itself. `upcomingEvents()`/`finishedEvents()` return Prisma `where`s; `soonestFirst`/`mostRecentFirst` the orderings; `hasFinished()` the per-event check; `formatEventDay(Short)` and `formatEventTime` for display. `isCalendarDay` guards the `YYYY-MM-DD` format at the API door. It also owns the **instant** side of the same zone: `eventInstant(day, time)` turns a Manila wall clock into the moment `Event.registrationOpensAt` stores, `eventInstantParts` takes it back apart for the admin form's two boxes, and `formatEventInstant`/`formatEventInstantShort` read it out ("October 5, 2026 at 8:00 AM", "Oct 5"). Manila is a fixed +08:00 with no DST, which is why that conversion is a constant rather than a zone lookup. |
| `registration-gate.ts` | **Whether an event is taking sign-ups, and why not.** Four things close registration and a runner turned away must be told which: the race has been run (that line stays in `event-schedule.ts`), every option is full, the organizer paused it, or **sign-ups have not opened yet** (`registrationOpensAt` still ahead — `opensLater` is the check, `openingNote` the sentence, which names the date because that is the one thing this runner came for). `registrationState` ranks them **FINISHED → PAUSED → SCHEDULED → FULL → OPEN**: a hold outranks a schedule because pausing is the organizer's more recent word and lifting it hands the event back to its schedule rather than discarding it, and a schedule outranks a count because an event that has not opened cannot meaningfully be full. A scheduled opening **lifts itself** — nobody presses anything when the date passes, and the column is left in place afterwards so the organizer can still read what they set. `asOpeningInstant` is the API-door guard (blank means null; anything unparseable is refused with `OPENING_INSTANT_ERROR` rather than silently stored as "open now"). A cap is per `Category` (`slotLimit`), so `everyOptionIsFull` is what closes an event — one uncapped option keeps it open. **A slot is held by a `PAID` *or* `PENDING` registration**, because a bank transfer sits pending for days and counting only PAID would oversell every event that takes them. `takenSlotsByCategory` counts in one grouped query (the same call inside a transaction when a checkout route passes its `tx`), `withSlotCounts` does the arithmetic (`isFull`, and `isLastCall` under `LAST_CALL_SLOTS` = 20, which is when the picker starts naming the number), `registrationState` gives the one answer every screen asks for, `soleOpenCategory` names the option a runner has no choice about (the only one not full) so the register page can preselect it, `pauseNote` falls back to standard wording so a hold is never unexplained, and `forListing` tags public cards (`PAUSED`/`SCHEDULED`/`FULL`, in `registrationState`'s own order so a card and the page it links to never disagree) and drops the categories so capacity data never ships to the browser. **`reserveSlots` is the gate.** Both checkout routes call it inside the transaction that writes the registration: it locks the capped `Category` rows `FOR UPDATE` (ordered by id, so two orders cannot deadlock) *before* counting, because a check made before the write is one two simultaneous orders both pass. It throws `SlotsUnavailableError` carrying a message that names the option and the shortfall — "FULL PACKAGE has only 2 slots left and you entered 3 runners" — which both wizards show as-is. |
| `pending-expiry.ts` | **When an unpaid online checkout stops holding what it took.** A runner who opens PayMongo and closes the tab leaves a `PENDING` registration that holds two things for ever: a category slot (`SLOT_HOLDING_STATUSES` counts PENDING, so a bank transfer waiting on a human is not oversold) and a promo redemption (`redeemPromoCode` spends the code when the order is *placed*, or one voucher could sit on any number of unfinished checkouts). Both are right at checkout and neither had ever been undone, so a race could read as sold out on orders that were never going to arrive. `PENDING_EXPIRY_HOURS` is **24** — long enough that somebody who wandered off mid-payment and came back after dinner still has their order, short enough that a sold-out race frees its seats the next day — and it is a named constant so changing the window is one edit with its reasoning attached. **A `BANK_TRANSFER` is never swept**, whatever its casing: it is *supposed* to sit PENDING while an organizer looks at a deposit slip, and the exclusion is case-insensitive because rows written before `registration-codes.ts` uppercased the coded columns still hold `bank_transfer`. **One transaction per registration, not one for the sweep**, so a checkout landing mid-run never queues behind housekeeping; inside it the row is *claimed* first with a conditional `updateMany` (still PENDING, still unexpired) and the redemption released only if that claim won, which is what makes two overlapping sweeps unable to hand the same redemption back twice. The redemption is attributed by **code text scoped to the organizer**, exactly as `promo-redemptions.ts` does it and for the same reason, locked `FOR UPDATE` like `redeemPromoCode`, and **clamped at zero** — a promotion recreated under an old code inherits its history, so a fresh row can legitimately be handed back a redemption it never sold. The slot needs no action at all: it is held by the status, so it is freed by the act of changing it. `MAX_SWEEP` (200) keeps one run inside a serverless timeout and the result says when it was cut short. **The runner is not emailed** — Resend's free tier stops at 100 recipients a day and the worst use of one is telling somebody their abandoned checkout was tidied up; the organizer sees it on the registrants screen instead, where `EXPIRED` wears the neutral badge and the detail modal says when it happened and what went back. |
| `discount.ts` | **What a promo code is worth, and why it cannot be used.** `PromoCode` rows existed for a long time and were never wired into checkout — an organizer could create a code and nothing could spend it. This is the rule that makes one real, and it lives here because *four* screens have to agree about it: both wizards price the code as the runner types, and both checkout routes recompute it from the database and are the last word. Two kinds — **`CATEGORY_PRICE`** (a second price list for one race: each repriced category takes off `Category.price` less the promotion's price, capped at what that runner is actually paying, so a repriced 10K never gives away the extra a 3XL singlet costs) and **`BUY_X_GET_Y`** (whole groups only, **one group per registration** — `promoGroupSize` is `buy + get`, the largest order it covers, so twelve runners on one order still get one free and a group of seven is six on this receipt and one on another — and the **cheapest** runners are the free ones). There were four; the percentage, the flat amount and the free delivery went together, because they are what a general-purpose store needs and this is not a store — an organizer thinks in prices per distance. **Fees are never discounted**: the platform fee is the platform's and the transaction fee is PayMongo's. Every branch is capped at what it discounts, so a promotion that reprices a category below zero takes off no more than that runner's own entry. **`categoryPriceSavings` is the one walk through the order** that a repricing promotion produces everything from — the money off, the price printed on each runner's line (`chargedRunnerPrice`, taking an index rather than a category, since two runners on the same distance can be charged differently) and the seats claimed at checkout (`categorySeatsClaimed`). **A short promotion is split rather than refused**: a group of three on a 10K with two seats left pays the promotion price for two and the full price for the third, and the earlier runners get them, because every runner in one category saves the same amount so the order changes only which cards say the promotion price. **A sale is a price, not a deduction** (`AppliedDiscount.pricedIn`, and `isPricedIn` for the four screens that render a cost breakdown). A `CATEGORY_PRICE` promotion puts its own price on each runner's line in the order summary and shows no discount row at all, because that is how a sale reads everywhere else and quoting ₱1,200 with a ₱300 credit under it invites the runner to check arithmetic nobody asked for; every other kind leaves the goods at list and shows itself as a line off the order, so a typed code can be seen doing its job. **The money is identical either way** — `total = subtotal + fees − amount` — and the stored row keeps the list `subtotal` beside the `discountAmount`, so only the rendering differs. Both wizards' summaries and both emails read the same flag, and the email reads it from `Registration.discountType` rather than from the promotion, which may be gone by then. **`categorySalePrices` is the one place that decides which prices get struck through** — automatic, currently-running `CATEGORY_PRICE` promotions only, cheapest wins where two reprice the same option, and a price at or above the category's own is ignored rather than drawn through itself. The event page, the wizard's picker and its poster lightbox all read it and all render through `components/CategoryPrice.tsx`, so the two numbers a runner is shown cannot differ between the page that advertises the race and the form that sells it. `promoCodeError` returns one sentence naming the code and the condition it failed — "SUMMER10 gives you 1 free when 5 register, so it needs 6 runners on one order — you have 3" — and the wizards and the routes return the identical string, because a code accepted on screen and refused by the server would be worse than no code box. **A promotion may need no code at all** (`automatic`): an early bird is a discount tied to a date, and a group deal is one a group discovers by being a group — neither should depend on having been told a password. A **discounted category price is automatic by construction**: it is drawn onto the option a runner is choosing between, and a struck-through price nobody can claim without a code they were never given would be the event page lying about what the race costs. `bestDiscount` weighs every qualifying promotion, automatic and typed alike, and returns the largest; stacking is refused because two promotions at once is a number the organizer never agreed to, and a tie goes to the automatic one so a typed voucher stays unspent. A good code that merely lost is not an error — `outshoneByMessage` says so in a neutral voice. `freeSlotOffer` is what makes buy-X-get-Y claimable: the promotion pays nothing at five runners, so step 1 offers the sixth rather than leaving a group of five looking at a discount that does nothing. It goes quiet again at `buy + get`, where the group is whole and there is nothing left to offer — that is also where step 1 stops accepting runners, disabling *Add Another Runner* and printing `register/GroupLimitNotice.tsx` beside it, which names the promotion, gives the number and says the rest of the group registers separately. `promoConditions` says the size as a fact rather than a floor ("6 runners on one order", not "6+"), for the same reason. **`promoStatus` is the one answer to "is this running?"** — ACTIVE, PAUSED, SCHEDULED, EXPIRED or USED_UP, in that order of precedence, since the switch an organizer just flipped is the answer they will look for and a promotion that has been fully claimed is finished even with its window still open. The marketing table's badge, the event page's offers block, the "Running Now" metric and `promoCodeError` all read it, so a badge saying EXPIRED while the checkout still honours the code is not a state this app can reach. **`promoEndingSoon` is the one thing those five states cannot say**: a promotion that is running now and stops this week. Within `PROMO_ENDING_SOON_DAYS` (3) of its last Manila day it returns "Ends today" / "Ends tomorrow" / "Ends in 3 days", which the marketing table prints in amber under the Active badge and the event edit screen's promotions panel repeats — otherwise the first an organizer hears of the end is the word EXPIRED, by which point extending it is no longer a decision they can make in time. Counted in **calendar days**, not hours, because that is what the organizer typed: a code ending "on the 30th" ends today on the 30th however many hours are left of it. In-app only; an email about it would spend a recipient against a free-tier ceiling of 100 a day. `freeRunnerIndexes` says which cards wear the FREE badge, breaking ties towards the **last** runner, because a group of six at one price plainly means the sixth. `redeemPromoCode` is the gate, and mirrors `reserveSlots`: it locks the row `FOR UPDATE` inside the write transaction before incrementing, since a usage cap checked before the write is one two simultaneous orders both pass. **A code is spent when the order is placed, not when it is paid** — the same moment a slot is taken, or one voucher could be attached to any number of pending orders. Deliberately free of Prisma, so the wizards can import it. |
| `promo-store.ts` | Reading promo codes out of the database, kept apart from `discount.ts` for the same reason `running-community-store.ts` is kept apart from `running-community.ts`: the rule is imported by client components and must not drag Prisma into the browser bundle. `findPromoCode` scopes a lookup to the event's organizer and then to the event (or to a code that names none) and **skips automatic promotions, which are not codes**; `automaticPromosFor` is the query the event page and both wizards run on load; `resolveDiscount` weighs the automatic promotions and any typed code together and is what both checkout routes call instead of reading a discount off the request; `eventPromotions` is the same scope again for the **read-only panel on the event's own edit screen** — this organizer's promotions that name this event or name none — with a voucher batch collapsed into one entry and its counts summed, exactly as the marketing table collapses it. |
| `components/PromoHighlights.tsx` | The offers on a race, on the event page. Only **automatic** promotions appear: a code is the organizer's to publish where they choose, and printing every code on a public page would hand out the single-use vouchers meant for named invitees. It reads `describePromo` and `promoConditions`, the same two functions the wizard and the admin table read, so what this page promises and what the order summary applies cannot be worded differently. A repricing promotion also names the options it reprices and both their prices, since "special price on 2 categories" without saying which two sends a runner hunting for the difference. |
| `promo-redemptions.ts` | **What a promotion actually cost, and which orders spent it.** "Times Redeemed: 12" says how many, never how much, and an organizer deciding whether to run a promotion again is asking the second question. The peso column on the marketing table, the *Given Away* metric card and the list behind *View redemptions* all read from here, so a column saying ₱4,500 and a modal adding up to ₱5,200 is not a state this app can reach. **Attribution is by the code text, scoped to the organizer's own events** — `Registration.promoCode` is a snapshot string rather than a relation (kept that way so a deleted promotion cannot rewrite a receipt), so there is no id to join on and the text is all there is. Two accepted consequences: a promotion deleted and recreated under the same code inherits its own history, and an **automatic** promotion is attributed the same way, since checkout snapshots its *name* into that column. Scoping is done in the query, not after it: the code text is not proof of ownership, and two organizers may each run an `EARLYBIRD`. **Money is counted on `PAID` rows only, redemptions on placement** — a code is spent the moment the order is created, the same instant a slot is taken, so an abandoned online checkout leaves a redemption with no money behind it; counting it would overstate the cost of every promotion with an abandoned checkout in its past. Both numbers are shown rather than one being quietly preferred (the Used column grows a second line, `12 redeemed · 9 paid`, exactly when they disagree). `spendByCode` is **one grouped query for the whole screen**, not one per row, because a page with a voucher batch on it would otherwise make two hundred round trips; `redemptionsFor` takes *every* code of the promotion, since a batch is one promotion, and stops at `MAX_REDEMPTIONS_LISTED` (500) saying so rather than showing part of the truth silently. Server-only, like `promo-store.ts` and for the same reason. |
| `promo-input.ts` | **What the marketing form is allowed to say about a promotion.** Turning the posted fields into the columns they become, and refusing them by name when they cannot be — a buy-X-get-Y with no X, an end date before its start, a category priced at or above what it already costs. A promotion's window is simply its dates: `usageLimit` is written as null here whatever was posted, so an edit clears any cap a promotion carried from before the form stopped offering one, and the create route's batch branch is the only thing that sets it (to 1, which is what makes a voucher single-use). A `CATEGORY_PRICE` promotion is checked four ways, each refused under the box that caused it: it names one race, it needs no code, it reprices at least one category, and every price is below the category's own. It lives apart from the routes because *two* of them need exactly this check: creating a promotion and editing one, and a create route that caught a category priced above its own list while an edit route let it through would be worse than neither checking. It also owns the Manila day boundaries: a window that starts on the 1st starts at 00:00 Manila and one that ends on the 30th runs to 23:59 of it, because `new Date('2026-03-30')` is midnight **UTC**, eight hours early. |
| `voucher-codes.ts` | Generating a batch of single-use vouchers. The alphabet drops every character that can be misread off a printed card — no O against 0, no I or L against 1, no S against 5, no U against V — and codes are **random rather than sequential**, because SUMMER-001…200 hands anyone who receives one the other 199. `MAX_VOUCHER_BATCH` (500) is a ceiling on the free Postgres tier as much as on the promotion. Web Crypto, not `Math.random`. |
| `rate-limit.ts` | **Throttling the routes anyone on the internet can call**, and being honest about how far that reaches. A sliding window in one instance's memory, keyed by the first hop of `x-forwarded-for` — Vercel runs however many instances it likes and they share nothing, so this stops a naive script hammering one endpoint from one address and does **not** stop a distributed one. The honest fix is a shared counter in Redis, and there is no Redis here: adding one for a promo-code endpoint would cost more monthly than the abuse it prevents (§2). `PROMO_LOOKUP_RULE` is 20 tries a minute, deliberately far above anything a person does by hand, because of what a refusal looks like — `promos/lookup` answers a throttled caller **exactly as it answers a code we do not have**, so a real runner who somehow hit the wall would be told their code does not exist, and being wrong in that direction is worse than letting a slow script keep guessing. The map of callers is swept, and if still full cleared, past `MAX_TRACKED_KEYS` (5,000): forgetting who has been asking is the safe direction to fail, since the alternative is a route that refuses everyone because its own bookkeeping filled up. The window lives on `globalThis` for the same reason the Prisma client does — `next dev` re-evaluates modules on every edit. `FEEDBACK_RULE` is 5 messages every 10 minutes, and it is the counter-example on refusals: that route **writes** a row rather than reading one, and nothing about "you have sent five messages" is worth hiding, so it answers 429 with a sentence a person can act on instead of disguising the refusal as a miss. |
| `event-slug.ts` | Public event URLs. `slugifyEventTitle` → `uniqueEventSlug` on write; `eventByParam` matches slug **or** legacy cuid on read, and `canonicalEventPath` redirects old cuid links to the slug. **`registerPath(event, category?)`** spells the wizard's address, and with a category adds `?category=` — the option's **name, slugged** (`?category=10k`), because that link gets pasted into group chats, falling back to its id only when two options on the race slug alike. `categoryFromParam` reads it back (id first, then a slug exactly one option answers to) and finds nothing for a stale link rather than guessing. |
| `category-order.ts` | **The order an event's categories are listed in, everywhere.** `CATEGORY_ORDER` (`sortOrder`, then `id`) goes on every read of an event's categories that a person sees — the edit form's GET and PUT response, the create response, the events table, the event page, the wizard, the admin results screen, the winners board, the marketing form's price list and `promo-input.ts`. Nothing used to order them, so they came back in Postgres's physical row order, and an UPDATE writes the new row version at the end of the table: every save of the edit form moved the options it touched to the bottom, and a race's first category came back fourth. The create route numbers them by their position in the form; the edit route leaves `sortOrder` out of its update and gives an option added in that edit the next number after the event's highest. Rows that existed before the column were backfilled from their cuids, which sort in creation order. |
| `feedback.ts` | **What a piece of feedback is, and what the app will accept as one.** The three kinds (`ISSUE` | `SUGGESTION` | `FEATURE`) with `asFeedbackKind` guarding them at the API door, the two triage states with `asFeedbackStatus`, and `FEEDBACK_KIND_COPY` — the label, the blurb and **the per-kind placeholder**, which is the point of asking the kind first: the same empty box under "tell us anything" gets "the site is slow", and under "what were you doing, and what happened instead?" gets a page, a step and a device. The limits live here too (`MIN_FEEDBACK_MESSAGE` is 20 characters, so the inbox does not fill with rows nobody can act on; `MAX_FEEDBACK_MESSAGE` is what bounds a row's storage) and are enforced **twice** — in the form so the common case costs no round trip, and in the route, which is the last word. `asSitePath` is the guard on the `?from=` that names where a sender came from: it arrives in a query string, so a protocol-relative `//evil.example` is refused and only a single leading slash passes. `looksLikeEmail` is deliberately shallow — the address is optional and only ever used by a person clicking Reply, so a clever regex rejecting a valid address costs more than a bounced message does. |
| `event-type.ts` | `RACE` vs `FUN_RUN`. `asEventType` guards untrusted input (defaults to `RACE`); `sellsPackages(event)` is the branch the forms and wizards use. |
| `registration-form.ts` | `ONLINE` vs `BANK_TRANSFER` checkout. `asRegistrationForm` defaults to `ONLINE`; `offersBankTransfer`. |
| `shirt-size.ts` | The size chart, whether a category needs a size at all, and the 4XL-and-up upcharge. `subtotalWithUpcharge` is the priced truth. `shouldAskShirtSize(categories, categoryId)` decides whether the wizards show the field and whether validation requires it: the chosen category decides once one is picked, and before then the field is already visible when **every** option the event sells includes something to wear. It hides up front only for an event that also sells an option with nothing to wear (the Tarlac band-only package), where the answer is genuinely undecided. |
| `app/events/[slug]/register/delivery.ts` | Race-kit delivery tiers — the **money** only. A fee of `0` means **not offered**. `deliveryTiers`, `deliveryFeeFor`. Shared by both wizards so they can never charge differently. The zone codes, their guard and their labels moved to `registration-codes.ts`; this module re-exports them. |
| `app/events/[slug]/register/validation.ts` | What step 1 requires. Returns *which* fields are wrong, driving the red states, the summary dialog, and where the caret lands. Missing answers are most of it; a phone number that is present but the wrong length for its country is the exception, and it is named as such ("Mobile number must be 10 digits") rather than reported as blank. |
| `app/events/[slug]/register/useStepReveal.ts` | **What a change of step does to the page.** Step 1 is long and every later step is short, so leaving the scroll where Next was pressed dropped the runner past the end of the new step, looking at empty space and the footer. Both wizards call it with `step`, attach `panelRef` to the form column and `headingRef` (with `tabIndex={-1}`) to the step heading. On every change of step — Next, Back, or the jump to step 4 — it scrolls the **form column**, not the page, back under the navbar (below 1024px the summary sits above the form, so y=0 would land on the summary), **only ever upwards**, instantly under reduced motion; then moves focus to the heading so a screen reader announces the new step instead of losing focus with the unmounted button. It stops at the column's `scroll-margin-top`, `--wizard-top` in `RegistrationWizard.css` — the same number the sticky summary pins at. The step a runner lands on is never scrolled. |
| `consent-waiver.ts` | The liability/media/data-privacy waiver. Organizers may override it per event; the default wording is supplied here. **Never present an empty waiver.** |
| `consent-signature.ts` | **Who signed the waiver.** The tick records that a box was clicked; the typed signature records a person, which is the thing an organizer can hold up afterwards. **Whatever the runner types is accepted** — the only rule is that the box is not blank. It used to demand a match against one of the runners on the order, and that stopped honest people at the last step of the form: middle initials, married names, nicknames, and characters their keyboard renders differently all read as mismatches, and the runners it inconvenienced were never the problem. `normalizeSignature` now only collapses whitespace, so a box holding nothing but spaces still counts as empty. `consentSignatureError` has one message left, and it names its failure: the box is empty. Both wizards and both checkout routes import it, because a signature accepted on screen and refused by the server would be worse than the checkbox alone. |
| `running-community.ts` + `running-community-store.ts` | Club names, `INDEPENDENT RUNNER`, and the pending/approved flow for runner write-ins. `asRunnerCommunity` is what a runner's club is stored as: normalized, then **uppercased** like every other registrant field (see `text-case.ts`), with a blank answer landing on `INDEPENDENT RUNNER`. The picker snaps a typed club to an approved entry's own casing *before* that, so matching is still on the list's terms. |
| `inclusions.ts` | Free text (one item per line) ⇄ stored string[] for what a category includes. |
| `text-case.ts` | **Registrant text is stored UPPERCASE** — first and last name, gender, emergency contact name, delivery address, medical conditions, running community. The stored value, not a CSS transform: the same runner is read back by the admin table, the runner modal, the CSV export, both emails and the e-certificate, and a `text-transform` fixes exactly one of those. `upperCaseAsTyped` runs in both wizards and the admin's runner-edit modal (it does not trim, or a space between two given names would vanish as it is typed); `upperCaseForStorage` / `optionalUpperCaseForStorage` run in both checkout routes and the runner PUT, because a tab left open can POST past the UI. **Email is never uppercased** — the local part is case-sensitive on some mail servers — and neither are passwords, phone numbers, blob URLs, or most of what an organizer types about their own event. The **category / package name is the exception** and *is* uppercased (in `EventOptionsPanel` as it is typed, and in both admin event routes on the write): it is printed beside runner data in the registrants table, the export and the emails, so it has to match them. A closed picker carries the casing in its own options (`GenderField` offers `MALE`/`FEMALE`), and a **sample** placeholder is uppercase too — `JUAN`, `DELA CRUZ` — so the hint matches what will appear in the box. A placeholder that *describes the shape of the answer* counts as a sample and is uppercased too — the delivery address reads "HOUSE/UNIT NO., STREET, BARANGAY, CITY/MUNICIPALITY, PROVINCE, ZIP CODE". Only a placeholder that tells the runner what to **do** stays in sentence case: "Select Gender", "Select or type a size", the club picker's "Type to search, or add your own", and the email address. Where such an instruction **quotes a sample**, that quoted part alone is uppercased — medical conditions reads "e.g. ASTHMA, ALLERGIES (Leave blank if none)".  **`normalizeAccountEmail` is the one place an email *is* cased**, and it is the opposite direction: an organizer's sign-in address is lowercased on the way in by `auth/login`, `auth/register` and `admin/profile`. The rule above is about a *runner's* email — contact data on an order, never used to find anything, so it is stored exactly as typed. An organizer's is the identifier the account is looked up by, and Postgres compares exactly, so one capital used to mean "Invalid credentials" for a correct password. |
| `registration-codes.ts` | The three coded columns on a `Registration` — `paymentMethod`, `logisticsMethod`, `deliveryZone` — and the words a person reads instead. They are stored **UPPERCASE** (`BANK_TRANSFER`, `DELIVERY`, `INSIDE`) like every other coded column in the schema; they used to be the only lowercase ones, because they were kept in PayMongo's casing. `asLogisticsMethod` / `asDeliveryZone` / `asPaymentMethod` **accept either casing**, so a registration written before the change still prices and displays correctly and no backfill is needed. `paymongoPaymentType()` is the **only** place a method is lowercased, at the PayMongo API boundary in `api/checkout` — their API rejects anything else. The labels are title case for a runner choosing or reading a receipt; `registrants/page.tsx` uppercases them once for the admin, where they are stored data beside a runner's uppercase name. `delivery.ts` re-exports the zone type and guard from here and keeps only the money. |
| `inclusion-icon.ts` | Which icon stands for a line of "What's Included". Keyword → icon, whole-word matched with an optional plural, first rule wins, and a plain `Check` for anything unrecognised — a wrong icon misinforms, a check merely fails to inform. It lives here so the same inclusion never draws a different icon on a different screen. The vocabulary is the organizer's: a **bib** is the chequered race flag, the **ticket** belongs to a *raffle*, a **band** or wristband is `Watch`, a **pin** or badge is `Badge`, an **entitlement** is `Gift`, a **bandana** or scarf is the bandana icon — plus `Shirt`, `Medal`, `Timer`, `GlassWater`, `Utensils`, `Camera`, `Backpack` (last, so "race kit" never beats a line naming what is in it). The race flag and the bandana are not in lucide, so they are drawn here through lucide's own `createLucideIcon` and inherit its grid, stroke and props. |
| `race-time.ts` | **A finishing time is displayed to whole seconds.** Timing exports carry tenths ("1:18:56.9"); the fraction is precision no runner reads and it wrecks the big monospaced time on a results page, so `toWholeSeconds` trims it everywhere a time is *shown* — the winners board, the full results table and its mobile cards, the runner analytics page, the e-certificate PDF and the admin results table. The uploaded string is stored untouched, and ranking still runs off `chipTimeSecs`, so this is a display rule only. |
| `e-certificate.ts` + `components/ECertificate.tsx` | **A runner's e-certificate, wherever it is offered.** `buildCertificatePdf(result, event)` draws it with pdf-lib — the organizer's uploaded template (PDF, or PNG/JPG on an A4 landscape page) at the heights set in the event form, or a plain bordered certificate when there is none or it cannot be read — and shrinks a long name to fit the page. It is browser-only (it fetches the template) and is loaded with `import()`, so a page carries pdf-lib only once someone asks for a certificate. `useECertificate(event)` generates and holds one open (`show(result, sharePath)`, `generating`, `open`, `close`); `ECertificateModal` is the dialog, **portalled to `<body>`** so no transformed ancestor traps it and no leaderboard row it was opened from receives its clicks. *Share Result* points at the runner's own result page (`sharePath`), never the page the dialog was opened on. The runner page's `ECertificateGenerator` and the full leaderboard's Actions menu both use it, so the certificate cannot differ between them. |
| `order-ref.ts` | **The reference a runner quotes back at us.** An order gets `RM-D918005C`; each runner on a **group** order gets that plus their position — `RM-D918005C-1`, `-2`, `-3`. A **solo** registration keeps the bare order reference: the suffix exists to tell members of a group apart, so on an order of one it distinguishes nothing and only makes the reference longer to read out and easier to mistype. `runnerRef` therefore takes the order's size and will not accept being called without it. The two answer different questions and both are kept: the order reference is what was paid and what an organizer matches against a bank line, the runner reference is one person inside a group who registered together. `newOrderRef` (both checkout routes) and `runnerRef` (the registrants table, the detail modal, the CSV export and both emails) live here so a reference is never formatted one way on screen and another in an email. `newOrderRef` uses **Web Crypto**, not node's `crypto`, so the module stays importable from the client component that renders the table. |
| `pickup.ts` | **What a runner choosing on-site pick-up is told.** `logisticsPickup` says only that the option exists; `Event.pickupLocation` and `Event.pickupSchedule` say where and when, and either may be blank because a venue is usually settled before the hours. The rule: never show a pick-up option with nothing under it — `pickupDetails` returns the trimmed halves, `hasPickupDetails` whether anything was said, `pickupSummary` the one-line form, and `PICKUP_FALLBACK` the honest sentence when the organizer has not settled it, the same way `pauseNote` refuses to leave a hold unexplained. The same wording appears on the pick-up card in both wizards, on the confirmation screen and in the received email — the moment of choosing, the moment of finishing, and the thing still in the inbox on race week. |
| `bank-accounts.ts` | Validating and normalizing per-event bank accounts between form, API and wizard. |
| `phone.ts` + `request-country.ts` | Phone numbers stored in **E.164**. Country list from dial codes; names via `Intl.DisplayNames`. The country is *guessed* from `x-vercel-ip-country` and always overridable. `NATIONAL_DIGITS` carries the exact national length for the countries we are sure of (**PH = 10**) and is deliberately short: `maxNationalDigits` caps the field at it, `isPlausiblePhone` requires it, and everything unlisted stays loose under E.164's 15-digit ceiling. The trunk zero is stripped **before** the cap applies, or a pasted `09171234567` loses its last digit. |
| `blob.ts` | Every upload. `uploadPublicFile` (returns a URL) vs `uploadPrivateProof` (returns a **pathname**) + `signedProofUrl`. 4 MB cap, because a Vercel function body caps at 4.5 MB. It enforces the policy in `uploads.ts` but does not own it. **A stored proof's extension is set from its content type, not from the name the phone gave it** (`proofFileName`): the admin viewer decides between an `<img>` and a PDF frame by reading that pathname, so a bank app that hands over a PDF called `slip` — or `slip.jpg` — must not be able to lie about it. Any directory part of the name is dropped on the way in. Note that `src/lib` modules import **each other by relative path** (`./uploads`, not `@/lib/uploads`) — the `jiti` scripts under `scripts/` do not resolve the `@/` alias, so an aliased import here breaks `npm run test:blob` and `npm run seed:dev`. |
| `uploads.ts` | **What may be uploaded — the one list both sides of the wire read.** It used to live inside `blob.ts`, which imports the Blob SDK and therefore cannot be imported by a client component, so every `accept="…"` on a file input was a hand-copy of it and the copies drifted: both registration wizards offered `application/pdf` for a deposit slip while the server took images only, and a runner who picked the PDF receipt their bank emailed was refused by `/api/checkout/manual` at the very end of checkout with the whole form already filled in — while `image/webp` and `image/gif` were accepted by the server and offered by nobody. Nothing here imports the SDK, so an input can now advertise exactly what `assertUploadable` will take: `acceptAttribute(kind)` builds the attribute, `describeUploadTypes(kind)` the hint a runner reads ("JPG, PNG, WEBP, GIF or PDF"), `listUploadTypes(kind)` the server's rejection message, and `MAX_UPLOAD_MB` the number in the hint — which said 5 MB against a 4 MB cap for as long as it was typed by hand. Three kinds: `image` (event imagery), `template` and `proof`, the last two also allowing PDF. `isPdfProof(pathname)` is how the admin screens tell a PDF receipt from a photo of one. |
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
| `/` | Home. Hero + up to 6 **upcoming** events, soonest first. Events are the point of this page. The hero stands under an animated brand-coloured dot arch — see `HeroArcBackground` in §9 |
| `/events` | Full upcoming listing |
| `/events/[slug]` | Event detail and registration entry point. **Redirects to `/results/[slug]` once the race is over and its times are uploaded** — see the section rule below. A finished race with no times yet stays here and says so. Carries `PromoHighlights`: the automatic promotions running on this race, named before the runner starts. Codes are never listed there — those are the organizer's to hand out. **Each row of the Categories / Packages sidebar is a link into the wizard with that option already chosen** (`registerPath(event, cat)`), wearing Register Now's chevron and its `LinkPendingIcon`. Only while Register Now itself shows: a full option, or every option while the race is paused, not yet open, full or over, stays plain text. **A race whose sign-ups have not opened yet** puts *Registration Opens Soon* and the date where Register Now stands, and its listing card wears an `Opens Oct 5` chip with a *View Event* button instead of the gradient one — the race is listed early on purpose, so the card and the page both stay readable |
| `/events/[slug]/register` | The wizard — `RegistrationWizardClient` (ONLINE: 3 steps, plus step 4 for proof when the runner picks bank transfer) or `BankTransferWizardClient` (3 steps). Steps: **1** runners & categories, **2** logistics, **3** checkout/payment, **4** proof upload. **`?category=`** preselects the first runner's option (`initialCategoryId` on both wizards); the page resolves it against this event and its slot counts, so an unknown or since-filled option is not preselected. **With no usable `?category=`, an event with only one option still open (`soleOpenCategory`) opens with that one already chosen** — a single-distance race, or one whose other options are full — and `CategoryPicker` then heads it "Your Category" / "Your Package" with a line saying it is the only one open, instead of "Select …" over a choice of one. Two or more open options wait for the runner. Runners added later inherit runner 1's choice as before. The **proof upload on step 4 takes a PDF as well as a photo** — a bank confirmation arrives as one — and both its `accept` attribute and the hint under the drop zone are built from `uploads.ts` rather than typed out, so what the picker offers is what the server will take. |
| `/results` | Finished-event landing, most recent first — the same `EventGrid` card as `/events`, with `action="results"` |
| `/results/[slug]` | Winners board. Each division is one `DivisionPanel` (the male and female podiums differ only by accent). **On a phone a podium row is two lines** — the name gets the full width beside the medal, the bib and time share the line under it — because on one line the medal, gaps and time left the name ~70px and every winner read "DANIEL…"; from `sm` the time returns to the right edge. The category heading always reads `{name} ({distance}) Winners` — "10K (10KM)" included, so every category reads alike — and carries no icons; a package, having no distance, drops the brackets |
| `/results/[slug]/full` | Full searchable table; category filter via query param. **The table shows from `lg` only**; below that it is cards — one column on a phone, two on a tablet — because eight columns need ~850px and between `md` and `lg` the table overflowed behind a hidden scrollbar, cutting off Actions. A row's **No.** is its place in the list being looked at (`positionOf`: page start + index), never `row.index`, which is its place in the whole sheet and numbered page 3 from 41. A count line says how many finishers match. The pager has first/last as well as prev/next, 40px targets, and **turning the page scrolls the top of the list back under the navbar** when it has scrolled away. The two filter menus split the row on a phone, the second opening from its right edge; both, and the rows-per-page menu, close on an outside press or Escape (`useDismissableMenu`). The search field is 16px on a phone — see §9. **A row's Actions menu opens the e-certificate in place** (`useECertificate`, §5): *View E-Cert* used to link to the runner's page with `?cert=1`, costing the reader their place in the list; now the item reads "Generating…" until the certificate is drawn, then the menu closes and the dialog opens over the leaderboard. *View Details* still goes to the runner's page |
| `/results/[slug]/[bib]` | One runner's result, addressed by **the number they wore** — `/results/bizrun-v2-0/1042`, not a 25-character cuid — because this is the link a runner shares and should be able to read, recognise and even type. `@@unique([eventId, bibNumber])` is what makes a bib a valid address. The segment is read as a bib first and as a row cuid only if that finds nothing, so every cuid link already sent to a runner still resolves and is then redirected to its bib address. Build these with `runnerResultPath(event, result)`. Plus `ECertificateGenerator` — the button, over the shared `e-certificate.ts` / `ECertificate.tsx` (§5); `?cert=1` still opens the certificate on arrival. Container is `max-w-5xl`, wide enough that the four analytics tiles get a real column each — they go four across from **860px**, the width at which a tile can hold "Overall Rank" on one line, and sit two across below that. The hero splits into name + time panel at `md`, where the name column is at its narrowest (~300px); the name sizes are tuned against that width so no word ever has to break in half. The card is built to hold **any** name: the time panel never shrinks and the name's display size steps down as the name gets longer (see §9), so a 30-character name and a 9-character one produce the same card. The certificate shrinks the drawn name to fit the page for the same reason. The *View E-Certificate* button is full-width on phones and a centred `w-fit` on desktop. The card's padding and the tiles' step down on a phone (and again under 360px) so every tile label holds one line down to 320px; the gender tile reads "in Male division", not "in M". **Back to Leaderboard** opens `/full`, where the search is — it used to say "Back to Search" and open the winners board. **The certificate opens as a bottom sheet on a phone** and a centred dialog from `sm`, closes on Escape and locks the page's scroll. The PDF is previewed inline (`#view=Fit`) only where `navigator.pdfViewerEnabled` and a fine pointer both hold — Chrome on Android paints an empty grey box and iOS Safari a cropped corner — and a phone instead gets a summary of what the certificate says, with the download as the way to see it. *Share Result* uses the share sheet where there is one and otherwise copies the link and raises a toast |
| `/feedback` | **The one place a runner or an organizer tells us about the app itself** — a broken page, something that could be easier, something they wish it could do. A page rather than a floating widget on purpose: a persistent bubble covers the bottom-right corner, which on a phone is where the wizard's Next button and the leaderboard's pager live, and the home page is meant to showcase events rather than argue with a badge. So the entry points are **placed**: the footer's Legal & Support column, on every public page, and the button beside *Return to Homepage* on both registration success screens — the one moment we know somebody has just used the app end to end. The form asks the kind first and **the prompt in the message box changes with it** (`FEEDBACK_KIND_COPY`, §5); name and email are optional and say so, because a required contact field is how a feedback form ends up collecting nothing. `?from=` carries the page the sender came from, validated by `asSitePath` and **shown to them** rather than collected quietly, along with the browser version. The reveal is the stagger (`.t-stagger`), and the thank-you replaces the form through the same motion rather than as a jump cut. The support address stays on the page under the form: some things need a screenshot, and a form is the wrong shape for those |
| `/coming-soon`, `/privacy`, `/terms`, `not-found` | Real designed pages — see the no-dead-links rule in §8 |

**A race lives in one section at a time, and the URL says which.** While a race
can still be entered it is under `/events`. The moment its organizer uploads
times it moves wholesale to `/results` — it drops off the `/events` listing, and
`/events/[slug]` itself redirects to `/results/[slug]`. The reason is that the
address should tell a runner which part of the site they are in, judged by what
the page actually shows them: nobody opening a finished race is looking at an
event any more, they are reading a result. A finished race whose times are *not*
up yet is the one in-between case — it is in neither listing, and `/events/[slug]`
keeps it, saying registration is closed and the times are still coming.

Old `/events/[slug]/results...` URLs are permanent (308) redirects in
`next.config.ts` rather than deleted routes, because they are already out in the
world. They pass the event segment straight through, so a stale **cuid** link
still resolves: the destination reads either form via `eventByParam` and sends
the visitor on to the canonical slug via `canonicalResultsPath`
(`src/lib/event-slug.ts`). Build results links with `resultsPath(event)` from
that module rather than writing the path out by hand.

**A runner is addressed by their bib, not by a row id.** `runnerResultPath`
(same module) spells `/results/[slug]/[bib]`. The one exception it carries is a
results sheet imported with a blank bib column — the importer does not reject
those — and such a row falls back to its cuid, because the bare event path is
the winners board and would otherwise swallow it.

### Organizer (`/admin`, gated by `src/proxy.ts`)
`/admin` dashboard (an Overview of three tiles — **Total Revenue (Net)**,
**Total Registrants**, **Active Events** — over the five most recent
registrations. There is no *Page Views* tile: it was a placeholder that only
ever read `N/A`, and a metric card that never carries a number teaches an
organizer to stop reading the row. Do not re-add a tile until something real
counts behind it) · `/admin/login` · `/admin/register` · `/admin/events` (the row menu carries
**Schedule Sign-Ups**, which opens a modal holding the same
`RegistrationOpeningPicker` the create and edit forms use: open registration
now, or name the date and time it opens itself. Saving either answer also lifts
a manual hold, since both are the organizer saying when sign-ups happen. A
scheduled row shows a *Scheduled* badge with the opening date quietly under it.
Plus `/new` and `/[id]/edit` — the edit screen ends with a **read-only
Promotions panel**: what a runner registering for this race can be given, its status and
its conditions, with a link through to the marketing screen. Read-only on
purpose — one screen owns promotions, and a second place to edit them is a
second place for them to drift) · `/admin/events/[id]/registrants` (rows whose email
never went out carry an **Email Unsent** badge, an *Unsent Email* toolbar toggle
lists exactly those, and a mail icon opens the manual-send modal; **`?search=`
prefills the search box**, which is how the marketing screen's redemptions panel
links straight to one order. The **detail modal has two doors** — the eye beside
the Reference and *View Details* at the top of the row's actions menu — because
an organizer who has already opened the menu to edit or validate should not have
to close it to read the order first; both open the same modal, and the menu's
entry looks the runner up in the live list rather than carrying a captured row,
so it never shows a stale copy. The **proof of payment opens full screen**
(`ProofLightbox.tsx`) — from the thumbnail itself or the *View fullscreen* link
beside the heading — with zoom (buttons, wheel, pinch, double-click, anchored on
the point being read), pan (drag or arrow keys, so the drag is never the only
way), rotate (phone photos of deposit slips arrive sideways) and *Open in a new
tab*; the 300px thumbnail says a slip was uploaded, it does not let anyone read a
reference number off one. **A receipt is not always a photo** — a transfer done
in a banking app is confirmed by an emailed PDF, and a runner may upload that
rather than screenshot it — so a proof whose stored pathname ends in `.pdf`
(`isPdfProof`, carried onto the row as `proofIsPdf` by the server page) gets a
labelled card where the thumbnail would be, and a frame holding the document
where the image would be. The browser's own PDF viewer owns zoom, rotation and
paging there, so those tools leave the toolbar rather than sitting dead in it,
and *Open in a new tab* is repeated in words under the frame for a browser that
will not display a PDF inline. The order's own **Order Total, Transaction No. and
status are printed under the image**, and a PENDING bank transfer carries
*Validate Payment* there too, because matching the receipt against the order was
otherwise done across two screens from memory. Portalled to `<body>`, since the
detail modal's frame is `overflow-hidden` and would clip it) ·
`/admin/events/[id]/results` (the uploader detects the sheet's real header row —
timing exports open with banner rows — and maps columns by sheet index, not by
label; Chip and Gun Time print to whole seconds like everywhere else —
§5, `race-time.ts`) · `/admin/marketing` (promotions: the kind, the event it is scoped to, what it
requires, whether it is claimed by a code, a voucher batch or automatically,
**how much it has given away**, and a row menu to view its redemptions, edit,
duplicate, pause or delete — *Duplicate* is the create form with the row's own
values in it and no route of its own, blanking only what has to be unique (the
code or name, the batch label and its size) and dropping the dates when the
promotion being copied has already ended, so a copy is never born expired;
a promotion in its last three days carries an amber *Ends in 3 days* line under
its Active badge — a batch collapses into one row that opens to be copied, on
the same searchable, sortable, paginated table the events and registrants
screens use. Three metric cards: Running Now, Times Redeemed and **Given
Away**, the last being the Given column added up) ·
`/admin/settings` (profile + password) · `/admin/[...missing]` → the admin's own 404.

### Super admin (`/superadmin`)
`/superadmin` dashboard (platform revenue, fees) · `/superadmin/organizers`
(approve, suspend, set commission) · `/superadmin/communities` (approve, rename,
reject clubs) · `/superadmin/feedback` (**the reading end of the public form** —
three metric cards over the messages, newest first. It is the super admin's
screen and not the organizer's for the same reason the club list is: feedback is
about the platform rather than about any one race, and it carries strangers'
email addresses. A message is a paragraph rather than a field, so the table shows
one line of it and **the row opens** into the whole thing — the second-`TableRow`
pattern the marketing screen's voucher batches use — carrying the page and the
browser it came from and a *Reply by email* that opens a `mailto:`. The chips
filter by triage state and by kind; the order never changes under somebody
working down the list, which is why the unread ones are **found** rather than
sorted to the top) · `/superadmin/[...missing]`.

### API (`src/app/api/**/route.ts`)
| Route | Methods | Notes |
| --- | --- | --- |
| `auth/login`, `auth/logout`, `auth/register` | POST | Sets / clears `admin_token`. **The account email is lowercased at the door** on both `login` and `register` (`normalizeAccountEmail`, §5) — and on `admin/profile` PATCH, which is the third place one can be written. Postgres compares text exactly, so until this landed a single capital from a browser autofill found no row and the login answered "Invalid credentials" for a password that was perfectly correct; `register` had the matching gap, where two accounts could exist for one address differing only in case and the unique index would not have stopped them. All three normalise through one helper, because this is precisely a rule two screens must never disagree about |
| `checkout` | POST | PayMongo checkout session. Re-derives every amount from the database. |
| `checkout/manual` | POST | Bank transfer: multipart, proof file → private blob. The file is validated by `uploadPrivateProof` under the `proof` kind — JPG, PNG, WEBP, GIF or PDF, 4 MB — which is the same list the wizard's picker offers |
| `webhooks/paymongo` | POST | HMAC-verified; marks the registration `PAID` |
| `upload` | POST | Organizer-only image upload (public store) |
| `admin/events`, `admin/events/[id]` | POST / GET, PUT, PATCH, DELETE | Event CRUD including categories and bank accounts. Categories keep the position they were created in across every `PUT` — see `category-order.ts`. `PATCH` is **when sign-ups are open, on its own** — `{ registrationPaused }` from the menu's pause item, `{ registrationOpensAt }` from its scheduling modal, either or both, so the events table changes one thing without re-posting a form it never rendered; a body carrying neither is refused rather than treated as a no-op. An opening sent on its own also clears `registrationPaused`, or the date would arrive to a paused event. Scoped to the signed-in organizer's own events. `GET` also carries `promotions` — what `eventPromotions` says is running on this race — for the read-only panel at the foot of the edit screen |
| `admin/events/[id]/results/upload` | POST | CSV/XLSX results import; dedupes by bib, computes seconds and the three ranks |
| `admin/registrations/[id]/status` | PATCH | Confirm or reject a manual payment, and write the validator's internal `remarks`. Takes either or both; the status is guarded against a fixed list and the receipt email fires only on the *transition* into `PAID`, so a later remarks-only PATCH cannot send a second receipt. Auth-checked and scoped to the signed-in organizer's own events — **this route had none at all until Batch E**, which made it the one way for anyone on the internet to mark a registration `PAID` |
| `admin/registrations/[id]/email` | GET, POST | The email a registration is owed, rendered for a person to send by hand — `GET` returns the recipient, subject and **both** renderings (HTML for the clipboard, plain text for a `mailto:`), `POST` records that a staff member sent it. Auth-checked and scoped like the status route, which matters more here than most: the rendered email carries every runner's contact details, birthdate and emergency contact |
| `admin/runners/[id]`, `admin/runners/bulk-delete` | PUT/DELETE, POST | Registrant editing |
| `admin/proof/[id]` | GET | Auth-checked redirect to a short-lived signed proof URL |
| `feedback` | POST | **Public**, and the only route on this site that writes a row on a stranger's say-so — the people most worth hearing from here are signed out, so an auth check would silence exactly them. Three things hold it: the `FEEDBACK_RULE` throttle (§5) applied **before the body is read**, every length and vocabulary rule from `lib/feedback.ts` enforced here and not only in the form, and the fact that nothing a sender writes is rendered anywhere but the superadmin inbox, as text. A refusal names the field it is refusing and hands back that field's key, so the form puts the caret in the right box (§8, rule 4) rather than showing a catch-all over a form the sender has to re-read themselves. The browser is read from the request headers rather than from the body — a client that can be asked to describe itself can be asked to lie — and the created row's id is deliberately **not** in the answer |
| `promos/lookup` | POST | **Public.** The terms of a code a runner just typed, scoped to the event they are registering for. Returns the *terms*, not a computed discount — the order keeps changing under the runner, so the wizard recomputes with `applyPromo` and nothing here is trusted at checkout. A code we do not have comes back as `{ promo: null }` with a 200, since "we don't have that" is an answer rather than a failure; the response carries no id, organizer or batch. **Throttled** by `lib/rate-limit.ts` (20 a minute per address) before the body is read, and a throttled caller gets that same `{ promo: null }` — a distinct "slow down" would make this endpoint a *better* oracle when throttled than when open |
| `admin/promos` | POST | Creates one code, a whole batch of single-use vouchers in one call, or an automatic promotion. Refuses rather than repairs, naming the field it refused, and scopes `eventId` to the signed-in organizer's own events. A `CATEGORY_PRICE` promotion's price rows are written **in the same statement** as the promotion, since one with no prices is one the event page would advertise and the checkout would ignore |
| `admin/promos/[id]/redemptions` | GET | Which orders used this promotion — order reference, event, runner count, status, `discountAmount`, `createdAt`, and for a voucher batch the specific code that was used. Covers **all** of the promotion's codes, since a batch is one promotion, and is capped at 500 with a flag saying when it was cut short. Auth-checked and scoped to the organizer's own events, which matters twice here: an id from the browser is not proof of ownership and neither is the code text |
| `admin/promos/[id]` | PATCH, DELETE | Edits, pauses or removes a promotion. A body carrying **only** `{ paused }` is the hold on its own and touches nothing else — the row menu has no form open, so it has no terms to re-post, exactly as `admin/events/[id]` PATCHes its registration hold. Any fuller body is a real edit and is validated in full. **A batch is one promotion, not two hundred**, so an operation on any of its vouchers is an operation on all of them, and the response says how many rows it touched. An edit runs in a **transaction**, because the terms and the price list have to move together: a promotion whose columns saved and whose prices did not is one advertising numbers the checkout no longer holds. The price list is replaced wholesale rather than merged, so a category the organizer cleared loses its row. What a promotion *is* cannot be edited — a code cannot become codeless, a batch's shared label and its random codes stay put, and a voucher stays single-use — because those changes would take the promotion away from people already holding it. Deleting is safe for history: `Registration.promoCode` and `discountAmount` are snapshots, so it removes the ability to redeem, not the record of a redemption. Auth-checked and scoped to the organizer's own rows |
| `cron/expire-pending` | GET, POST | The daily abandoned-checkout sweep (`lib/pending-expiry.ts`). **Not an admin route** — a scheduled job has no cookie — so it is guarded by the `CRON_SECRET` shared secret in `Authorization: Bearer …` (what Vercel Cron sends) or `x-cron-secret` (a person with curl). With the secret **unset it returns 503 rather than running unguarded**, since the deployment that forgot the variable is exactly the one nobody would check. GET and POST do the same thing because Vercel Cron only issues GET; nothing reaches the sweep without the secret. Returns what it did — how many expired, how many redemptions went back, and whether `MAX_SWEEP` cut it short — and logs the order references, since the caller reads nothing |
| `admin/profile`, `admin/profile/password` | PATCH | Self-service only; the id comes from the cookie, never the body |
| `superadmin/organizers`, `superadmin/organizers/[id]` | GET, PATCH | Status and commission |
| `superadmin/communities`, `superadmin/communities/[id]` | GET/POST, PATCH/DELETE | Club curation |
| `superadmin/feedback`, `superadmin/feedback/[id]` | GET, PATCH/DELETE | The feedback inbox. `SUPER_ADMIN` only — an organizer reading it would be reading other organizers' complaints about the software, and strangers' email addresses. `GET` returns everything newest-first rather than paged: the whole table is the messages people took the trouble to write, and if it ever outgrows one call that will be a good problem. **`PATCH` moves the triage mark and nothing else** — the message, the name and the address are what somebody else wrote, and an inbox that can edit its own mail is one whose contents cannot be trusted later. `DELETE` is a genuine delete, unlike anything on a registration: there is no person waiting on the row, nothing in the product reads it, and a kept-"in case" spam row is one more thing between the owner and the messages that matter. The screen confirms first |

---

## 7. Security model

- `src/proxy.ts` guards `/admin/**` (except `/login` and `/register`) and
  `/superadmin/**`: no token → `/admin/login`; a `SUPER_ADMIN` on `/admin` →
  `/superadmin`; a non-super-admin on `/superadmin` → `/admin`.
- **Route handlers re-check auth themselves.** The proxy does not cover
  `/api/**`, so every admin route calls `getAuthCookie()` and scopes its queries
  to the signed-in organizer.
- **Admin server pages scope too, not just the API.** The proxy proves a session
  exists; it never asks whose event the `[id]` in the URL is. So every page under
  `/admin/events/[id]/**` calls `getAuthCookie()` and reads the event with
  `findFirst({ where: { id, organizerId: auth.id } })`, rendering its own
  "Event not found." on a miss — the same wording as a genuinely missing event,
  so the screen cannot be used to probe which ids exist. `registrants` and
  `results` both do this; the `edit` screen is a client component, so its scope
  lives in `GET`/`PUT /api/admin/events/[id]`, and the results uploader's in
  `POST /api/admin/events/[id]/results/upload`. **Never read an event by id
  alone on an admin surface** — the registrants screen carries every runner's
  email, phone, birthdate, emergency contact and medical notes, and an id is not
  proof of ownership. These pages need no `SUPER_ADMIN` branch, because the
  proxy redirects a super admin off `/admin/**` before they render.
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
- **An account is found by a lowercased email, and written as one.** `login`,
  `register` and `admin/profile` all run the address through
  `normalizeAccountEmail` (§5). The failure this prevents is quiet and reads
  as a wrong password rather than as a bug, so the invariant matters more
  than it looks: the stored value and every lookup have to agree by
  construction. The profile route in particular used to argue the opposite
  in its own comment — correctly, while login matched exactly — which is why
  changing one of the three means changing all three.

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
- **A public page that reads the database renders per request.** Next.js
  prerenders a page with no dynamic segment at build time and then never
  rebuilds it, which freezes both the data *and* the clock: `/` and `/events`
  went on badging a race **Paused** after its organizer had scheduled it, and a
  build-time `new Date()` would also keep a finished race in the grid and count
  down to an opening that had already come. So `/`, `/events` and `/results`
  each export `dynamic = 'force-dynamic'`, with the reasoning written out in
  `src/app/page.tsx`. The `[slug]` pages under `/events` and `/results` are
  already server-rendered on demand because they take a dynamic segment and
  have no `generateStaticParams` — that is why the event page was right while
  the listing in front of it was wrong — but **any new public page that queries
  Prisma and has no dynamic segment must opt in explicitly**; check the build's
  route table for a `○` on a page that should be live.
- Imports use the `@/` alias for `src/`.
- Registrant text is stored **UPPERCASE**, email excepted (§5, `text-case.ts`).
  A field whose value is stored uppercase shows an uppercase *sample*
  placeholder; a placeholder that is an instruction stays sentence case.
- Money is centavos everywhere (§5). Dates are `YYYY-MM-DD` strings against a
  Manila "today". Phones are E.164.
- A finishing time is never shown with tenths — every display runs through
  `toWholeSeconds` (§5, `race-time.ts`), including the e-certificate.
- **A runner's name is untrusted length.** Anywhere a name shares a row with
  something else, that something else gets `shrink-0` and the name's column gets
  `min-w-0` — otherwise the name holds the column open and mangles what is beside
  it. In a list the name then truncates; on the runner's own result card it is the
  headline, so instead its size steps down by name length (`nameScale` in
  `results/[slug]/[bib]/page.tsx`) and the block is capped at about two lines with
  `text-balance`. Never fix a long name by hard-coding a line break.
- **A text field a runner types into is 16px on a phone** (`text-base sm:text-sm`).
  iOS Safari zooms the whole page into any field set smaller than that the
  moment it is focused, and leaves it zoomed afterwards. The leaderboard's
  search is the worked example.
- A pill or badge never wraps inside itself: chips sit in a `flex flex-wrap` row
  and each carries `whitespace-nowrap`. A chip holding organizer-typed text (a
  category name) also truncates, and the full text is shown elsewhere on the page.
- **A clipping panel that holds form fields is `overflow-clip`, not
  `overflow-hidden`.** The glass panels carry decorative glows that overhang
  their edge, and an `overflow: hidden` box is still a scroll container:
  `scrollIntoView` and `focus()` scroll it to reach a field, sliding the
  content sideways under the clip with no scrollbar to undo it. The wizard's
  form panel did exactly that after "Take me there" and carried the shift into
  every later step. `overflow: clip` clips and rounds the same way but cannot
  be scrolled.
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
  A cell that has something to add to a badge uses **`.status-note`** (Admin.css)
  — a small line under it in the badge tones' own colours, as the marketing
  table's *Ends in 3 days* does — never a second `.status-badge`, because two
  pills in one cell read as two states when there is only one.
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
  The row is a CSS grid with two arrangements: from `sm` up it is one line
  (radio, name, chips, price, tick); on a phone it is two fixed lines — name
  with the radio at its right, then chips with the price on the right edge —
  so every card is the same height instead of wrapping wherever the text runs
  out. On a phone the poster thumbnail (with its expand badge) is the way into
  the inclusions and the "View inclusions" link is hidden; an option with
  inclusions but no poster keeps the link on every screen.
- **Stopping something is a pause, not a deletion.** An organizer switching a
  promotion off gets Pause / Resume, the same word and the same reversible
  gesture as the events table's registration hold. Deleting is for a mistake;
  pausing is for a decision, and a code printed on a poster does not stop
  existing because its row did.
- **A discount is never a surprise at the end.** An automatic promotion is named on the event page, priced into the order summary from the first render of step 1, and — for a group deal — offered as a free slot with a FREE badge on the runner it belongs to. **A group deal also states where it ends**: one registration covers one group, so step 1 stops at `buy + get` runners with the reason beside the disabled button rather than letting a group of ten fill in four cards the promotion was never going to pay for. A promotion the runner only meets on the payment step cannot do the thing it was created to do.
- **One form field on the public side, and it lives in `globals.css`.** `.input-group` — a label, a control, and whatever small print goes under it — was written for the registration wizard and lived in `RegistrationWizard.css` until the feedback form needed the same controls. The choice then was a second copy of those declarations or one definition both surfaces read, and a runner should not meet two different text boxes on one site, so it moved. The wizard's own layout (`.form-grid`, `.logistics-options`, the step furniture) stayed behind; only the field itself moved. **It sets no `font-size` on purpose** — the control inherits the body's 16px, which is exactly what the iOS zoom rule below wants — and its invalid state is driven off `aria-invalid` rather than a class, so the colour a person sees and the state a screen reader announces cannot drift apart.
- **A closed list of answers is never a native `<select>`.** The wizard has
  `events/[slug]/register/SelectField`; the admin now has `admin/AdminSelect`,
  the same interaction wearing `.form-label` / `.form-input`. Two components
  rather than one because they live in different design systems. The admin's
  remaining native selects (the results uploader, the registrants table's size
  field) are the ones to move onto it as they are next touched.
- **A row's action menu is portalled to `<body>`.** Every card and table in the
  app clips its own overflow (rounded corners, horizontal scrollers), so a menu
  laid out inside the row is cut off on the last rows. The admin menus
  (`admin/events/EventActionsMenu` and its siblings) and the public leaderboard's
  `ActionMenu` (`results/[slug]/full/FullResultsClient`) all render into
  `document.body` with `position: fixed`, place themselves from the trigger's
  `getBoundingClientRect()`, reposition on scroll and resize, and — the
  leaderboard's — flip above the trigger when the space below it cannot hold the
  menu. Copy that rather than an `absolute top-full` menu. The three admin
  menus share one width — `.action-dropdown-menu` is **210px**, wide enough for
  the longest label plus its icon and the pending dots — and
  `.action-dropdown-item` is `white-space: nowrap`, so an item never wraps onto
  a second line beside one-line neighbours and a label never has to be
  shortened to fit. Each menu positions itself as `rect.right - 210`, so that
  number moves in `Admin.css` and in all three components together.
- **One status badge, four tones** (`Admin.css`): `success` for done, `pending`
  (amber) for a state that is simply waiting and needs nobody, `danger` for
  something that failed and a person must act on — an email that never went out
  — and `neutral` for a fact that is neither, like a sold-out event. Reach for
  one of these rather than a one-off pill.
- **A failure is answered, a success is announced.** `useAlert()` hands out
  three things and they are not interchangeable. `alert` and `confirm` open the
  blocking dialog and are for what a person must read or decide — a validation
  summary, a delete. `toast` raises a small panel at the bottom-right that
  leaves on its own after four seconds, and is for what merely worked: a
  promotion created, paused, resumed or deleted. Do not make an organizer
  dismiss a box to be told a thing they just asked for happened, and do not
  demote a failure to a toast that can time out unread. Toasts stack (dialogs
  queue) and wear the same four variants as the dialog, so a success is the
  same green check in both. Marketing is the screen that uses them; every other
  silent `router.refresh()` in the admin is a candidate.
- **A wait is the shape of the answer.** A panel that fetches shows
  `components/ui/Skeleton`'s `SkeletonSwap` — placeholder rows built from
  `SkeletonBar` at the widths the real rows have — and cross-fades them into
  the content in one grid cell, rather than swapping a "Loading…" sentence for
  a list and jumping height. The redemptions panel on `/admin/marketing` is the
  worked example. Bars must be direct children of the skeleton layer or they
  will not pulse.
- **A whole screen waits differently from a panel.** Every admin and superadmin
  page is a database read behind an auth cookie, so a click on the sidebar can
  sit for a second with the page being left still on screen — and an organizer
  who cannot tell a slow page from an ignored click will click again. Two things
  answer that, and both are already wired:
  - `admin/loading.tsx` and `superadmin/loading.tsx` render
    `admin/AdminRouteLoading` — the page frame every screen in the dashboard
    shares (an 80px `.admin-header` with a pulsing skeleton bar where the title
    goes, then `.admin-content`) with the brand loader centred in it. Next.js
    makes that the Suspense fallback for the segment and everything nested
    under it — **but a fallback shows only when the segment directly under it
    changes**. `admin/loading.tsx` answers a sidebar click (`events` →
    `marketing`), not a click that stays inside a section: the events table →
    Edit / Registrants / Manage Results / New Event keeps `events` as the
    segment under `admin`, so it sat on screen unchanged until the page came.
    That is what `admin/events/loading.tsx` is for. **A new section with pages
    nested under its index needs its own `loading.tsx` rendering
    `AdminRouteLoading`**; a flat one (every superadmin screen today) does
    not. A page that fetches its own data on the client after arriving (the
    edit form) renders `AdminRouteLoading` while it waits too, so the route's
    wait and the fetch's wait are one screen, never a bare "Loading…" line.
  - `components/ui/LinkPending` marks *which* link was clicked, because the
    sidebar's active state comes from `usePathname()` and does not move until
    the navigation commits. It reads `useLinkStatus()` (Next 15.3+, and it only
    works inside a `<Link>`), sits in a slot that is always in the layout so
    appearing costs no layout shift, and fades in after 120ms so a fast
    navigation never flashes it. It rides the sidebar's nav items **and** the
    three destinations in `events/EventActionsMenu`.
- **A row's action menu stays open on the page it opened.** The menu used to
  close the instant an item was clicked, which on a slow destination left the
  events table sitting there unchanged — indistinguishable from a button that
  did nothing. Clicking Registrants, Manage Results or Edit Event now puts the
  menu in `.is-navigating`: the other items dim back and stop taking clicks,
  the chosen one keeps full contrast with `LinkPending`'s dots beside it, and
  an outside click can no longer dismiss it. The page it opened is what
  replaces it. Pause and Delete are unchanged — they act in place and close.
- **The dashboard's page transition is the skeleton reveal, applied to a
  route.** `.admin-content` and `.admin-header-title` fade and un-blur on mount
  over `--skel-reveal-dur` / `--skel-reveal-ease` — the same numbers `.t-skel`
  uses on the marketing panel, so a route swap and a panel swap move alike. The
  two halves cannot share a grid cell the way `.t-skel` does (React unmounts
  the fallback and mounts the page in its place, so they are never on screen
  together), which is why the motion rather than the markup is what carries
  across. It is CSS on those two selectors rather than a wrapper component
  because every page in the dashboard already renders both, and a client
  navigation builds them fresh — which is what makes the animation replay. The
  `.admin-header` bar is deliberately left out: it is identical chrome on both
  sides of the swap, and fading it would flicker the frame the reveal exists to
  hold still. It fills **`backwards` only** — a finished `blur(0)` is still a
  filter, and a filter re-anchors every `position: fixed` modal inside the page
  to `.admin-content`. With `both` it did: the edit form's success dialog was
  centred halfway down a long form, off screen, so saving an event showed a
  dimmed page and a stuck "Saving..." button. Never give an element that holds
  page content a lasting `filter` or `transform`. The fallback's own reveal is
  dropped to `--duration-quick`, because 400ms of fade before the dots appear
  is 400ms still looking like nothing happened.
- **The dashboard's loader is three pulsing dots in solid brand orange**
  (`components/ui/LoadingDots`, `.t-dots` in `globals.css`). Solid, not the
  orange→blue gradient: at 12px a ramp averages into a grey-lavender that reads
  as neither colour, and the one element on screen saying "your click was
  heard" has to be unmistakable. Three sizes — `sm` beside a word, `md`, `lg`
  filling a page. All the motion is CSS, deliberately: the component renders
  inside `loading.tsx` fallbacks, and a framer-motion version would drag every
  one of them across the client boundary for an animation a keyframe already
  does. Reduced motion swaps the swell for a fade rather than for nothing — the
  element exists to say something is happening.
- **The runner side waits with a sprinter, not with dots.** Everything a runner
  touches answers a click with `components/ui/RunnerLoader` (`.t-runner` in
  `globals.css`): an original running figure in brand blue whose arms and legs
  run a real stride (each limb is a thigh or upper-arm group turning at the
  joint with the shin or forearm nested inside it, `transform-box: view-box`,
  the two sides half a `--runner-cycle` apart), with brand-orange speed lines
  streaming off behind. The owner asked for it because a runner who presses
  Register and sees nothing move assumes the button is broken; the dashboard
  keeps its dots. Hook-free and pure CSS, like `LoadingDots`, so it can render
  in a `loading.tsx`. A new wait on the public side should be one of these four:
  - **A page on its way** — four `loading.tsx` files render
    `components/PublicRouteLoading`, a **loading screen**: the `lg` figure with
    a shimmering caption (transitions.dev's shimmer-text, `.t-shimmer`) on a
    **viewport-fixed stage** under the navbar, on the page's own ground with a
    soft pool of blue. It is fixed, not in the page flow, because in-flow it
    broke on exactly the tap that matters most: Register Now pressed from low
    on a long event page swapped a 3,000px page for a short one, the browser
    clamped the scroll, and the figure landed above the top of the screen with
    the footer filling the view. The outer `.public-route-loading` is only a
    viewport-tall spacer; the fade sits on the stage because a filter on an
    ancestor would re-anchor the fixed stage to it. **Two files per section,
    and both are needed**: `events/` and `results/` catch arriving at a race,
    `events/[slug]/` and `results/[slug]/` catch moving within one (event page
    → wizard, winners → leaderboard → a runner's result) — a fallback shows
    only when the segment *directly* under it changes. It fades in after
    120ms, so a prefetched page never flashes it, and after
    `--runner-slow-after` (5s) its caption swaps to "Still loading, hang
    tight" through the text-swap motion (`slowCaption` on `RunnerLoader`,
    timed in CSS so the fallback stays hook-free) — a long wait is explained,
    never left looking stuck. `/` and the legal pages are prerendered and need
    none.
  - **The page arriving** — `<main>` carries `.public-main`, and each page
    rendered into it fades and un-blurs on mount over `--skel-reveal-dur`, the
    dashboard's route reveal, so the runner leaving and the page arriving read
    as one movement. It fills **`backwards` only**: a finished `blur(0)` is
    still a filter, and it would re-anchor every fixed modal inside the page
    (poster lightbox, size guide, bank details). The same rule gives the page a
    `scroll-margin-top` of `--nav-offset`, so Next's scroll on arrival never
    parks the page's top under the navbar.
  - **The link that was pressed** — `components/ui/LinkPendingIcon` wraps the
    icon a call to action already carries (the chevron on Register Now, View
    Results, View Full Leaderboard, View all) and cross-fades it into the `sm`
    figure through the icon swap (`.t-icon-swap`) while `useLinkStatus()` says
    the link is pending, after the same 120ms. The figure sits absolutely over
    the icon's cell, so the button never changes width. Only inside a `<Link>`.
  - **A submission that leaves the page** — `components/ui/RunnerOverlay`, a
    blocking panel on `t-modal` tokens, open while either wizard creates the
    PayMongo checkout or uploads a deposit slip. It says what is happening and
    asks the runner to keep the page open. **Portalled to `<body>`**, because
    the wizard's stagger reveal leaves transforms on its panels and a
    transformed ancestor traps `position: fixed`.
  - **Inside a button** — `size="sm" tone="current"` draws it in the button's
    own text colour, since brand blue vanishes into the gradient's blue end
    (the e-certificate generator, and the leaderboard's *View E-Cert* item).
  The leaderboard's rows used to open a result with `window.location.href`, a
  full reload with nothing on screen meanwhile; they now `router.push` in a
  transition, prefetch on hover, and the row's number becomes the figure while
  it opens. Reduced motion *pauses* the figure rather than removing it — a
  paused animation holds the frame its delay points at, so it freezes
  mid-stride — and the speed lines pulse in place.
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
- **The public site's quiet button is `.btn-secondary`** (`globals.css`).
  Wherever a runner is offered a second way forward beside the gradient —
  *Browse Other Races* on the registration gate and the event page's on-hold
  panel, *Back to Home* on the 404, the support address on `/coming-soon` and
  the legal pages — that button is `.btn-secondary`, never a hand-rolled set
  of Tailwind borders. It copies `.btn-gradient`'s geometry exactly (16px
  radius, 48px minimum, the same padding and its 640px step, 700-weight
  uppercase at 0.05em, the same 2px lift on hover) and differs only in the
  surface: white-at-4% glass with a `--glass-border` edge that warms to orange
  on hover. The pair must read as one set, so pass it only layout utilities
  (`w-full`, `shrink-0`, `sm:w-auto`); padding and type belong to the class.
  The one licensed exception is a label that is a literal string rather than a
  command — an email address — whose inner span carries
  `font-medium normal-case tracking-normal` so it still reads as an address.
- Styling: Tailwind utilities plus the CSS variables in `globals.css` (motion,
  spacing, radius, glass, gradient tokens). The admin has `Admin.css` and
  `Auth.css`; the wizard and event page have their own CSS files. Dark,
  glassmorphic, with an orange (`#FF6B00`) → blue (`#007AFF`) gradient.
- **Motion comes from transitions.dev.** The `--duration-*` / `--ease-*` /
  `--distance-*` scale at the top of `globals.css` is that library's shared
  motion scale, and the `t-*` classes below it are its snippets: `t-modal`,
  `t-dropdown`, `t-tilt`, `t-stagger`, `t-toast`, `t-skel`. Each snippet keeps
  its `@media (prefers-reduced-motion: reduce)` guard — never drop it — and its
  own token block in `:root` so a duration can be tuned in one place. The
  reference for all 32 free transitions is installed as an agent skill at
  `.claude/skills/transitions-dev/`; reach for one of those before hand-rolling
  an animation, and add the CSS at the bottom of `globals.css` next to its
  siblings. (`.claude/` is gitignored, so the skill is per-checkout: reinstall
  it from `github.com/Jakubantalik/transitions.dev` under `skills/`.)
- **The home hero stands under a dot arch** (`components/HeroArcBackground`,
  `.hero-arc` in `globals.css`). It is a Canvas 2D port of the "Predictive Arc"
  background, and only its core renderer — the package's iframe and Three.js
  variants were left behind, so no dependency came with it. It is recoloured to
  be the logo's track bend, and reads as a finish gantry over "Find Your Next
  Finish Line": **outer rim brand orange, inside brand blue, a warm white
  core**, with the two accents read from `--accent-orange` / `--accent-blue` at
  mount rather than typed. Blue goes on the inside because the copy sits under
  the arch and blue is the darker accent. The rules it keeps are the ones any
  later decorative loop should copy:
  - The apex is **anchored to the hero copy** (`--nav-offset` plus the section's
    top padding), not to a fraction of the layer. A fraction put the white core
    through the headline at some widths.
  - A scrim of `--bg-primary` pools behind the text.
  - It redraws at **30fps**, one path per colour, with DPR capped at 1.5.
  - It **pauses** off screen and in a hidden tab, and draws **one still frame
    under reduced motion**.
  - It fades in on the skeleton-reveal tokens once the first frame is drawn.
  - It runs full-bleed and up under the navbar like the event page's poster.
    That is why the home page wrapper does not clip its overflow.
- **No decoration behind a page at a negative `z-index`.** The public pages
  used to float two blurred accent orbs (`-z-10`) behind their content. At rest
  those sit under `<body>`'s own background and cannot be seen at all, but the
  page-arrival reveal (`.public-main > *` in `globals.css`) animates opacity and
  a filter, which briefly makes the page its own stacking context — and for
  that split second the orbs painted on top of the ground as a hard-edged
  blue-to-orange box behind the dimmed page. They were removed from every page
  (home, `/events`, `/results`, and the `PageOrbs` helper the 404, coming-soon,
  legal and registration-closed pages shared). A glow that should be seen goes
  inside the surface it lights, at a non-negative z-index, as the orbs inside
  `StatusPanel` and the winners-board panel do.
- Fonts: Outfit (`--font-sans`, headings), Inter (`--font-body`).
- **The logo is a component, not an image** (`components/RunAsOneLogo.tsx`,
  `.rao-logo` in `globals.css`, geometry in `lib/brand-mark.ts` — the one copy
  of the path data, which the component, the themed favicon and the icon
  raster scripts all draw from; `app/icon.svg` is the sole exception, a static
  file that can import nothing, so change it in the same edit). It replaced `public/run-as-one-logo.png`
  everywhere a person sees the app: the public navbar and footer, both
  dashboards' sidebars, and the two auth cards. Two halves made of deliberately
  different material — **the mark is SVG geometry** (three concentric arcs, ink
  then blue then orange, with a solid orange dot carrying on past the outer
  arc: a track curve with the pack inside it and one runner already clear), and
  **the wordmark is real HTML text**, because SVG `<text>` is laid out in
  whatever font actually resolved, so its width — and with it the cropping of a
  fixed `viewBox` — changes between the fallback face and the real one. Live
  text sidesteps that, scales crisply, and is what a screen reader announces
  when the lockup sits in a link (which is why the mark beside it is
  `aria-hidden`, and why the DOM text is mixed-case and uppercased in CSS).
  Three variants — `full`, `stacked`, `mark`. **Flat colour, never the
  orange→blue gradient**: this logo has to survive a bib, a shirt and a
  tarpaulin, and a ramp is the first thing a printer loses.
- **The brand is "Run As One by: CRC", and `SITE_NAME` is the only place it is
  spelled.** It used to be written "RunAsOne" and the parent brand only rode
  along on the logo; both halves are now one name, and every surface that names
  the platform in prose — the root `<title>` and every page title, the Open
  Graph `siteName`, the two legal pages, the footer copyright, the sender name
  and footer on every email — builds its string from `SITE_NAME` in
  `lib/site-contact.ts` rather than typing it. **Never retype the name**: the
  first version of this rename left half the page titles behind because they
  were string literals, which is why they are template literals off the
  constant now. Two consequences worth knowing: the email sender's display name
  is **quoted** (`"${SITE_NAME}" <…>`), because a colon is one of RFC 5322's
  specials and a bare phrase containing one is not a legal display-name; and the
  lockup's own two lines are the *only* copies of the name that are not read
  from the constant, because they are separately styled DOM text — the wordmark
  says "Run As One" and the byline "by: CRC", and the two must be edited
  together with it. The `RunAsOneLogo` component, its file and the `.rao-logo`
  class keep their old identifiers; they are code names, not text a person sees.
- **"by: CRC" is part of the lockup, not an option.** Run As One by: CRC is Cresendo
  Running Community's platform, and a parent brand that appears on some
  surfaces and not others stops reading as a parent brand — so the endorsement
  line renders on every variant that has a wordmark, and there is no prop to
  turn it off. It sits **flush with the left edge of the wordmark** in the
  horizontal lockup and centred in the stacked one, sharing the wordmark's own
  alignment axis so the two lines have one edge between them rather than two;
  right-aligning it would hang it off an edge that letter-spacing keeps moving.
  Mixed case against the wordmark's caps is what marks it as the quieter line.
  Its size is `max(9.5px, 0.24em)` rather than pure `em`: small text does not
  scale down linearly and stay readable, so the floor holds it legible at the
  32px the navbar uses while it still grows on the surfaces that can carry it.
  It replaced a "Race registration" tagline that never shipped — one sub-line
  is all the slot holds, and the parent brand earns it.
- **Sizing the logo is one number.** `--rao-logo-size` is the height of the
  mark and everything else — wordmark, tagline, every gap — is `em` off it, so
  a call site sets one value and the proportions hold:
  `className="[--rao-logo-size:32px] sm:[--rao-logo-size:38px]"`. Do not size
  the wordmark or the gaps per surface; that is what left the old raster logo a
  different size in every corner of the app.
- **The logo draws in four variables, not hexes** — `--logo-ink`, `--logo-mid`,
  `--logo-accent`, `--logo-muted`, defined in `globals.css` and pointing at the
  site tokens so the logo cannot drift from the accents beside it. A
  `:root[data-theme="light"]` block already holds the light values, with the
  two accents deepened (`#d95f00`, `#0062d6`) because brand orange on white is
  2.8:1 and a thin stroke at that contrast reads as a smudge. **When the
  light/dark switch lands it only has to set `data-theme` on the root** — the
  component does not change. A logo on an unusual surface can likewise be
  re-tinted by setting `--logo-ink` on its container.
- **The three brand assets outside the component, and why each is a different
  file.** They are not interchangeable and the favicon is not any of the others:
  - **`app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png` — the mark alone,
    no wordmark**, since a tab icon is ~16px. The SVG carries literal colours and
    its own `prefers-color-scheme` rule (a favicon is fetched as a standalone
    document and never sees the page's stylesheet) and wins in every modern
    browser; the `.ico` is the old-browser and crawler fallback and the Apple
    icon is what iOS puts on a home screen. Both are regenerated from the mark
    with `sharp` — pure geometry, so they rasterise without needing a font.
  - **`app/opengraph-image.png` — the 1200x630 card a shared link shows.** This
    is what Messenger, Viber, Facebook, X and Slack scrape, and **it has nothing
    to do with the favicon**: before it existed a shared link showed no image at
    all. Next turns the file into `og:image` on its own, but only once
    `metadataBase` is set in `layout.tsx` — a preview will not resolve a relative
    path. `SITE_URL` in `site-contact.ts` is that base, and **it has to be a
    hostname this Vercel project actually serves**: it once named a
    `*.vercel.app` host the project had never been assigned, which broke nothing
    in a browser but pointed `og:image` at a URL Facebook could not fetch, so
    the crawler substituted the featured event's poster and captioned the card
    with a domain that did not exist. `opengraph-image.alt.txt` beside the PNG
    supplies the card's `og:image:alt`.
  - **`public/email/run-as-one-logo.png` — the full lockup for the email
    header**, 3x for a 224px display width. Email needs a raster: Gmail strips
    inline SVG and no client resolves the app's CSS variables. It moved out of
    the Blob store it used to live in and into `public/`, so it ships with the
    code that renders it instead of being a file somebody uploaded by hand and
    versioned nowhere.
  **Every one of them is exported with a transparent background** — this is the
  project's rule for brand assets, decided knowing the cost, so never bake a
  full-bleed background plate back in to make one safer. The ink is white, so
  each asset depends on the surface behind it being dark; the email header cell
  holds `#050505`, and the icons sit on browser and OS chrome that is dark more
  often than not.

  **The Open Graph card is the one asset that carries its own ground**, because
  it is the one nobody else's surface can be trusted for: it was demonstrably
  reduced to two coloured arcs when a light-mode preview composited it onto
  white. It gets an **inset rounded panel, not a full-bleed plate** — `#050505`
  with the app's own hairline border, a 30px transparent margin all round, and
  the radial glows and the orange→blue rule living inside it. 30px is not
  arbitrary: some platforms crop a 1.91:1 card to 2:1, taking 15px off the top
  and bottom, and a tighter margin would leave the panel looking clipped rather
  than deliberately inset.
- **The favicon follows the theme; the Open Graph card cannot, ever.** This is
  the one asymmetry worth understanding before someone tries to "fix" the
  second. `components/ThemedFavicon` (mounted in the root layout) rewrites the
  SVG icon link to a data URI whenever the theme changes, taking an explicit
  `data-theme` first and the system `prefers-color-scheme` otherwise — the same
  precedence `globals.css` uses, so the light/dark switch will not have to
  remember to tell the favicon about itself. It swaps the `href` rather than
  leaning on the `prefers-color-scheme` rule inside `app/icon.svg`, because
  whether a browser *evaluates* a media query inside a favicon differs between
  Firefox, Chrome and Safari and has changed more than once; the static file
  stays as the pre-hydration and no-JavaScript default. **The Open Graph card
  has no equivalent and no workaround**: `og:image` is one static URL that
  Facebook's, Slack's and X's crawlers fetch server-side, cache on their own
  infrastructure and serve to every viewer alike. The crawler sends no
  colour-scheme signal, the cached image is shared between a light-mode and a
  dark-mode viewer, and no platform negotiates alternates. A card therefore has
  to be legible on any ground *by design*, which is exactly why this one carries
  its own inset dark panel rather than borrowing the platform's background.
  **Regenerating the two with a wordmark means rendering them in a browser**,
  where the real Outfit face is loaded — rasterising SVG `<text>` outside one
  picks up whatever font the rasteriser happens to find. `public/run-as-one-logo.png`
  is the previous CRC artwork; nothing references it any more.

  **Renaming the brand means re-rendering both wordmark rasters**, and neither
  can be regenerated from source, because there is no source — they were
  rasterised from a browser once and committed. The way they were re-cut for
  the "by: CRC" rename is the way to do it again: measure the existing byline's
  glyph runs, baseline and colour out of the PNG itself, reproduce them in a
  canvas on a page where the real Inter face is loaded (Inter 500, `0.06em`
  tracking, `#A1A1AA` — the byline is Inter, not the wordmark's Outfit), and
  composite only that line back. The OG card's byline sits on the panel's
  gradient, so its box is rebuilt by interpolating each column between the clean
  rows above and below rather than filled flat; the email lockup's byline sits
  on transparent ground and its box is simply cleared. Patching the one line
  leaves every other pixel of both assets byte-identical, which is worth more
  than a clean re-render that would drift.

  **A re-cut email logo also needs its URL bumped and a deploy to `main`.**
  `LOGO_URL` in `lib/email.ts` carries a `?v=` (`LOGO_VERSION`) that must change
  with the PNG: Gmail's image proxy caches each image URL on Google's side and
  keeps serving that copy, so a new file behind an old URL still shows the old
  picture. And the URL is built on `SITE_URL`, the production domain, so an email
  sent from localhost or a preview shows whatever production serves — the "by:
  CRC" logo sat fixed on `dev` while every test email kept showing "by CRC",
  because `main` had not been deployed.
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

**`PROMOTIONS_PLAN.md` is finished.** All three batches have landed; like
`IMPROVEMENTS_PLAN.md` it is now kept only for the reasoning behind each and for
the decisions it records as not to be relitigated. It is no longer a queue, and
the file itself says it may be deleted.

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
  promotion to one event or to all of theirs, picks **a discounted category
  price or buy-X-get-Y**, gives it an optional date window, and chooses how it
  is claimed: one shared code, a batch of
  single-use vouchers, or **automatically, with no code at all**. A runner types
  a code in step 3 of either wizard; an automatic promotion is on their order
  from the first render and named on the event page before they start. Both
  checkout routes recompute whichever applies, and only one discount is ever
  given.
- **A promotion can reprice a race's own options** (Category Prices). The
  organizer picks the event, and the form lists its categories with each one's
  own price beside a box for the promotion's — blank leaves that option alone,
  so an early bird on the 10K need not invent a number for the 5K. What a
  runner then sees is the old price struck through and the new one beside it,
  in both places a price per option appears: the event page's category
  list and the picker in the registration wizard, all through
  `components/CategoryPrice.tsx`. The "What's Included" headings deliberately
  carry no price — costs are compared in the sidebar, and repeating them beside
  every inclusions list only added noise. **In the
  order summary and on the receipt it stops being a discount and becomes the
  price**: the runner's line says ₱900, there is no credit row under it, and
  the promotion is named with the saving stated as a fact rather than
  subtracted a second time. A typed code is the opposite and unchanged — the
  goods stay at list and the code shows what it took off. The stored row is
  the same in both cases (list `subtotal`, `discountAmount`, `promoCode`,
  `discountType`), so the organizer's *Given* column, the *Given Away* card
  and the revenue tile all keep counting the same money.
- **A repricing promotion can be capped per category, in runners** (Category
  Prices, extended). The form carries a second box
  beside each price — 50 at ₱900 on the 10K, 30 at ₱600 on the 5K — and it
  counts runners rather than orders, so a group of three takes three. The event
  page and the picker carry an **"N left at this price" chip** once a category
  is within `LAST_CALL` (20, matching `LAST_CALL_SLOTS`), and a filled category
  simply returns to its own price rather than showing a sale nobody can get.
  Seats are claimed inside the checkout transaction by `redeemPromoCode` under
  the same `FOR UPDATE` lock and id ordering `reserveSlots` uses, and handed
  back by the abandoned-checkout sweep — which counts `Runner.promoPrice` rather
  than recomputing from the promotion, so an order that took two of the last
  three seats gives back two. An edit cannot cap a category below what it has
  already sold. `scripts/check-category-price-math.ts` guards the invariant that
  the summary's line items reconcile with its total. This kind is
  **automatic only and always scoped to one race** — categories belong to an
  event, and a struck-through price is the most public thing a promotion can
  be. `PERCENTAGE`, `FIXED` and `FREE_DELIVERY` were removed in the same change
  and their rows deleted; receipts are unaffected, because `promoCode` and
  `discountAmount` on a registration are snapshots.
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
  and was reporting money that had been given away. An abandoned online
  checkout no longer keeps its redemption or its slot for ever: the daily sweep
  in `pending-expiry.ts` releases both after 24 hours, and its trigger is
  `POST/GET /api/cron/expire-pending`. The four smaller gaps are closed too
  (Promotions Batch C). The public code-lookup route is **throttled** — 20 tries
  a minute per address, answering a throttled caller exactly as it answers a
  code we do not have (`lib/rate-limit.ts`, honest in its own comment about
  stopping the naive script and not a distributed one). A promotion can be
  **duplicated** from the row menu, which is the create form prefilled from the
  row rather than a route of its own. An event's edit screen ends with a
  **read-only panel of the promotions running on that race**, so a price is
  never set with the discounts against it out of sight. And a promotion in its
  last three days says so in amber under its Active badge (`promoEndingSoon`),
  rather than letting EXPIRED be the first an organizer hears of it — in-app
  only, for the same free-tier reason as the sweep.
- **Abandoned online checkouts are swept daily** (Promotions Batch B). An
  unpaid online order older than 24 hours becomes `EXPIRED`, gets an
  `expiredAt` stamp, gives its promo redemption back and — by the act of
  leaving `PENDING` — its category slot too. A **bank transfer is never
  swept**; it is supposed to sit pending while a person looks at the proof. The
  rule is `lib/pending-expiry.ts`, the trigger is `/api/cron/expire-pending`
  behind `CRON_SECRET`, and the schedule is the single entry in `vercel.json`.
  The runner is not emailed; the organizer sees the neutral `EXPIRED` badge on
  the registrants screen, and the detail modal says when it happened and what
  went back.
- `src/data/mockEvents.ts` is legacy and is no longer the source for real pages.
- A **Prisma schema change needs the dev server restarted** before it takes
  effect: `next dev` bundles the generated client, so a running server keeps
  the pre-migration data model and rejects a write to a brand-new column with
  a 500 even though the column exists. `npx prisma generate` alone is not
  enough, and Next 16 refuses to start a second `next dev` on the same
  directory, so there is no way around restarting the one that is running.
- **`/` and `/events` are prerendered at build time** (they take no dynamic
  API), so on Vercel their cards — including the FULL, PAUSED and `Opens …`
  badges — are a snapshot of the last deploy rather than live. This predates
  the badges and applies equally to a newly published event; the event page,
  the register page and both checkout routes are dynamic and always current, so
  nothing can be *registered* against a stale listing. Making those two pages
  dynamic is a decision that has not been taken yet.

  **A scheduled opening makes this sharper than the other badges do**, because
  it is the one closure that lifts on a clock rather than on someone pressing
  something: after the opening passes, those two listings keep showing
  `Opens Oct 5` and a *View Event* button until the next deploy, while the
  event page beside them is already open and taking sign-ups. Nobody is
  wrongly charged or wrongly turned away — the dynamic pages and both checkout
  routes decide for themselves — but the card under-sells a race that is live.
  The fix is either `export const revalidate = <seconds>` on the two listings
  or making them dynamic, and it is the owner's call because both spend Vercel
  invocations the current build does not.

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
