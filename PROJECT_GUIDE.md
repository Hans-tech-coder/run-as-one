# Run As One — Project Guide

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

Run As One is a **running-event registration and results platform for the
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
    admin/                  # organizer portal (AdminShell, Admin.css, Auth.css,
                            #   DashboardShell — the frame both dashboards share,
                            #   dashboard-sidebar.ts — the collapsed-rail cookie,
                            #   AdminCardList — what every table becomes below lg,
                            #   AdminCardEdit — an inline edit, as a card holds it,
                            #   AdminTablePager / MobileSortMenu — every table's
                            #   pager and its below-lg Sort chip,
                            #   row-menu-position.ts — where a row's menu opens,
                            #   route-loading-shape.ts — what each page's wait
                            #   draws, phone and desktop, bare-paths.ts — the
                            #   pages under /admin with no sidebar,
                            #   AuthRouteLoading — their wait, FilterChip — a
                            #   chip that finds)
    superadmin/             # platform-owner portal (SuperAdminShell, a thin
                            #   wrapper over admin/DashboardShell)
    api/                    # all route handlers — see §6
  components/               # public-site components (Navbar, Footer, EventGrid,
                            #   StatusPanel, RunAsOneLogo, HeroArcBackground,
                            #   PublicRouteLoading…)
  components/ui/            # cross-app primitives: AlertProvider, AlertModal, Toast,
                            #   Skeleton, LinkPending, FieldError, table,
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
- **StaffAccount / StaffMembership / EventAssignment** — the people who work
  inside an organizer besides its owner (`STAFF_ACCESS_PLAN.md`). **`Organizer`
  stays the tenant and its own email and password stay the owner's login**; no
  foreign key was rewritten to add these. A `StaffAccount` is the person (email,
  password — null until an invitation is accepted — `status`
  `INVITED`/`ACTIVE`/`SUSPENDED`, TOTP columns for Batch 4, and
  `sessionsValidFrom`, the instant before which every session of theirs is dead).
  A `StaffMembership` joins that person to one organizer with a role (`ADMIN`
  reaches every event, `STAFF` only what is assigned), so one email serves a
  freelancer who works several organizers' races. An `EventAssignment` gives a
  STAFF membership one event and a role on it (`EVENT_MANAGER`, `VALIDATOR`,
  `ENCODER`, `VIEWER`). **`/admin/team` creates these rows** (§6). A membership
  also carries `suspendedAt`/`suspendedById`: **suspension is per membership,
  not on the account**, because one owner suspending a freelance timer must not
  lock them out of another organizer's race — `StaffAccount.status` stays the
  platform-wide switch and nothing on the team screen touches it. A member's
  state (Active / Invited / Invite Expired / Suspended) is **derived** from
  `acceptedAt`, `suspendedAt` and `inviteExpiresAt` by `memberState` (§5),
  never stored. The invite token is kept only as its sha256
  (`inviteTokenHash`); the token itself exists only in the email.
- **AuditLog** — the append-only trail: who (`actorKind`, `actorId`, and a
  **snapshotted** `actorName`/`actorEmail`), in which organizer and event, did
  what (`action`, a dotted verb from `AUDIT_ACTIONS`), to what (`entityType`,
  `entityId`), in one pre-rendered `summary` sentence, with `changes` holding
  only the fields that moved. **No relations on purpose**, so a row outlives the
  event, runner and account it names. Nothing in the app updates or deletes one.
  Roughly 300–500 bytes a row. See `audit.ts` (§5). **Read back** by
  `/admin/activity` and by the registrant modal's *Validated by* line, both
  through `activity-store.ts` (§5) — no index was added for either.
- **Soft removal** — `Runner.deletedAt`/`deletedById` (and the same pair on
  `Registration`, which nothing sets yet). Removing a runner from the
  registrants screen no longer deletes the row; it stamps these, and **every
  read a person sees filters `deletedAt: null`** — the registrants screen, the
  slot count in `registration-gate.ts`, the dashboard head count, the
  abandoned-checkout sweep, promotion runner counts, the club tally, both
  emails and the register page's resume. A new read of runners must filter too.
  Deleting a whole **event** is still a hard delete (owner only, and recorded).

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
| `discount.ts` | **What a promo code is worth, and why it cannot be used.** `PromoCode` rows existed for a long time and were never wired into checkout — an organizer could create a code and nothing could spend it. This is the rule that makes one real, and it lives here because *four* screens have to agree about it: both wizards price the code as the runner types, and both checkout routes recompute it from the database and are the last word. Two kinds — **`CATEGORY_PRICE`** (a second price list for one race: each repriced category takes off `Category.price` less the promotion's price, capped at what that runner is actually paying, so a repriced 10K never gives away the extra a 3XL singlet costs) and **`BUY_X_GET_Y`** (whole groups only, **one group per registration** — `promoGroupSize` is `buy + get`, the largest order it covers, so twelve runners on one order still get one free and a group of seven is six on this receipt and one on another — and the **cheapest** runners are the free ones). There were four; the percentage, the flat amount and the free delivery went together, because they are what a general-purpose store needs and this is not a store — an organizer thinks in prices per distance. **Fees are never discounted**: the platform fee is the platform's and the transaction fee is PayMongo's. Every branch is capped at what it discounts, so a promotion that reprices a category below zero takes off no more than that runner's own entry. **`categoryPriceSavings` is the one walk through the order** that a repricing promotion produces everything from — the money off, the price printed on each runner's line (`chargedRunnerPrice`, taking an index rather than a category, since two runners on the same distance can be charged differently) and the seats claimed at checkout (`categorySeatsClaimed`). **A short promotion is split rather than refused**: a group of three on a 10K with two seats left pays the promotion price for two and the full price for the third, and the earlier runners get them, because every runner in one category saves the same amount so the order changes only which cards say the promotion price. **A sale is a price, not a deduction** (`AppliedDiscount.pricedIn`, and `isPricedIn` for the four screens that render a cost breakdown). A `CATEGORY_PRICE` promotion puts its own price on each runner's line in the order summary and shows no discount row at all, because that is how a sale reads everywhere else and quoting ₱1,200 with a ₱300 credit under it invites the runner to check arithmetic nobody asked for; every other kind leaves the goods at list and shows itself as a line off the order, so a typed code can be seen doing its job. **The money is identical either way** — `total = subtotal + fees − amount` — and the stored row keeps the list `subtotal` beside the `discountAmount`, so only the rendering differs. Both wizards' summaries and both emails read the same flag, and the email reads it from `Registration.discountType` rather than from the promotion, which may be gone by then. **`categorySalePrices` is the one place that decides which prices get struck through** — automatic, currently-running `CATEGORY_PRICE` promotions only, cheapest wins where two reprice the same option, and a price at or above the category's own is ignored rather than drawn through itself. The event page, the wizard's picker and its poster lightbox all read it and all render through `components/CategoryPrice.tsx`, so the two numbers a runner is shown cannot differ between the page that advertises the race and the form that sells it. `promoCodeError` returns one sentence naming the code and the condition it failed — "SUMMER10 gives you 1 free when 5 register, so it needs 6 runners on one order — you have 3" — and the wizards and the routes return the identical string, because a code accepted on screen and refused by the server would be worse than no code box. **A promotion may need no code at all** (`automatic`): an early bird is a discount tied to a date, and a group deal is one a group discovers by being a group — neither should depend on having been told a password. A **discounted category price is automatic by construction**: it is drawn onto the option a runner is choosing between, and a struck-through price nobody can claim without a code they were never given would be the event page lying about what the race costs. `bestDiscount` weighs every qualifying promotion, automatic and typed alike, and returns the largest; stacking is refused because two promotions at once is a number the organizer never agreed to, and a tie goes to the automatic one so a typed voucher stays unspent. A good code that merely lost is not an error — `outshoneByMessage` says so in a neutral voice. `freeSlotOffer` is what makes buy-X-get-Y claimable: the promotion pays nothing at five runners, so step 1 offers the sixth rather than leaving a group of five looking at a discount that does nothing. It goes quiet again at `buy + get`, where the group is whole and there is nothing left to offer — that is also where step 1 stops accepting runners, disabling *Add Another Runner* and printing `register/GroupLimitNotice.tsx` beside it, which names the promotion, gives the number and says the rest of the group registers separately. `promoConditions` says the size as a fact rather than a floor ("6 runners on one order", not "6+"), for the same reason. **`promoStatus` is the one answer to "is this running?"** — ACTIVE, PAUSED, SCHEDULED, EXPIRED or USED_UP, in that order of precedence, since the switch an organizer just flipped is the answer they will look for and a promotion that has been fully claimed is finished even with its window still open. The marketing table's badge, the event page's offers block, the "Running Now" metric and `promoCodeError` all read it, so a badge saying EXPIRED while the checkout still honours the code is not a state this app can reach. **`promoEndingSoon` is the one thing those five states cannot say**: a promotion that is running now and stops this week. Within `PROMO_ENDING_SOON_DAYS` (3) of its last Manila day it returns "Ends today" / "Ends tomorrow" / "Ends in 3 days", which the marketing table prints in amber under the Active badge and the event edit screen's promotions panel repeats — otherwise the first an organizer hears of the end is the word EXPIRED, by which point extending it is no longer a decision they can make in time. Counted in **calendar days**, not hours, because that is what the organizer typed: a code ending "on the 30th" ends today on the 30th however many hours are left of it. In-app only; an email about it would spend a recipient against a free-tier ceiling of 100 a day. `freeRunnerIndexes` says which cards wear the FREE badge, breaking ties towards the **last** runner, because a group of six at one price plainly means the sixth. **The group offer and the group limit read only a running promotion**: both wizards pick the buy-X-get-Y they offer and stop at through `promoStatus`, so a paused, expired or used-up group deal neither caps a group at six nor promises a free sixth runner the checkout will not give. `redeemPromoCode` is the gate, and mirrors `reserveSlots`: it locks the row `FOR UPDATE` inside the write transaction before incrementing, since a usage cap checked before the write is one two simultaneous orders both pass. Its refusals end on what to do next, and that depends on `automatic` (passed by both routes): a typed code says *remove it and try again*, an automatic promotion says *reload the page*, because nobody can remove one. **A code is spent when the order is placed, not when it is paid** — the same moment a slot is taken, or one voucher could be attached to any number of pending orders. Deliberately free of Prisma, so the wizards can import it. |
| `promo-store.ts` | Reading promo codes out of the database, kept apart from `discount.ts` for the same reason `running-community-store.ts` is kept apart from `running-community.ts`: the rule is imported by client components and must not drag Prisma into the browser bundle. `findPromoCode` scopes a lookup to the event's organizer and then to the event (or to a code that names none) and **skips automatic promotions, which are not codes**; `automaticPromosFor` is the query the event page and both wizards run on load; **`acceptsPromoCodes` decides whether the wizards show the promo code box at all** — true only when this event has a typed code (a shared code or an unclaimed voucher, in the same scope `findPromoCode` searches) whose `promoStatus` is ACTIVE right now, so a registrant is never shown a box nobody could type anything useful into. The database narrows the rows (not automatic, not paused, inside its window, order cap not spent) and `promoStatus` has the last word, since a repricing promotion's per-category seats are a rule better not re-expressed as a `where`; `resolveDiscount` weighs the automatic promotions and any typed code together and is what both checkout routes call instead of reading a discount off the request; `eventPromotions` is the same scope again for the **read-only panel on the event's own edit screen** — this organizer's promotions that name this event or name none — with a voucher batch collapsed into one entry and its counts summed, exactly as the marketing table collapses it. |
| `components/PromoHighlights.tsx` | The offers on a race, on the event page. Only **automatic** promotions appear: a code is the organizer's to publish where they choose, and printing every code on a public page would hand out the single-use vouchers meant for named invitees. It reads `describePromo` and `promoConditions`, the same two functions the wizard and the admin table read, so what this page promises and what the order summary applies cannot be worded differently. A repricing promotion also names the options it reprices and both their prices, since "special price on 2 categories" without saying which two sends a runner hunting for the difference. |
| `promo-redemptions.ts` | **What a promotion actually cost, and which orders spent it.** "Times Redeemed: 12" says how many, never how much, and an organizer deciding whether to run a promotion again is asking the second question. The peso column on the marketing table, the *Given Away* metric card and the list behind *View redemptions* all read from here, so a column saying ₱4,500 and a modal adding up to ₱5,200 is not a state this app can reach. **Attribution is by the code text, scoped to the organizer's own events** — `Registration.promoCode` is a snapshot string rather than a relation (kept that way so a deleted promotion cannot rewrite a receipt), so there is no id to join on and the text is all there is. Two accepted consequences: a promotion deleted and recreated under the same code inherits its own history, and an **automatic** promotion is attributed the same way, since checkout snapshots its *name* into that column. Scoping is done in the query, not after it: the code text is not proof of ownership, and two organizers may each run an `EARLYBIRD`. **Money is counted on `PAID` rows only, redemptions on placement** — a code is spent the moment the order is created, the same instant a slot is taken, so an abandoned online checkout leaves a redemption with no money behind it; counting it would overstate the cost of every promotion with an abandoned checkout in its past. Both numbers are shown rather than one being quietly preferred (the Used column grows a second line, `12 redeemed · 9 paid`, exactly when they disagree). `spendByCode` is **one grouped query for the whole screen**, not one per row, because a page with a voucher batch on it would otherwise make two hundred round trips; `redemptionsFor` takes *every* code of the promotion, since a batch is one promotion, and stops at `MAX_REDEMPTIONS_LISTED` (500) saying so rather than showing part of the truth silently. Server-only, like `promo-store.ts` and for the same reason. |
| `promo-input.ts` | **What the marketing form is allowed to say about a promotion.** Turning the posted fields into the columns they become, and refusing them by name when they cannot be — a buy-X-get-Y with no X, an end date before its start, a category priced at or above what it already costs. A promotion's window is simply its dates: `usageLimit` is written as null here whatever was posted, so an edit clears any cap a promotion carried from before the form stopped offering one, and the create route's batch branch is the only thing that sets it (to 1, which is what makes a voucher single-use). A `CATEGORY_PRICE` promotion is checked four ways, each refused under the box that caused it: it names one race, it needs no code, it reprices at least one category, and every price is below the category's own. It lives apart from the routes because *two* of them need exactly this check: creating a promotion and editing one, and a create route that caught a category priced above its own list while an edit route let it through would be worse than neither checking. It also owns the Manila day boundaries: a window that starts on the 1st starts at 00:00 Manila and one that ends on the 30th runs to 23:59 of it, because `new Date('2026-03-30')` is midnight **UTC**, eight hours early. |
| `voucher-codes.ts` | Generating a batch of single-use vouchers. The alphabet drops every character that can be misread off a printed card — no O against 0, no I or L against 1, no S against 5, no U against V — and codes are **random rather than sequential**, because SUMMER-001…200 hands anyone who receives one the other 199. `MAX_VOUCHER_BATCH` (500) is a ceiling on the free Postgres tier as much as on the promotion. Web Crypto, not `Math.random`. |
| `rate-limit.ts` | **Throttling the routes anyone on the internet can call**, and being honest about how far that reaches. A sliding window in one instance's memory, keyed by the first hop of `x-forwarded-for` — Vercel runs however many instances it likes and they share nothing, so this stops a naive script hammering one endpoint from one address and does **not** stop a distributed one. The honest fix is a shared counter in Redis, and there is no Redis here: adding one for a promo-code endpoint would cost more monthly than the abuse it prevents (§2). `PROMO_LOOKUP_RULE` is 20 tries a minute, deliberately far above anything a person does by hand, because of what a refusal looks like — `promos/lookup` answers a throttled caller **exactly as it answers a code we do not have**, so a real runner who somehow hit the wall would be told their code does not exist, and being wrong in that direction is worse than letting a slow script keep guessing. The map of callers is swept, and if still full cleared, past `MAX_TRACKED_KEYS` (5,000): forgetting who has been asking is the safe direction to fail, since the alternative is a route that refuses everyone because its own bookkeeping filled up. The window lives on `globalThis` for the same reason the Prisma client does — `next dev` re-evaluates modules on every edit. `FEEDBACK_RULE` is 5 messages every 10 minutes, and it is the counter-example on refusals: that route **writes** a row rather than reading one, and nothing about "you have sent five messages" is worth hiding, so it answers 429 with a sentence a person can act on instead of disguising the refusal as a miss. |
| `event-slug.ts` | Public event URLs. `slugifyEventTitle` → `uniqueEventSlug` on write; `eventByParam` matches slug **or** legacy cuid on read, and `canonicalEventPath` redirects old cuid links to the slug. **`registerPath(event, category?)`** spells the wizard's address, and with a category adds `?category=` — the option's **name, slugged** (`?category=10k`), because that link gets pasted into group chats, falling back to its id only when two options on the race slug alike. `categoryFromParam` reads it back (id first, then a slug exactly one option answers to) and finds nothing for a stale link rather than guessing. |
| `category-order.ts` | **The order an event's categories are listed in, everywhere.** `CATEGORY_ORDER` (`sortOrder`, then `id`) goes on every read of an event's categories that a person sees — the edit form's GET and PUT response, the create response, the events table, the event page, the wizard, the admin results screen, the winners board, the marketing form's price list and `promo-input.ts`. Nothing used to order them, so they came back in Postgres's physical row order, and an UPDATE writes the new row version at the end of the table: every save of the edit form moved the options it touched to the bottom, and a race's first category came back fourth. The create route numbers them by their position in the form; the edit route leaves `sortOrder` out of its update and gives an option added in that edit the next number after the event's highest. Rows that existed before the column were backfilled from their cuids, which sort in creation order. |
| `feedback.ts` | **What a piece of feedback is, and what the app will accept as one.** The three kinds (`ISSUE` | `SUGGESTION` | `FEATURE`) with `asFeedbackKind` guarding them at the API door, the two triage states with `asFeedbackStatus`, and `FEEDBACK_KIND_COPY` — the label, the blurb and **the per-kind placeholder**, which is the point of asking the kind first: the same empty box under "tell us anything" gets "the site is slow", and under "what were you doing, and what happened instead?" gets a page, a step and a device. The limits live here too (`MIN_FEEDBACK_MESSAGE` is 20 characters, so the inbox does not fill with rows nobody can act on; `MAX_FEEDBACK_MESSAGE` is what bounds a row's storage) and are enforced **twice** — in the form so the common case costs no round trip, and in the route, which is the last word. `asSitePath` is the guard on the `?from=` that names where a sender came from: it arrives in a query string, so a protocol-relative `//evil.example` is refused and only a single leading slash passes. `looksLikeEmail` is deliberately shallow — the address is optional and only ever used by a person clicking Reply, so a clever regex rejecting a valid address costs more than a bounced message does — and it now defers to `email-address.ts`, which holds that same shape for the whole app. |
| `event-type.ts` | `RACE` vs `FUN_RUN`. `asEventType` guards untrusted input (defaults to `RACE`); `sellsPackages(event)` is the branch the forms and wizards use. |
| `registration-form.ts` | `ONLINE` vs `BANK_TRANSFER` checkout. `asRegistrationForm` defaults to `ONLINE`; `offersBankTransfer`. |
| `shirt-size.ts` | The size chart, whether a category needs a size at all, and the 4XL-and-up upcharge. `subtotalWithUpcharge` is the priced truth. `shouldAskShirtSize(categories, categoryId)` decides whether the wizards show the field and whether validation requires it: the chosen category decides once one is picked, and before then the field is already visible when **every** option the event sells includes something to wear. It hides up front only for an event that also sells an option with nothing to wear (the Tarlac band-only package), where the answer is genuinely undecided. |
| `app/events/[slug]/register/delivery.ts` | Race-kit delivery tiers — the **money** only. A fee of `0` means **not offered**. `deliveryTiers`, `deliveryFeeFor`. Shared by both wizards so they can never charge differently. The zone codes, their guard and their labels moved to `registration-codes.ts`; this module re-exports them. |
| `app/events/[slug]/register/validation.ts` | What step 1 requires. Returns *which* fields are wrong, driving the red states, the summary dialog, and where the caret lands. Missing answers are most of it, and there are two exceptions, each named rather than reported as blank: a phone number that is present but the wrong length for its country ("Mobile number must be 10 digits"), and an **email address that is not one** ("Enter a valid email address, like juan@example.com", the rule from `email-address.ts`). The field is `type="email"`, which is no help here — a browser only runs that check on a form *submit*, and step 1 advances through a click handler. |
| `app/events/[slug]/register/useStepReveal.ts` | **What a change of step does to the page.** Step 1 is long and every later step is short, so leaving the scroll where Next was pressed dropped the runner past the end of the new step, looking at empty space and the footer. Both wizards call it with `step`, attach `panelRef` to the form column and `headingRef` (with `tabIndex={-1}`) to the step heading. On every change of step — Next, Back, or the jump to step 4 — it scrolls the **form column**, not the page, back under the navbar (below 1024px the summary sits above the form, so y=0 would land on the summary), **only ever upwards**, instantly under reduced motion; then moves focus to the heading so a screen reader announces the new step instead of losing focus with the unmounted button. It stops at the column's `scroll-margin-top`, `--wizard-top` in `RegistrationWizard.css` — the same number the sticky summary pins at. The step a runner lands on is never scrolled. |
| `consent-waiver.ts` | The liability/media/data-privacy waiver. Organizers may override it per event; the default wording is supplied here. **Never present an empty waiver.** |
| `consent-signature.ts` | **Who signed the waiver.** The tick records that a box was clicked; the typed signature records a person, which is the thing an organizer can hold up afterwards. **Whatever the runner types is accepted** — the only rule is that the box is not blank. It used to demand a match against one of the runners on the order, and that stopped honest people at the last step of the form: middle initials, married names, nicknames, and characters their keyboard renders differently all read as mismatches, and the runners it inconvenienced were never the problem. `normalizeSignature` now only collapses whitespace, so a box holding nothing but spaces still counts as empty. `consentSignatureError` has one message left, and it names its failure: the box is empty. Both wizards and both checkout routes import it, because a signature accepted on screen and refused by the server would be worse than the checkbox alone. |
| `email-address.ts` | **What counts as an email address, in one place.** A runner's address is the only way an order ever reaches them again, and one with no `@` in it makes every email about that order silent: Resend refuses the send outright, `lastEmailError` records a reason nobody reads for days, and the runner believes they are registered because the wizard said so. That is not hypothetical — `roxymendoza025gmail.com` reached a live order. `normalizeEmailAddress` **trims and nothing else** (a pasted trailing space stops a send on its own; casing is left alone because the local part is case-sensitive on some mail servers), `looksLikeEmailAddress` / `emailAddressError` / `invalidEmailMessage` are the rule and its wording, and `participantEmailError` is what both checkout routes ask of the runners they were handed — naming the runner ("Runner 2: enter a valid email address…") only when there is more than one. The shape is `something@something.something` and deliberately no more: a regex chasing RFC 5322 rejects valid mail more often than it catches bad, and only the mail server truly knows. Every door imports it — both wizards' check, both checkout routes, the runner PUT, staff invitations, the organizer's profile and the feedback form — because a rule enforced in one of them is a rule the other can still write past. |
| `running-community.ts` + `running-community-store.ts` | Club names, `INDEPENDENT RUNNER`, and the pending/approved flow for runner write-ins. `asRunnerCommunity` is what a runner's club is stored as: normalized, then **uppercased** like every other registrant field (see `text-case.ts`), with a blank answer landing on `INDEPENDENT RUNNER`. The picker snaps a typed club to an approved entry's own casing *before* that, so matching is still on the list's terms. |
| `inclusions.ts` | Free text (one item per line) ⇄ stored string[] for what a category includes. |
| `text-case.ts` | **Registrant text is stored UPPERCASE** — first and last name, gender, emergency contact name, delivery address, medical conditions, running community. The stored value, not a CSS transform: the same runner is read back by the admin table, the runner modal, the CSV export, both emails and the e-certificate, and a `text-transform` fixes exactly one of those. `upperCaseAsTyped` runs in both wizards and the admin's runner-edit modal (it does not trim, or a space between two given names would vanish as it is typed); `upperCaseForStorage` / `optionalUpperCaseForStorage` run in both checkout routes and the runner PUT, because a tab left open can POST past the UI. **Email is never uppercased** — the local part is case-sensitive on some mail servers, and everything else about an address (trimming, and whether it is one at all) belongs to `email-address.ts` — and neither are passwords, phone numbers, blob URLs, or most of what an organizer types about their own event. The **category / package name is the exception** and *is* uppercased (in `EventOptionsPanel` as it is typed, and in both admin event routes on the write): it is printed beside runner data in the registrants table, the export and the emails, so it has to match them. A closed picker carries the casing in its own options (`GenderField` offers `MALE`/`FEMALE`), and a **sample** placeholder is uppercase too — `JUAN`, `DELA CRUZ` — so the hint matches what will appear in the box. A placeholder that *describes the shape of the answer* counts as a sample and is uppercased too — the delivery address reads "HOUSE/UNIT NO., STREET, BARANGAY, CITY/MUNICIPALITY, PROVINCE, ZIP CODE". Only a placeholder that tells the runner what to **do** stays in sentence case: "Select Gender", "Select or type a size", the club picker's "Type to search, or add your own", and the email address. Where such an instruction **quotes a sample**, that quoted part alone is uppercased — medical conditions reads "e.g. ASTHMA, ALLERGIES (Leave blank if none)".  **`normalizeAccountEmail` is the one place an email *is* cased**, and it is the opposite direction: an organizer's sign-in address is lowercased on the way in by `auth/login`, `auth/register` and `admin/profile`. The rule above is about a *runner's* email — contact data on an order, never used to find anything, so it is stored exactly as typed. An organizer's is the identifier the account is looked up by, and Postgres compares exactly, so one capital used to mean "Invalid credentials" for a correct password. |
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
| `auth.ts` / `jwt.ts` | bcrypt hashing and the `admin_token` httpOnly cookie (1 day). **The session carries typed claims** — `sub` (the person), `kind` (`OWNER` \| `STAFF` \| `SUPER_ADMIN`), `orgId` (the tenant), `role`, `name`, `email` — built by `organizerSessionClaims` / `staffSessionClaims` in `actor.ts`. A token issued before these claims existed (`{ id, email, name, role }`) still verifies and reads as that Organizer's owner, so the deploy that introduced them signed nobody out. `getAuthCookie()` returns the raw claims and **only the super admin's own routes call it**; every admin surface goes through `actor.ts`. |
| `actor.ts` | **Who is acting, and what they may reach — the one rule: authorisation scopes by `orgId`, attribution records the actor's `id`.** For an owner the two are the same id, which is why rewiring every admin surface onto this changed nothing until staff exist. `getActor()` is for route handlers (they answer null with their own 401); `requireActor()` is for server pages (it redirects to `/admin/login`). An owner's actor is read from the token alone, as the routes always did; a **staff** actor is checked against the record on every request — membership accepted, account `ACTIVE`, organizer not pending or suspended, and the token issued after `sessionsValidFrom` — because a suspension that waits a day for a JWT to expire is not one. **`can(actor, permission, { organizerId, eventId })`** is the check before acting: organizer-wide roles read the matrix directly, a STAFF membership needs an assignment on that event, and a super admin reaches another organizer only for `SUPER_ADMIN_REACH`. `canSomewhere` is for screens about no single race (marketing, the image uploader). **`reachableEvents(actor, permission)`** is the `where` every list page reads events through — `{ organizerId }` for an owner, only the assigned ids for STAFF. A single-event page reads `{ id, organizerId: actor.orgId }` and then asks `can()`, answering a refusal with the **same "Event not found."** as a missing id. `findAccountByEmail` is the one lookup `auth/login`, `auth/register` and `admin/profile` make across **both** account tables (Organizer wins a tie), since the database cannot keep an address unique across two tables. |
| `permissions.ts` | **The permission matrix, as data** (`STAFF_ACCESS_PLAN.md` §3). Permissions are verbs (`registration:validate`, `promo:manage`, `event:delete`…); **no route compares a role string**. `OWNER`/`ADMIN` are organizer-wide; `EVENT_MANAGER`/`VALIDATOR`/`ENCODER`/`VIEWER` are held per event. `VALIDATOR` can settle an order and deliberately cannot edit or delete one. `SUPER_ADMIN_REACH` is the super admin's reach into another organizer — view, validate, remark, email, proof — exactly what the status, email and proof routes allowed before. `asMembershipRole`/`asEventRole` guard the two role columns. Prisma-free, so the team screen can render the matrix it enforces. |
| `audit.ts` | **The trail — "sino ang gumawa nito".** `recordAudit(tx, actor, entry \| entries)` takes the **transaction client**, so the log row and the change commit or fail together; every admin write passes its own transaction, and the three things with no write to ride along (a proof opened, a registrant export, a sign-in attempt) pass the plain client. The actor's name and email are **snapshotted**; the IP and user agent come from the request. `changedFields(before, after, fields, redact)` records only what moved, and records `'changed'` instead of a value for a redacted field, a non-scalar and any string over 120 characters. **`SENSITIVE_RUNNER_FIELDS`** (birthdate, emergency contact name and phone, medical conditions) never have their values logged. `AUDIT_ACTIONS` is the closed vocabulary — add a verb there before using it. Recorded today: sign-ins and failed sign-ins (not for an address with no account, which has no organizer to belong to), profile and password changes, event create / edit / pause / resume / schedule / delete, results uploads, registration status and remarks changes, a manual email marked sent, runner edits and removals (one row per runner, bulk included), proof views, registrant exports, and promotion create / edit / pause / resume / delete. It is read back through `activity.ts` / `activity-store.ts`, never here. |
| `activity.ts` | **Reading the trail back** — Prisma-free and headers-free, so client components import it. `ACTION_LABELS` and `ACTION_GROUP` are both `Record<AuditAction, …>`, so **a verb added to `AUDIT_ACTIONS` without a label and a group fails the build**. `ACTIVITY_GROUPS` are the Activity filter's shelves (Payments, Runners, **Personal data** — proofs opened and exports, the Data Privacy Act question — Events, Promotions, Team, Sign-ins). **The screen's filters are the URL**: `readActivityFilters` guards every param (ids, a verb or `group:<key>`, a range of `all`/`today`/`7d`/`30d`/`custom` with Manila `from`/`to`, a search, page, size) and refuses an end date before its start under the To box; `activityQuery` writes them back leaving out defaults; `activityWindow` turns a range into Manila-midnight instants ("last 7 days" is today and the six before). **`asOf` pins a reading** so entries recorded while someone pages wait in a "newer entries" count. Display: `formatTrailTime` / `formatTrailInstant` / `formatTrailDayHeading` (Today · Sep 15), `describeChanges` (a redacted value says the trail does not keep it), `describeDevice` (Chrome on Android). **`statusProvenance`** is the registrant modal's "Validated by Ana Cruz · Sep 13, 2026, 4:02 PM" — it names a person only when the latest recorded change *to* a status matches the status the order holds now; otherwise an online PAID reads "Paid online through PayMongo" and anything else "not on record, before the trail began". `orderActivityPath` is the modal's link to one order's history. |
| `activity-store.ts` | The trail's queries, server-only. **Every read is scoped to one `organizerId`** — a super admin's settlement is written into that organizer's trail, so an owner reads everything done to their data and nothing else. `activityWhere` builds the filters' `where` (search is a case-insensitive `contains` on `summary`, which names order references, runners, events and promotions); `activityPeople` is the Person filter, **read from the trail rather than the team** so a removed member's actions stay findable, one entry per actor id under their latest name; `latestStatusChanges(orgId, eventId)` is one query for the registrants screen's provenance. |
| `signed-in-user.ts` | The name and initial the admin sidebars show — read from the record, not the token, so a rename is never stale. It names the **person**: an owner's Organizer name, or a staff member's own StaffAccount name. It also carries the role line (`Owner`, or `Admin · ORGANIZER`), **which sidebar items this person has any reason to open** (`nav.marketing` from `canSomewhere(promo:view)`, `nav.team` from `team:manage`, `nav.activity` from `activity:view`) and, for a staff member with more than one active membership, the organizers the sidebar's switcher offers. Hiding a link is manners; the pages still check. |
| `team.ts` | **The rules of an organizer's team**, free of Prisma and crypto so the team form and the routes run the same checks and word refusals identically. `memberState` derives Active / Invited / Invite Expired / Suspended from the membership's timestamps (with `MEMBER_STATE_LABELS`/`TONES` for the badge); `readInvitee` (name, lowercased email) and `readAccess` (role plus event assignments, checked against the organizer's own event ids — **a STAFF membership needs at least one event**, and a duplicate or foreign event is refused per row under `assignmentField(i, part)`); `newPasswordErrors`; `describeAccess` for trail summaries; `MIN_PASSWORD_LENGTH` (shared with the settings form and the password route) and `INVITE_TTL_DAYS` = 7. |
| `team-invite.ts` | **Invitation links.** `newInvitation()` makes 32 random bytes and keeps only their sha256 (`inviteTokenHash`) — the token itself is only ever in the email; `findOpenInvitation(token)` returns the membership only if the token is well-formed, matches, is unaccepted and unexpired, and every failure reads the same; `inviteOrigin(request)` names `SITE_URL` in production and the request's own origin elsewhere, so a localhost invitation links back to the database it was written into; `sendInvitation` renders `staffInvitationEmail` (`email.ts`) and, outside production only, prints the link to the server console so the flow can be tried without email. |
| `actor.ts` (team additions) | `canManageMember(actor, role)` — `team:manage` **and** `GRANTABLE_ROLES` (`permissions.ts`: an OWNER grants ADMIN or STAFF, an ADMIN only STAFF, so an admin can neither make nor touch another admin); `grantableRoles(actor)` for the picker; `activeMembershipWhere(staffId)` — accepted, not suspended, organizer active — **the one definition sign-in, the organizer switcher and the sidebar all read**, so none can offer an organizer another would refuse. `getActor()` now also refuses a suspended membership. `permissions.ts` gained `ROLE_LABELS`, `ROLE_HINTS`, `PERMISSION_LABELS` and `MATRIX_ROLES`, which is what the team screen's role table is drawn from. |
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
Plus `/new` and `/[id]/edit` — below `sm` both keep Cancel and Save in a bar
stuck to the foot of the screen, below `lg` an uploaded image's Remove is a bar
under it rather than a hover overlay, and the certificate preview comes above
its sliders; the edit screen ends with a **read-only
Promotions panel**: what a runner registering for this race can be given, its status and
its conditions, with a link through to the marketing screen. Read-only on
purpose — one screen owns promotions, and a second place to edit them is a
second place for them to drift) · `/admin/events/[id]/registrants` (**the list is
in registration order, oldest first, and nothing an organizer does to a row ever
moves it.** Both levels of the fetch say so — `orderBy: { createdAt: 'asc' }` on
the registrations and `orderBy: { runnerNo: 'asc' }` on the runners inside each
one. Neither had an ordering before, and without one Postgres returns rows in
whatever order it finds them on disk: every `UPDATE` rewrites its row at the end
of the heap, so validating a payment or saving a remark silently reshuffled the
table, and a group's `-2` could print above its `-1`. The **No.** column is the
registrant's own number, assigned on the server off that order (`regNo`) rather
than being the row's position on screen — filter down to the unpaid orders and
the numbers still read 3, 7, 12, which says who those people are, where a row
index renumbered everyone 1, 2, 3 and said nothing; how many rows are in view is
what the footer's "1-25 of 143" is for. It is a reading of the list as it stands
and **not a bib number** — cancel an early order and everyone behind it shifts up
— so anything that must survive that needs a column of its own.
A validator's queue is therefore a **filter, never a sort**: the *Needs
Validation* toolbar chip collects the rows that are `PENDING` **and** bank
transfer (`needsValidation`, the same pair that decides whether the detail modal
and the lightbox offer a Validate button — an online PENDING is an abandoned
checkout `pending-expiry.ts` sweeps on its own, with nothing for a person to do),
and it wears the amber of the PENDING badge it collects. Sorting those to the top
instead would pull a row out from under the cursor the moment it was validated,
costing the admin their place in the list and the sight of the badge turning
green where they clicked — the same reason the super admin's feedback screen
*finds* unread messages rather than sorting them up. The Status column stays
sortable for anyone who wants to group by it deliberately.
Rows whose email
never went out carry an **Email Unsent** badge, an *Unsent Email* toolbar toggle
lists exactly those, and a mail icon opens the manual-send modal; the two chips
narrow the same list together. **`?search=`
prefills the search box**, which is how the marketing screen's redemptions panel
links straight to one order. The **detail modal has two doors** — the eye beside
the Reference and *View Details* at the top of the row's actions menu — because
an organizer who has already opened the menu to edit or validate should not have
to close it to read the order first; both open the same modal, and the menu's
entry looks the runner up in the live list rather than carrying a captured row,
so it never shows a stale copy. **Below `lg` the list is cards** (Mobile
Batch 3): below `sm` the Category, Logistics and Payment chips fold into one
*Filters* chip whose sheet holds all three (the queue chips stay), selecting
rows raises a bulk bar at the foot of the screen in place of the toolbar's red
chip, and the detail modal is a full-height sheet whose footer carries Proof,
Remarks and Email beside Validate. A card has no eye beside its reference (the
owner's call); its ⋯ menu's *View Details* is the door there. The **proof of payment opens full screen**
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
§5, `race-time.ts`. **Below `lg` the finishers are cards** (Mobile Batch 4):
the name truncating, a Bib chip, then category, gender, both ranks and both
times. Every picker in the uploader is `AdminSelect`, one to a row with its
label above it on a phone. The Header Row picker lists each row's first labels
as small print and spells out the chosen row's columns under the field, and
*Process & Upload Results* sits in a footer that stays on screen) · `/admin/marketing` (promotions: the kind, the event it is scoped to, what it
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
Away**, the last being the Given column added up. **Below `lg` the promotions
are cards** (Mobile Batch 4), with *Redemptions* as the footer's shortcut beside
⋯. A voucher batch opens inside its card through a **"Show N codes"
disclosure** (transitions.dev's accordion, `.t-acc` in `globals.css`), which
reads the same `expanded` state as the table's second row, with a 44px
*Copy all codes*. The create / edit / duplicate form and the Redemptions panel
are on `.admin-modal-panel`, with Save in a footer that stays in reach. Below
`sm` the claim picker and every pair of boxes stack, and each category's price
row becomes one block, with a visible caption on each box) ·
`/admin/settings` (profile + password) · `/admin/team` (**who can sign in to
this organizer, and to what** — `team:manage` only, anyone else gets the
admin's 404. Three metric cards (Active Members, Invitations Waiting — expired
ones included, since each needs a resend — and Suspended) over the admin's one
table: the **owner is always the first row and has no menu**, because the
owner is the Organizer row and not a membership, then everyone else in
invitation order, which never changes under an action. Columns: Member (with a
*You* chip), Role, Events (a STAFF member's races with their role on each),
Status (with *Link expires Sep 20* under a waiting invitation), Last Sign-In.
The row menu (`TeamActionsMenu`) offers Edit Access, then **Resend
Invitation** for someone who has not accepted or **Suspend / Reinstate** for
someone who has, then Remove from Team / Revoke Invitation. A row the viewer
may not manage — the owner, themselves, or an admin when they are only an
admin — shows a dash with a tooltip saying why. **Invite and Edit Access are
one form** on the t-modal frame: name and email (invite only), a Role picker
offering only what `grantableRoles` allows, and for Staff a list of event +
role rows whose pickers never offer an event already chosen in another row.
Every refusal lands under its field. A failed invitation email is an `alert`,
not a toast, because it needs acting on. Under the table, `RolesPanel` draws
the permission matrix straight from `permissions.ts`) · `/admin/activity` (**the
trail read back — "sino ang gumawa nito"**. `activity:view` only (owner and
admin); anyone else gets the admin's 404. **Paged on the server**, unlike every
other admin table: the filters are the URL (`activity.ts`, §5) and one page of
rows crosses the wire. Search (order reference, name, event), then four
labelled `AdminSelect` filters — Person (everyone who appears in the trail,
removed members included), Event, Activity (a group such as *All personal
data*, or one verb) and Dates (Any time, Today, Last 7 days, Last 30 days, or
From / To boxes). **Newest first and never re-sorted**: no sortable headers, no
select or `No.` column, and once a reader pages past the first screen the
reading is pinned (`asOf`), so new entries wait in a blue *N newer entries ·
Show* chip rather than shifting the rows being read. Entries sit under Manila
day headings (*Today · Sep 15*). Columns: Time, Person (name, then *Staff ·
email*), What happened (the verb's label, a failed sign-in as a red badge, and
the entry's sentence), Event (*Deleted event* when the race is gone), and a
Details chevron opening a second row with what changed field by field, the
exact instant, IP address and device. **Below `lg`** the same page is
`AdminCardList` cards per day, the details behind a *Show details* accordion
(`.t-acc`). The pager is `AdminTablePager` at 25 / 50 / 100 a page) ·
`/admin/invite/[token]` (**public**, `noindex`, `referrer: no-referrer` — where
the invitation email lands. It says which organizer and exactly which races and
roles before asking for anything; a new person confirms their name and chooses
a password, **someone who already has an account enters the one they have**.
An unknown, used, expired or malformed link all get the same designed "This
link has expired" page with the way back to sign-in) · `/admin/[...missing]` →
the admin's own 404.

**The sidebar and the events table follow the permission matrix.** Marketing
Tools shows only with `promo:view` somewhere, Team only with `team:manage`,
Activity only with `activity:view`, and
the user block's role line reads **Owner**, or `Admin · ORGANIZER` /
`Staff · ORGANIZER`. A staff member with more than one active membership gets
an **organizer switcher** above it (`OrganizerSwitcher`, the row-menu machinery
opening upward). On `/admin/events`, Create Event needs `event:create`, and each
row's Edit Event, Schedule / Pause Sign-Ups and Delete Event follow
`event:edit` / `event:delete`, decided on the server per row. **The registrants
screen follows it too**: `registrants/page.tsx` builds a `RegistrantPermissions`
object with `can()` and the table offers only what the role holds — Edit
(`registration:edit`), Delete, Delete Selected and the bulk bar's Delete
(`registration:delete`), Validate Payment in the menu, the modal and the
lightbox (`registration:validate`), the Remarks and Email buttons and links
(`registration:remark` / `registration:email`), and the proof block
(`proof:view`). Remarks stay readable to everyone; a phone's modal footer is
hidden when it would hold nothing. The routes still refuse on their own.
**The detail modal says who settled the order**, under its status: "Validated
by Ana Cruz · Sep 13, 2026, 4:02 PM" (`statusProvenance`, §5), updated in place
when somebody validates, and for an owner or admin a *See this order's
activity* link into `/admin/activity` filtered to that event and order
reference.

### Super admin (`/superadmin`)
`/superadmin` dashboard (platform revenue, fees) · `/superadmin/organizers`
(approve, suspend, set commission; **Pending / Approved / Suspended chips** find
accounts by status, Pending with its count — they replaced a Filter button that
had no handler) · `/superadmin/communities` (approve, rename, reject clubs; the
Add a club box and its button share one row from `sm` up) · `/superadmin/feedback` (**the reading end of the public form** —
three metric cards over the messages, newest first. It is the super admin's
screen and not the organizer's for the same reason the club list is: feedback is
about the platform rather than about any one race, and it carries strangers'
email addresses. A message is a paragraph rather than a field, so the table shows
one line of it and **the row opens** into the whole thing — the second-`TableRow`
pattern the marketing screen's voucher batches use — carrying the page and the
browser it came from and a *Reply by email* that opens a `mailto:`. The chips
filter by triage state and by kind; the order never changes under somebody
working down the list, which is why the unread ones are **found** rather than
sorted to the top) · `/superadmin/[...missing]`. **Below `lg` the three lists
are cards** (`AdminCardList`): the admin fee and the club rename become a
full-width edit block on the card (`AdminCardEdit`, §9), and a feedback card
opens its message from a *Read message* button rather than a tap anywhere.

### API (`src/app/api/**/route.ts`)
| Route | Methods | Notes |
| --- | --- | --- |
| `auth/login`, `auth/logout`, `auth/register` | POST | Sets / clears `admin_token`. **The account email is lowercased at the door** on both `login` and `register` (`normalizeAccountEmail`, §5) — and on `admin/profile` PATCH, which is the third place one can be written. Postgres compares text exactly, so until this landed a single capital from a browser autofill found no row and the login answered "Invalid credentials" for a password that was perfectly correct; `register` had the matching gap, where two accounts could exist for one address differing only in case and the unique index would not have stopped them. All three normalise through one helper, because this is precisely a rule two screens must never disagree about. **`login` looks the address up in both account tables** through `findAccountByEmail` (§5): an Organizer row signs in as its owner (or as the super admin), a `StaffAccount` signs in to its earliest-accepted membership of an active organizer (an invitation not yet accepted has no password and is answered like a wrong one). Every sign-in and every failed or refused one is written to the audit trail, except an address that matches no account; `register` and `admin/profile` refuse an address either table already holds |
| `admin/events/[id]/registrants/export` | POST | **The audit entry for a CSV export**, which is built in the browser from rows already on screen. The registrants table calls it fire-and-forget (with `keepalive`) before building the file, so a failed log never costs the organizer their download. Records the row count and whether it was a selection — never who was in it. Answers 204 |
| `checkout` | POST | PayMongo checkout session. Re-derives every amount from the database. |
| `checkout/manual` | POST | Bank transfer: multipart, proof file → private blob. The file is validated by `uploadPrivateProof` under the `proof` kind — JPG, PNG, WEBP, GIF or PDF, 4 MB — which is the same list the wizard's picker offers |
| `webhooks/paymongo` | POST | HMAC-verified; marks the registration `PAID` |
| `upload` | POST | Organizer-only image upload (public store) |
| `admin/events`, `admin/events/[id]` | POST / GET, PUT, PATCH, DELETE | Event CRUD including categories and bank accounts. Categories keep the position they were created in across every `PUT` — see `category-order.ts`. `PATCH` is **when sign-ups are open, on its own** — `{ registrationPaused }` from the menu's pause item, `{ registrationOpensAt }` from its scheduling modal, either or both, so the events table changes one thing without re-posting a form it never rendered; a body carrying neither is refused rather than treated as a no-op. An opening sent on its own also clears `registrationPaused`, or the date would arrive to a paused event. Scoped to the signed-in organizer's own events. `GET` also carries `promotions` — what `eventPromotions` says is running on this race — for the read-only panel at the foot of the edit screen |
| `admin/events/[id]/results/upload` | POST | CSV/XLSX results import; dedupes by bib, computes seconds and the three ranks |
| `admin/registrations/[id]/status` | PATCH | Confirm or reject a manual payment, and write the validator's internal `remarks`. Takes either or both; the status is guarded against a fixed list and the receipt email fires only on the *transition* into `PAID`, so a later remarks-only PATCH cannot send a second receipt. Auth-checked and scoped to the signed-in organizer's own events — **this route had none at all until Batch E**, which made it the one way for anyone on the internet to mark a registration `PAID`. When the status moved, the answer carries `statusChange` (`by`, `at`, `to` — the same name the trail entry snapshotted), which the registrant modal's *Validated by* line reads |
| `admin/registrations/[id]/email` | GET, POST | The email a registration is owed, rendered for a person to send by hand — `GET` returns the recipient, subject and **both** renderings (HTML for the clipboard, plain text for a `mailto:`), `POST` records that a staff member sent it. Auth-checked and scoped like the status route, which matters more here than most: the rendered email carries every runner's contact details, birthdate and emergency contact |
| `admin/runners/[id]`, `admin/runners/bulk-delete` | PUT/DELETE, POST | Registrant editing. **Removal is soft** — `deletedAt`/`deletedById` are stamped and the row stays (§4), so a runner already removed answers "Runner not found". An edit needs `registration:edit`, a removal `registration:delete`. Each edit writes one audit row naming the fields that changed (sensitive columns as "changed", never their values), and each removed runner — bulk included — gets its own row carrying their name and runner reference. The PUT refuses an email that is not an address (`email-address.ts`), and when the edited runner is **runner 1 it also writes `Registration.customerEmail`**: every email about an order is addressed to that column, it was previously written once at checkout and never again, so correcting the typo on the runner fixed the list and left the mail just as undeliverable. The sync is unconditional, which makes re-saving runner 1 the repair for an order whose contact address drifted out of step before this existed |
| `admin/proof/[id]` | GET | Auth-checked redirect to a short-lived signed proof URL |
| `feedback` | POST | **Public**, and the only route on this site that writes a row on a stranger's say-so — the people most worth hearing from here are signed out, so an auth check would silence exactly them. Three things hold it: the `FEEDBACK_RULE` throttle (§5) applied **before the body is read**, every length and vocabulary rule from `lib/feedback.ts` enforced here and not only in the form, and the fact that nothing a sender writes is rendered anywhere but the superadmin inbox, as text. A refusal names the field it is refusing and hands back that field's key, so the form puts the caret in the right box (§8, rule 4) rather than showing a catch-all over a form the sender has to re-read themselves. The browser is read from the request headers rather than from the body — a client that can be asked to describe itself can be asked to lie — and the created row's id is deliberately **not** in the answer |
| `promos/lookup` | POST | **Public.** The terms of a code a runner just typed, scoped to the event they are registering for. Returns the *terms*, not a computed discount — the order keeps changing under the runner, so the wizard recomputes with `applyPromo` and nothing here is trusted at checkout. A code we do not have comes back as `{ promo: null }` with a 200, since "we don't have that" is an answer rather than a failure; the response carries no id, organizer or batch. **Throttled** by `lib/rate-limit.ts` (20 a minute per address) before the body is read, and a throttled caller gets that same `{ promo: null }` — a distinct "slow down" would make this endpoint a *better* oracle when throttled than when open |
| `admin/promos` | POST | Creates one code, a whole batch of single-use vouchers in one call, or an automatic promotion. Refuses rather than repairs, naming the field it refused, and scopes `eventId` to the signed-in organizer's own events. A `CATEGORY_PRICE` promotion's price rows are written **in the same statement** as the promotion, since one with no prices is one the event page would advertise and the checkout would ignore |
| `admin/promos/[id]/redemptions` | GET | Which orders used this promotion — order reference, event, runner count, status, `discountAmount`, `createdAt`, and for a voucher batch the specific code that was used. Covers **all** of the promotion's codes, since a batch is one promotion, and is capped at 500 with a flag saying when it was cut short. Auth-checked and scoped to the organizer's own events, which matters twice here: an id from the browser is not proof of ownership and neither is the code text |
| `admin/promos/[id]` | PATCH, DELETE | Edits, pauses or removes a promotion. A body carrying **only** `{ paused }` is the hold on its own and touches nothing else — the row menu has no form open, so it has no terms to re-post, exactly as `admin/events/[id]` PATCHes its registration hold. Any fuller body is a real edit and is validated in full. **A batch is one promotion, not two hundred**, so an operation on any of its vouchers is an operation on all of them, and the response says how many rows it touched. An edit runs in a **transaction**, because the terms and the price list have to move together: a promotion whose columns saved and whose prices did not is one advertising numbers the checkout no longer holds. The price list is replaced wholesale rather than merged, so a category the organizer cleared loses its row. What a promotion *is* cannot be edited — a code cannot become codeless, a batch's shared label and its random codes stay put, and a voucher stays single-use — because those changes would take the promotion away from people already holding it. Deleting is safe for history: `Registration.promoCode` and `discountAmount` are snapshots, so it removes the ability to redeem, not the record of a redemption. Auth-checked and scoped to the organizer's own rows |
| `cron/expire-pending` | GET, POST | The daily abandoned-checkout sweep (`lib/pending-expiry.ts`). **Not an admin route** — a scheduled job has no cookie — so it is guarded by the `CRON_SECRET` shared secret in `Authorization: Bearer …` (what Vercel Cron sends) or `x-cron-secret` (a person with curl). With the secret **unset it returns 503 rather than running unguarded**, since the deployment that forgot the variable is exactly the one nobody would check. GET and POST do the same thing because Vercel Cron only issues GET; nothing reaches the sweep without the secret. Returns what it did — how many expired, how many redemptions went back, and whether `MAX_SWEEP` cut it short — and logs the order references, since the caller reads nothing |
| `admin/profile`, `admin/profile/password` | PATCH | Self-service only; the id comes from the cookie, never the body |
| `admin/team` | POST | **Invites a person.** `team:manage`, and the role must be one `canManageMember` allows. Validated by `readInvitee` + `readAccess` (§5), refusing per field (`errors`). An address that signs in as an **Organizer** is refused; an address that already has a **StaffAccount** gets a second membership on that same account (keeping the name they gave themselves) unless it already has one here. The account (if new), the membership with its hashed token, the assignments and the `staff.invited` trail row are one transaction; the email goes after and **never fails the invite** — the answer carries `emailSent` / `emailError`. Answers 201 |
| `admin/team/[id]` | PATCH, DELETE | One membership of this organizer. Every call first runs **`loadManagedMember`** (`team/[id]/member.ts`): a session with `team:manage`, a membership of *this* organizer ("Team member not found." otherwise), **not the actor's own**, and a role the actor may manage. `PATCH { suspended }` on its own suspends or reinstates (accepted memberships only — an invitation is revoked, not suspended); `PATCH { role, assignments }` changes access, re-checking the new role, updating assignments in place, and writing nothing when nothing changed. `DELETE` removes the membership and its assignments, and the StaffAccount too only if it never set a password and has no other membership. Each change writes one trail row. Takes effect on the person's next request, since `getActor()` reads the membership every time |
| `admin/team/[id]/invite` | POST | **Resends** an unaccepted invitation with a **new** token and a new week — the old link dies. Same guard; reports `emailSent` like the invite |
| `auth/invite/[token]` | POST | **Public.** Accepts an invitation. Unknown, used, expired or malformed tokens all answer 410 with one sentence. A new account must send `name`, `password`, `confirmPassword`; an existing account must send its **current password** (a wrong one is written to the trail as a failed sign-in). The membership is claimed with a conditional `updateMany`, so a double press cannot accept twice; then the account becomes `ACTIVE`, the trail gets `staff.invitation.accepted` + `auth.signed_in`, and the session cookie is set for that organizer |
| `auth/switch-organizer` | POST | A STAFF session moving to another organizer it belongs to, checked with `activeMembershipWhere`; reissues the session with the new `orgId`. The trail row is written to the organizer entered and does not name the one left |
| `superadmin/organizers`, `superadmin/organizers/[id]` | GET, PATCH | Status and commission |
| `superadmin/communities`, `superadmin/communities/[id]` | GET/POST, PATCH/DELETE | Club curation |
| `superadmin/feedback`, `superadmin/feedback/[id]` | GET, PATCH/DELETE | The feedback inbox. `SUPER_ADMIN` only — an organizer reading it would be reading other organizers' complaints about the software, and strangers' email addresses. `GET` returns everything newest-first rather than paged: the whole table is the messages people took the trouble to write, and if it ever outgrows one call that will be a good problem. **`PATCH` moves the triage mark and nothing else** — the message, the name and the address are what somebody else wrote, and an inbox that can edit its own mail is one whose contents cannot be trusted later. `DELETE` is a genuine delete, unlike anything on a registration: there is no person waiting on the row, nothing in the product reads it, and a kept-"in case" spam row is one more thing between the owner and the messages that matter. The screen confirms first |

---

## 7. Security model

- `src/proxy.ts` guards `/admin/**` (except `/login`, `/register` and
  `/invite`, which a person with no session must reach — `PUBLIC_ADMIN_PATHS`) and
  `/superadmin/**`: no token → `/admin/login`; a `SUPER_ADMIN` on `/admin` →
  `/superadmin`; a non-super-admin on `/superadmin` → `/admin`.
- **Route handlers re-check auth themselves.** The proxy does not cover
  `/api/**`, so every admin route calls `getActor()` (`actor.ts`, §5), scopes
  its queries to `actor.orgId`, and asks `can(actor, permission, …)` before it
  acts. **Never call `getAuthCookie()` from an admin surface, never scope by the
  person's id, and never compare a role string** — the tenant is `orgId`, the
  person is `actor.id`, and what a role may do is `permissions.ts`.
- **Admin server pages scope too, not just the API.** The proxy proves a session
  exists; it never asks whose event the `[id]` in the URL is, nor whether a
  staff member was assigned to it. So every page under `/admin/events/[id]/**`
  calls `requireActor()`, reads the event with
  `findFirst({ where: { id, organizerId: actor.orgId } })` and then checks
  `can()`, answering either miss with `AdminNotFound` worded from
  `admin/events/event-not-found.ts` — the same page for a genuinely missing
  event and one this person may not open, so the screen cannot be used to
  probe which ids exist. List pages read through `reachableEvents(actor, …)`.
- **Every admin write leaves an audit row in the same transaction**
  (`audit.ts`, §5), and so do the two reads that let personal data leave —
  opening a proof and exporting registrants. A new admin write passes its
  transaction client to `recordAudit`; a new action is added to `AUDIT_ACTIONS`
  first. The trail is append-only, and a sensitive runner column's value never
  enters it.
- **The trail is read by owners and admins only** (`activity:view`), on
  `/admin/activity`, and every read is scoped to `actor.orgId`
  (`activity-store.ts`). It shows IP addresses and devices, which is why no
  per-event role reaches it. The one place a staff member meets it is the
  registrant modal's *Validated by* name, which is the order's own provenance.
- **A staff session can be ended before its JWT expires**: `getActor()` checks
  the StaffAccount's status, membership and `sessionsValidFrom` on every
  request, and a staff password change moves `sessionsValidFrom` forward
  (reissuing only the session that made the change). `registrants` and
  `results` both do this; the `edit` screen is a client component, so its scope
  lives in `GET`/`PUT /api/admin/events/[id]`, and the results uploader's in
  `POST /api/admin/events/[id]/results/upload`. **Never read an event by id
  alone on an admin surface** — the registrants screen carries every runner's
  email, phone, birthdate, emergency contact and medical notes, and an id is not
  proof of ownership. These pages need no `SUPER_ADMIN` branch, because the
  proxy redirects a super admin off `/admin/**` before they render.
- **Team management is guarded in one place.** Every route about an existing
  member runs `loadManagedMember` (`api/admin/team/[id]/member.ts`): session,
  `team:manage`, a membership of the actor's own organizer, **never the actor's
  own membership**, and a role the actor may manage — **an ADMIN can neither
  grant ADMIN nor touch an existing admin** (`GRANTABLE_ROLES`), so the owner's
  choice of who reaches every event cannot be widened or undone by an admin. A
  change of role is checked against the new role as well as the old.
- **One person, one credential.** Nobody sets a password for someone else: an
  invitation carries a 256-bit token, **stored only as its sha256**, valid 7
  days, replaced (and the old one killed) on every resend. Accepting on an
  account that already has a password **requires that password** — the link
  proves inbox access, not identity — and a wrong one is logged as a failed
  sign-in. Acceptance claims the row with a conditional update, so a link
  cannot be used twice. The invite page is `noindex` with
  `referrer: no-referrer`, since the token is in its URL. Outside production
  only, the link is printed to the server console for local testing.
- **Suspension and removal bite on the next request**, not at token expiry:
  `getActor()` refuses a suspended or deleted membership, and sign-in and the
  organizer switcher both go through `activeMembershipWhere`.
- **Never trust client amounts.** `checkout` and `checkout/manual` refetch the
  event and recompute the delivery fee, platform fee, subtotal (including the
  shirt upcharge) and **the promo discount** before writing or billing.
  Mismatches are rejected. The request carries the promo *code*, never what it
  is worth — and only the code the runner **typed**, never the name of the
  discount that won: an automatic promotion's `code` column is its name, which
  `findPromoCode` deliberately never matches, so posting it refused every order
  an automatic promotion covered. `resolveDiscount` also drops a posted name that
  matches one of the event's automatic promotions, for tabs opened before that
  fix. Both routes now also pin the **total** — with a discount in play, an
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
12. **Every screen ships mobile responsive, and a fix never breaks another
    screen.** Organizers run race day from their phones, so the admin and
    superadmin dashboards must be fully manageable at 360px. This applies to
    every new or changed feature, in the same change, never "mobile later".
    - **Breakpoints follow the public site**: Tailwind's default `sm` 640 /
      `md` 768 / `lg` 1024. Never a one-off number.
    - **The menu is the same at every width.** It is the collapsible sidebar,
      a narrower rail on a phone. The dashboards never get a separate phone
      top bar, drawer or bottom bar.
    - **No horizontal scroll on a phone, ever.** Below `lg` a data table
      becomes cards through the shared card component, not an `overflow-x`
      scroller.
    - Touch targets are 44px. Typed-into fields are 16px. Modals fit the
      viewport and scroll inside. Menus stay on screen.
    - Responsive fixes go into the shared furniture (shell, toolbar, pager,
      card, modal frame), not page-local hacks. Every other screen using that
      furniture is re-checked at phone *and* desktop widths before the work is
      called done.
    - The full checklist and the overflow-check script are in §9, under
      "One responsive dashboard" → "Checking a screen".

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
- **An email address is checked on both sides of the wire** (§5,
  `email-address.ts`) and stored trimmed. `type="email"` on the input is not a
  check — a browser only enforces it on a form submit, and the wizards advance
  through click handlers — and an address that is not one is not a cosmetic
  fault: it is a runner who never hears from us again.
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
  the first, not a column of its own. Where the `No.` cell is a **position**, it
  counts by row **id**, not by object identity: sorting rebuilds the rows, so an
  `indexOf` on them finds nothing and every line numbers itself 0 the moment a
  header is clicked.
- **One responsive dashboard.** Both dashboards stand in
  `admin/DashboardShell.tsx`; `AdminShell` and `SuperAdminShell` hand it only
  their links, their role line, and (for `/admin`) the organizer switcher. The
  breakpoints are the **public site's Tailwind scale and nothing else**. In
  CSS they are written as range queries, `(width < 40rem)` / `48rem` / `64rem`;
  in TSX they are `sm:` / `md:` / `lg:` and their `max-` forms. Never a
  one-off number.
  - **The menu** is full-width rows under a MENU label. The pages come
    first, then a divider, then the account rows (`secondaryNavItems`,
    which is Settings on `/admin`) and **Log Out as a row**. The person, with
    their name and role line, sits at the foot. The page on screen is a
    tinted band with a 4px bar on its right edge.
  - **From `md` up the menu collapses to an 80px icon rail** from the round
    chevron on its edge. Icons never move. Labels fade but stay each row's
    accessible name, and a tooltip (transitions.dev's 17) names the row on
    hover and focus. The choice is kept in the `dash_sidebar` cookie
    (`admin/dashboard-sidebar.ts`), which both layouts read, so the first
    paint is already the right width.
  - **Below `md` it is the same menu, smaller.** This is the owner's decision:
    a phone gets no top bar or drawer of its own. The menu rests as a 56px
    rail, and the same chevron opens it *over* the page at 256px, because
    pushing a phone's content aside would leave a sliver. On a phone, open is
    a moment rather than a preference:
    - the cookie is not read;
    - the open state remembers its pathname, so any route change folds it;
    - the body does not scroll and `<main>` is `inert`;
    - Esc or a tap on the backdrop folds it and returns focus to the chevron;
    - there are no tooltips;
    - the resting rail keeps the desktop sidebar's z-index 50, so a page's
      own z-50 modal covers it. Only the opened menu rises to 70.
  - **Below `lg`** the header grows to a 2-line clamped title, the content
    padding steps down, and the toolbar's search takes its own row. Every data
    table becomes **`admin/AdminCardList`**.
  - **Both layouts render and CSS picks one**, through `.dash-desktop-only` /
    `.dash-mobile-only` in `Admin.css`. That is the only place the switch is
    decided; a `matchMedia` hook would render the wrong layout on the server.
    A TanStack screen passes `table.getRowModel().rows` to the cards, so
    search, filters, sort, selection and pager are shared. Nothing in a card
    carries an `id`, and per-row open state lives in the parent.
  - The card list is data-agnostic (`title`, `subtitle`, `badges`, `fields`
    with `full`, `actions`, `selection`, `leading`, `expanded`, `empty`),
    a server page can render it directly, and it is an auto-fill grid of
    `minmax(min(100%, 20rem), 1fr)`.
  - **An edit a table does in its cell is `admin/AdminCardEdit` on a card**
    (the superadmin's admin fee and club rename). It sits in the `expanded`
    slot under the value it changes, as a labelled full-width 16px box, with
    Save and Cancel at 44px underneath; Enter saves and Escape cancels. It
    holds no state: the page's `editingId` and draft feed the cell and the
    card alike. A form sitting in a toolbar (Add a club) is `.toolbar-form`,
    which stacks the box and its button at full width below `sm`. An approve
    chip is `.btn-filter.is-success`, green on hover only, beside
    `.is-danger` / `.is-pending` / `.is-primary`. Those classes exist because
    Tailwind colour utilities lose to the unlayered `.btn-filter`.
  - A filter chip's menu is **`.toolbar-popover`**: anchored from `sm` up, a
    bottom sheet with 44px options below it. A modal is
    **`.admin-modal-panel`** with `.admin-modal-body` and
    `.admin-modal-footer`: capped at the viewport in `dvh`, the body scrolls,
    and the footer is sticky and full width on a phone. The panel is
    `overflow: clip`, so a footer's own background cannot paint square
    corners past its rounded edge. Both are defined in `Admin.css`, and every
    dashboard dialog wears them, the event forms' success and failure dialogs
    included.
  - **Every TanStack table's pager is `admin/AdminTablePager`.** It holds the
    rows-per-page menu, the range and First / Previous / Next / Last. Below
    `sm` it shows only the range and 44px Previous / Next. It counts with
    `table.getRowCount()`, so a **server-paged** table (the activity trail:
    `manualPagination`, `rowCount`, and `onPaginationChange` pushing the URL)
    wears the same pager, and pass `pageSizes` to change the menu.
  - **Below `lg` a table's toolbar gains `admin/MobileSortMenu`**, a Sort chip
    listing every column that can sort, each ascending or descending, with
    the active sort named on the chip. Cards have no headers to click.
    - The View (column visibility) chip is `.dash-desktop-only`, because cards
      have no columns.
    - A card list standing on the page, rather than inside a panel, passes
      `className="is-flush"`.
    - A route's wait draws the list's shape through
      `route-loading-shape.ts` (below).
  - **A row's portalled menu is placed by `admin/row-menu-position.ts`**
    (`placeRowMenu`). It is clamped inside the viewport's sides, and flips
    above a trigger that has no room below, measured once the menu has
    rendered. A card's menu trigger is 44px.
  - **A card's footer is a shortcut on the left and ⋯ on the right.**
    - The shortcut is the row's most-used action, as a quiet 44px
      `.btn-filter`: Registrants on an event card, Edit Access on a team
      member card.
    - It stays inside the ⋯ menu too, so the menu matches the table's.
    - This was the owner's choice. A footer holding only ⋯ read as empty
      space, and a label such as "Actions" beside it would look like a button
      without being one.
  - **Hover-only information becomes visible text on touch.** Examples: a
    team row's "why you cannot manage this", and a role's hint on the matrix
    header. The card or picker says it in words. Nothing a label shows is
    dropped.
  - A panel's inset is 16px below `sm`. A modal's close button is 44px with a
    -12px margin, so its icon does not move.
  - A header back arrow wears `.admin-back-link` for its 44px hit area.
  - **A bulk action below `lg` is a bottom bar, not a toolbar chip.** The
    registrants list's `.bulk-bar` ("N selected · Export · Delete · Clear")
    is fixed to the viewport and lined up with the content column, with a
    `.bulk-bar-spacer` at the end of the list so the pager scrolls clear of
    it, and rises on `.t-toast`. It is fixed rather than sticky because it
    floats over whichever card is at the foot of the screen, wherever the
    list is scrolled to. From `lg` up the red chip in the toolbar does the
    job. A card list with a bulk action passes `selectAll` to
    `AdminCardList`, reading the table's page selection.
  - **A `.btn-filter` chip's tone is a class, never a Tailwind colour.**
    `Admin.css` is unlayered, so `.btn-filter` beats `text-orange-400` and
    friends: the registrants queue chips and Delete Selected drew grey for as
    long as they carried those utilities. Use `.is-pending` (amber),
    `.is-danger` (red) or `.is-primary` (blue).
  - A modal a person reads rather than answers (the registrant's details)
    adds `.admin-modal-sheet` to `.admin-modal-panel`: below `sm` it is the
    whole screen with its footer at the bottom edge, and its overlay drops
    its padding with `max-sm:p-0`.
  - **A long form keeps Save in reach below `sm`.** `.admin-form >
    .form-actions` (the create and edit event forms) sticks to the foot of
    the screen, edge to edge on a blurred ground; Cancel keeps its own width
    and Save takes the rest. It can stick because `<body>` **clips** its
    `overflow-x` (`globals.css`). It used to hide it, which made `<body>` a
    scroll container that never scrolls, so no sticky box anywhere in the app
    stuck — the desktop `.admin-header` and the event page's and wizard's
    summary sidebars stick now too. Never put `overflow-x: hidden` back on
    `html` or `body`.
  - **Forms on a touch screen.** A `.form-grid` cell may shrink
    (`min-width: 0`), so a native date or time input cannot hold a column
    open. Below `lg` a row's remove button, the add link and a checkbox's
    label row are 44px, and an uploaded image's Remove is a bar under the
    image instead of a hover overlay. Below `sm` the drop zone tightens and a
    settings button spans the width. A money box carries
    `inputMode="decimal"`, a count `inputMode="numeric"`; radio cards stack
    below `md` and step their inset down below `sm`.
  - **A picker's list stays on screen.** `AdminSelect` measures when it
    opens: below its trigger when the list fits, above it when there is more
    room there, and never taller than the room it opens into.
    `OrganizerSwitcher`'s menu is clamped inside the screen's sides and
    scrolls rather than running off the top.
  - **A wait is the page's shape, at both widths.** `admin/loading.tsx`,
    `admin/events/loading.tsx` and `superadmin/loading.tsx` read the URL and
    hand `AdminRouteLoading` a shape from `admin/route-loading-shape.ts`.
    Below `lg` that is metric tiles, the toolbar's wrapped rows and a card
    list in its frame, or form panels field by field. The same entry's `lg`
    block is the desktop: the toolbar in the one row it unwraps into, and the
    **table** the cards stand in for — its header band and its rows at that
    screen's own row height — or a panel's rows in a real `.form-grid`, where
    a `split` row is the pair of fields the form puts side by side. Both are
    rendered and `.dash-mobile-only` / `.dash-desktop-only` pick, the same
    switch the real pages use. Every number is measured on the real page (the
    phone at 390px, `lg` at 1680px). **A page that gains a toolbar row, a
    metric, a field or a column updates its entry in the same edit.** A route
    with no entry at all — a 404, anything unlisted — is still the centred
    dots, which promise nothing about what is coming. A client page that
    fetches its own list (the superadmin screens) puts `AdminCardListSkeleton`
    in the card list's `empty` slot while it waits.
  - **A chip that toggles a filter is `admin/FilterChip`** (feedback's status
    and kind chips, the organizers' status chips). It finds rows and never
    sorts them, pressing the active chip clears it, and it is 44px below `lg`.
  - **A single-event screen's miss is `AdminNotFound`**, worded from
    `admin/events/event-not-found.ts`, identical for a missing event and one
    the person may not open (§7).
  - **The sign-in pages** (`Auth.css`: login, register, the invitation). Below
    `sm` the card keeps a 16px margin and a 24px inset, its title steps down
    and the glows fit the screen. The card is centred by auto margins, so with
    a phone's keyboard open it starts at the top instead of pushing its head
    out of reach. The container clips rather than hides and is `dvh` tall, the
    card lifts on hover only where there is a real pointer, and the glows stop
    under reduced motion. **They are not dashboard screens**, and two places
    have to agree on that: `admin/bare-paths.ts` lists them, `AdminShell` draws
    them without the sidebar, and `admin/loading.tsx` answers them with
    `AuthRouteLoading` — the running figure centred in the page's own
    `.auth-container` — instead of the dashboard frame, whose header skeleton
    bar over a sign-in page was a placeholder for furniture that never
    arrived. A new page that lives under `/admin` without the sidebar goes in
    that list.
  - **Checking a screen.** A dashboard change is not done until:
    - nothing scrolls sideways at 360, 390, 767 and 820, measured with the
      script below at rest *and* with the screen's menus and dialogs open;
    - 1280 and 1440 look as they did, on every screen using what changed;
    - a data table is cards below `lg`, from `AdminCardList`;
    - targets are 44×44 with 8px between them, and a typed-into field is
      16px below `sm`;
    - a dialog fits in `dvh` with its primary button reachable, and a menu
      stays inside a 360px screen;
    - untrusted text wraps (`min-w-0`, `overflow-wrap: anywhere`) and only
      chips are `nowrap`;
    - motion keeps its reduced-motion guard, and lint and `npx tsc --noEmit`
      are clean for the touched files.

    It must return `ok: true` with an empty list. A resting rail stays inside
    the screen; an opened menu, popover or dialog is checked while open.

    ```js
    (() => {
      const w = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll('body *')]
        .filter(el => { const r = el.getBoundingClientRect(); return r.width && r.right > w + 1; })
        .slice(0, 10)
        .map(el => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`);
      return { ok: document.documentElement.scrollWidth <= w, offenders };
    })()
    ```
- **A list's order is a fact about the rows, not about the view — and a number
  in it should name the thing, not its seat.** Every listing gets an explicit
  `orderBy`; without one Postgres is free to return rows in heap order, which
  every `UPDATE` reshuffles, so a screen quietly reorders itself as somebody
  works it. Sort by what the rows *are* (registration order, newest message
  first) and hold it: a row must never move because of an action just taken on
  it, or the person loses their place and the sight of the change landing where
  they clicked. Work queues are therefore **filters**, not sorts — the
  registrants screen's *Needs Validation* and *Unsent Email* chips, the feedback
  screen's triage chips. And when the number in the `No.` column is worth
  quoting outside the screen, assign it on the server from that order and carry
  it on the row (registrants' `regNo`) instead of using the row's position,
  which renumbers the moment anything is filtered.
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
  rather than one because they live in different design systems. The results
  uploader's seven column-mapping selects moved onto it in Mobile Batch 4, so
  the admin has no native select left. The registrants edit modal's Gender
  field moved in Mobile Batch 3; its Shirt Size is still a free-text box with a `<datalist>`,
  which AdminSelect cannot replace because a size may be left blank or typed.
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
  shortened to fit. Every admin row menu is placed by `placeRowMenu`, whose
  `ROW_MENU_WIDTH` repeats that number, so it moves in `Admin.css` and
  `admin/row-menu-position.ts` together.
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
    goes, then `.admin-content`) holding that route's shape, or the brand
    loader centred in it when the route has no shape. Next.js
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
  dropped to `--duration-quick`, because 400ms of fade before the shape appears
  is 400ms still looking like nothing happened.
- **The app waits with a sprinter, and there is only the one loader.** The
  dashboard used to answer with three pulsing dots
  (`components/ui/LoadingDots`, `.t-dots`); the owner asked for them to go, so
  the component, its CSS and its `--dots-*` tokens are gone from the app. A
  wait in the dashboard is now either the page's own shape
  (`AdminRouteLoading`, above) or the same running figure the public site uses.
  **Do not reintroduce a spinner or a dot loader** — a wait whose layout is
  known draws that layout, and one whose layout is not known draws the figure.
- **The figure** is `components/ui/RunnerLoader` (`.t-runner` in
  `globals.css`): an original running figure in brand blue whose arms and legs
  run a real stride (each limb is a thigh or upper-arm group turning at the
  joint with the shin or forearm nested inside it, `transform-box: view-box`,
  the two sides half a `--runner-cycle` apart), with brand-orange speed lines
  streaming off behind. The owner asked for it because a runner who presses
  Register and sees nothing move assumes the button is broken. Three sizes —
  `sm` (1.3em, beside a word or in a cell), `md`, `lg` filling a page — and
  `tone="current"` to draw it in the surrounding text colour, which is what the
  dashboard's `LinkPending` uses. Hook-free and pure CSS, so it can render in a
  `loading.tsx` without dragging it across the client boundary. A new wait on
  the public side should be one of these four:
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
  file that can import nothing, so change it in the same edit). It replaced `public/run-as-one-logo.png` (the old
  artwork, since deleted)
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
- **The brand is "Run As One", and `SITE_NAME` is the only place it is
  spelled.** It was once written "RunAsOne", and for a while it carried a
  parent-brand byline; the owner had that byline removed from every surface —
  the name, the logo lockup, the favicon's label, the Open Graph card and the
  email logo. Every surface that names the platform in prose — the root
  `<title>` and every page title, the Open Graph `siteName`, the two legal
  pages, the footer copyright, the sender name and footer on every email —
  builds its string from `SITE_NAME` in `lib/site-contact.ts` rather than
  typing it. **Never retype the name**: an earlier rename left half the page
  titles behind because they were string literals, which is why they are
  template literals off the constant now. The email sender's display name stays
  **quoted** (`"${SITE_NAME}" <…>`) so a special character in some future name
  — the old byline's colon was one — cannot break RFC 5322 parsing. The
  lockup's wordmark is the *only* copy of the name not read from the constant,
  because it is separately styled DOM text, so edit the two together. The
  `RunAsOneLogo` component, its file and the `.rao-logo` class keep their old
  identifiers; they are code names, not text a person sees.
- **The lockup is the mark and the wordmark, nothing else.** There is no byline
  or tagline slot: the endorsement line that used to sit under the wordmark was
  removed along with its `.rao-logo__byline` and `.rao-logo__words` styles, so
  the wordmark alone is centred on the mark in the horizontal lockup and centred
  under it in the stacked one. Do not bring a sub-line back unless the owner
  asks for one.
- **Sizing the logo is one number.** `--rao-logo-size` is the height of the
  mark and everything else — the wordmark and the gap — is `em` off it, so
  a call site sets one value and the proportions hold:
  `className="[--rao-logo-size:32px] sm:[--rao-logo-size:38px]"`. Do not size
  the wordmark or the gaps per surface; that is what left the old raster logo a
  different size in every corner of the app. **The 40px default is only a
  `var(--rao-logo-size, 40px)` fallback — never declare `--rao-logo-size` on
  `.rao-logo` in `globals.css`.** That file is unlayered and Tailwind v4 puts
  the arbitrary-property utilities in `@layer utilities`; unlayered CSS beats
  layered CSS regardless of specificity, so a declared default once pinned every
  logo (navbar, footer, auth cards) at 40px and silently ignored the size each
  call site asked for. The admin sidebar sets its size from `Admin.css`
  (`.admin-brand .rao-logo`: 40px, 26px below 48rem) instead of a utility.
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
  picks up whatever font the rasteriser happens to find.

  **Changing the lockup means patching both wordmark rasters**, and neither
  can be regenerated from source, because there is no source — they were
  rasterised from a browser once and committed. They are patched in place with
  `sharp` on the raw pixels. When the byline was removed, its rows were cleared
  and the wordmark was moved down by 0.13 of the mark's em — half the byline's
  line box plus the gap it sat behind, which is exactly where the live component
  now centres the wordmark (16px in the 3x email PNG, 18px on the OG card). The
  OG card's text sits on the panel's gradient, so its box is rebuilt by
  interpolating each column between clean rows above and below, the white
  wordmark's coverage is recovered against that rebuilt ground, and it is
  composited back at its new height; the email lockup sits on transparent
  ground, so its rows are simply moved. A line that has to be *added* is drawn
  in a canvas on a page where the real face is loaded, measured against the
  PNG, and composited the same way. Patching leaves every other pixel of both
  assets byte-identical, which is worth more than a clean re-render that would
  drift.

  **A re-cut email logo also needs its URL bumped and a deploy to `main`.**
  `LOGO_URL` in `lib/email.ts` carries a `?v=` (`LOGO_VERSION`) that must change
  with the PNG: Gmail's image proxy caches each image URL on Google's side and
  keeps serving that copy, so a new file behind an old URL still shows the old
  picture. And the URL is built on `SITE_URL`, the production domain, so an email
  sent from localhost or a preview shows whatever production serves — a re-cut
  logo once sat fixed on `dev` while every test email kept showing the old one,
  because `main` had not been deployed.
- Commit style: `feat:` / `fix:` / `refactor:` plus a sentence saying what changed
  for the user.

---

## 10. Current state

**`FEATURES_CHECKLIST.md` and `IMPROVEMENTS_PLAN.md` are deleted.** Both were
finished — every major section of the roadmap ticked through the results and
e-certificate module, and all fourteen improvements across `IMPROVEMENTS_PLAN`'s
seven batches landed — and the decisions each recorded are settled, not open
questions a future session needs to re-derive from the file. This guide is
where that reasoning now lives (§9 and this section); the plan files themselves
added nothing once their queue was empty.

**`PROMOTIONS_PLAN.md` is finished.** All three batches have landed; like
`IMPROVEMENTS_PLAN.md` it is now kept only for the reasoning behind each and for
the decisions it records as not to be relitigated. It is no longer a queue, and
the file itself says it may be deleted.

**`STAFF_ACCESS_PLAN.md` is an open queue, with Batches 1–3 landed.** Five batches
for giving an organizer's personnel their own accounts instead of sharing the
organizer's one login. **Batch 1 is in:** the `StaffAccount` /
`StaffMembership` / `EventAssignment` / `AuditLog` models and the soft-removal
columns (§4), `actor.ts` / `permissions.ts` / `audit.ts` (§5), typed session
claims with `orgId`, every admin page and `/api/admin/**` route rewired onto
`getActor()` / `requireActor()` and `can()`, and every existing admin action
written to the trail. **Batch 2 is in too:** `/admin/team` (invite by email,
Admin or Staff with per-event roles, edit access, suspend / reinstate, resend
or revoke an invitation, remove), the public `/admin/invite/[token]` accept
page, per-membership suspension (migration
`20260913180000_staff_membership_suspension`), the organizer switcher for staff
who work for several organizers, and a sidebar and events table that only offer
what the role allows. **Batch 3 is in too:** `/admin/activity` (the trail with
Person, Event, Activity and Dates filters, server-paged and pinned so it never
shifts under a reader), a *Validated by* line and an activity link in the
registrant detail modal, and a registrants screen that offers each role only
the buttons its routes allow. No migration. **Batch 4 (TOTP) is next**, then the
optional extras. **Read the plan before touching admin auth, the `Organizer`
model, or any `/api/admin/**` route's ownership check** — its "Batch 1" notes
record the calls made in the batch, and the file records which decisions are
closed (no unified account table, no SSO).

**`MOBILE_RESPONSIVE_PLAN/` is finished, and the folder is deleted.** All six
batches landed and the convention itself lives in §9, which needs nothing from
the plan; what follows is the summary kept here instead. Batch 1
added `DashboardShell` (the frame both dashboards share: one collapsible
sidebar menu at every width, a rail that opens over the page on a phone), `AdminCardList`, the `.dash-desktop-only` /
`.dash-mobile-only` switch, and the toolbar, header, metrics, popover and
modal-frame rules in `Admin.css`, all on the public site's breakpoints (§9,
"One responsive dashboard"). The Dashboard's Recent Registrations is cards
below `lg`. **Batch 2 is in too.** `/admin/events` and `/admin/team` are cards
below `lg`, on the new shared `AdminTablePager`, `MobileSortMenu` and
`placeRowMenu`. The event schedule and delete modals and the team invite form
wear `.admin-modal-panel`. Below `lg`, the team's permission matrix is a
`RolePicker`: one role at a time, on a sliding-tabs control. **Batch 3 is in
too.** `/admin/events/[id]/registrants` is cards below `lg`, with a Filters
sheet below `sm`, a bulk bar at the foot of the screen, a full-height detail
sheet, all five modals on `.admin-modal-panel`, the row menu on
`placeRowMenu`, and the proof lightbox's tools in a bar under the image on a
phone. **Batch 4 is in too.** `/admin/marketing` and
`/admin/events/[id]/results` are cards below `lg`, on the shared pager, Sort
chip and `.toolbar-popover`s. A voucher batch opens inside its card through a
"Show N codes" accordion (`.t-acc`). The promotion form, the Redemptions panel
and the results uploader wear `.admin-modal-panel`, the uploader's column
mapping is `AdminSelect`, `PromoActionsMenu` is on `placeRowMenu`, and the edit
screen's Promotions panel stacks on a phone. **Batch 5 is in too.**
`/superadmin/organizers`, `/communities` and `/feedback` are cards below `lg`.
The admin fee and the club rename open as a full-width `AdminCardEdit` block on
the card, a feedback card opens its message through a "Read message" accordion
(`.t-acc`), the dashboard's tile icons sit in their `.metric-icon` box, and
Approve / Suspend / Remove wear the `.is-success` / `.is-danger` chip tones.
**Batch 6 is in too.** The create and edit forms keep Save in a bar at the
foot of a phone's screen and their dialogs wear `.admin-modal-panel`; uploads,
settings and the three sign-in pages fit 360px. `<body>` clips its overflow-x
instead of hiding it, so sticky boxes stick. `AdminSelect` flips above its
trigger when it must, every route's wait draws its page's phone shape
(`route-loading-shape.ts`), the organizers list has status chips in place of a
dead Filter button, Add a club sits on one row from `sm` up, and the results
and registrants screens answer a missing event with `AdminNotFound`. The batch
file carries the route × width sweep. The six batches, one file each, made
`/admin/**` and `/superadmin/**` fully manageable on a phone with no
horizontal scroll:
1. the shared shell, menu and card component;
2. Events and Team;
3. Registrants;
4. Marketing and Results;
5. Superadmin;
6. forms, sign-in pages and a full sweep.

The README records the closed decisions — breakpoints that follow the
public site's Tailwind scale (the menu opens over the page below `md`, cards
below `lg`), cards reading the same TanStack rows as the table, a CSS switch
rather than a `matchMedia` hook, and one collapsible sidebar at every width
rather than a phone-only drawer or bottom bar. Don't relitigate them.

**Releasing Batch 1 needs a migration-history fix on production first.**
Production's `_prisma_migrations` stops at `20260911120000_category_sort_order`
although its schema already holds what `20260912044340_registration_opens_at`
and `20260912055118_feedback_inbox` create, so a bare `migrate deploy` fails
with P3018. The exact three commands are in the plan's Batch 1 notes.

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
  a code in step 3 of either wizard — **and the box is only there when the
  event has a code that could be typed right now** (`acceptsPromoCodes`), so a
  race running only automatic promotions, or none, never shows registrants a
  box that makes them think they are missing a discount; an automatic promotion is on their order
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
