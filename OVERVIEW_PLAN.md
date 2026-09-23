# Overview screen plan

The dashboard's front page — `src/app/admin/page.tsx`, the tiles and panels in
`admin/Admin.css`, and the skeleton in `admin/route-loading-shape.ts` that has
to keep matching it.

Scope is **Run As One's own Overview** (Super Admin, admins, staff). The client
viewer's front page is a different component, `admin/ViewerDashboard.tsx`
(`ADMIN_MERGE_PLAN.md`, Batch 4), and is **out of scope** — but the two are
reached through the same `page.tsx`, so every change here is checked against a
viewer still landing on its own screen.

| Batch | What | State |
| --- | --- | --- |
| 1 | Make the Overview answer the morning question: pending queue, live events, real aggregates, working links, Manila dates | **Landed (dev)** — complete, uncommitted |

**Batch 1 has landed; the plan is finished** (2026-09-23, on `dev`,
uncommitted). What shipped:

- **Queries.** `page.tsx` issues eight fixed queries, run together: the live
  races (`findMany`, `upcomingEvents` + `soonestFirst`), one `aggregate` for
  revenue and platform fees, a `count` of runners on PAID orders, a `count` and
  a `take: 5` `findMany` for the queue, a `take: 5` `findMany` for recent
  orders, and two `runner.groupBy`s (PAID, PENDING) for the live races' fill.
  Nothing loads a table to reduce it in JavaScript. Checked against the
  local-dev branch: revenue, registrants and fees equal the old per-row sums to
  the centavo. All go through `reachableEvents(actor, 'registration:view')`.
- **Awaiting Verification** counts PENDING **bank transfers** only — an online
  PENDING is waiting on PayMongo and `pending-expiry.ts` sweeps it — the five
  oldest, with age (amber from 48h), each opening its race's registrants with
  `?search=<orderRef>` (the precedent the marketing screen set). With nothing
  waiting it is the one-line `.overview-quiet` bar.
- **Live Events**: up to six rows, then *All N*; paid/pending, and a fill bar
  with *N of M slots* only when every option is capped (else *No slot cap*).
  Hidden when nothing is live.
- **Tiles are links** (`.metric-card.is-link`): money to `/admin/remittances`
  for `remittance:manage`, otherwise `/admin/events`. Recent rows link by
  reference (*View Order* on a phone card). The empty state offers *Create
  Event* or *Go to Events*.
- **Manila dates**: new `formatInstantDay` in `lib/event-schedule.ts`, used on
  the Overview and in `marketing/PromoCodesClient.tsx`. `ApplicationPanel.tsx`
  already passed `timeZone: 'Asia/Manila'` and needed nothing.
- **Skeleton**: `RouteShape.linkPanels` (route-loading-shape.ts), drawn by
  `AdminRouteLoading`'s `OverviewStack`; live rows measured at 120px (390) and
  88px (`lg`).
- **Recent Registrations was kept**, as the plan required. If the page reads
  long in use, it is the block to raise with the owner — not to drop unasked.

## How to run it

Open a new session in this repository and paste:

```
Read OVERVIEW_PLAN.md and do Batch 1 only. Stop when it is done.
```

When it lands, change the row above to **Landed (dev)** and write up what
shipped, the way `DASHBOARD_SHELL_PLAN.md` records Batch 1.

---

## The owner's decisions

Taken in conversation and recorded here so the session doing the work does not
have to ask again:

1. **The Overview does both jobs — the work queue and the numbers — but it must
   not become a long page.** The owner's words: *"Gusto ko both pero hindi yung
   sobrang habang page. Yung mga importante lang talaga."* This is the binding
   constraint on every decision below. When something is merely interesting, it
   does not go on this screen.
2. **Pending payments get a queue, not just a count** — the oldest first, each
   showing how long it has waited, each linking to where it is acted on.
3. **The money stays all-time.** No period selector, no comparisons. The real
   per-period money lives on `/admin/remittances`.
4. **Live events get one compact row each** — how each race is filling is the
   question staff currently have to open `/admin/events` to answer.

## What is wrong today

Read against `page.tsx` as it stands at `9b2f7ea`:

1. **It reads the whole table to print four numbers.** The page runs one
   `prisma.event.findMany` that includes *every* PAID registration and *every*
   one of their runners, then adds them up in JavaScript — to produce four
   scalars and five rows. It gets slower with every order the platform takes.
   This is the most important fix on the page and it is invisible from the
   outside.
2. **PENDING is not on the screen at all.** Every total counts `status: 'PAID'`
   only. Bank-transfer orders awaiting a deposit check are real orders holding
   real slots (`SLOT_HOLDING_STATUSES` in `lib/registration-gate.ts`), and
   verifying them is the single most common piece of daily work — yet the front
   page of the dashboard does not mention them. The irony to fix: the **client
   viewer's** screen already shows pending, through
   `RegistrantCounts { paid, pending, total }` in `lib/client-summary.ts`. Run
   As One's own staff see less than their clients do.
3. **The dates are wrong.** `new Date(reg.createdAt).toLocaleDateString()` runs
   on the server, which on Vercel is UTC, while the project's convention is
   `Asia/Manila` (`EVENT_TIME_ZONE` in `lib/event-schedule.ts`, `MANILA` in
   `lib/activity.ts`). An order placed at 07:00 Manila prints as the day
   before. The same call appears in `admin/clients/ApplicationPanel.tsx` and
   `admin/marketing/PromoCodesClient.tsx`, and the project's rule is that a
   display defect is fixed everywhere it shows, not only where it was noticed.
4. **Nothing on the page is a link.** Not one of the four tiles, not one of the
   five recent rows. The front page of the dashboard is a dead end: every
   number that raises a question makes you go and find the answer by hand.
5. **The empty state has no way out** — "Publish an event to get started" with
   nothing to press.

## Batch 1 — what to build

The page becomes four blocks, in this order. Keeping it short is a
requirement, not a preference, so each block earns its height:

- **Tiles**, the shape they already have (`.metrics-grid` / `.metric-card`).
  Total Revenue (Net), Total Registrants, Active Events, and Platform Fees
  Collected for `platform:manage` — unchanged, **but each becomes a link** to
  the screen that explains it. Do not add a fifth tile: four already wrap onto
  a second row at 1280 with the sidebar expanded (`ADMIN_MERGE_PLAN.md`).
- **Awaiting verification** — the pending queue. The count sits in the panel's
  heading rather than taking a tile of its own. Rows are the oldest first, each
  with the runner, the race, the amount and **how long it has waited**, linking
  to that event's registrants screen. **On a day with nothing waiting it
  collapses to one quiet line, not a full empty state** — this is what keeps
  the page short most mornings.
- **Live events** — one compact row per race that has not finished
  (`hasFinished` in `lib/event-schedule.ts` draws the same line the public
  listings do, so the row and `/events` can never disagree). Title, date, paid
  and pending counts, and how full it is. Links to the event.
- **Recent registrations** — kept at five, moved to the foot. **Do not drop it
  without asking.** If the page still reads long once built, this is the first
  block to raise with the owner, because the pending queue and the live-event
  rows together answer most of what it answered — but removing information the
  owner already has is their call, not the implementer's.

### The rules this has to hold to

- **Aggregate in the database.** `groupBy` / `aggregate` / `count` for the
  totals, and one `findMany` with `take` for each list. Nothing should load a
  whole table to reduce it in JavaScript. Every amount is centavos and must
  stay an integer until it is formatted (`lib/money.ts`).
- **Revenue keeps its current definition.** `subtotal + deliveryFee -
  discountAmount`, excluding the platform and transaction fees that were never
  the organizer's. The reasoning is in the comment on `page.tsx` and must
  survive the rewrite.
- **Permissions do not loosen.** `reachableEvents(actor, 'registration:view')`
  gates the races; `can(actor, 'platform:manage')` gates the fees tile. A STAFF
  validator sees only assigned races, and the pending queue is subject to the
  same gate.
- **The skeleton must keep matching.** `route-loading-shape.ts` draws the
  Overview's shape while it loads (`OVERVIEW_PLATFORM_METRICS = 4`); new blocks
  need their shape added there, or the page will jump when it arrives.
- **Mobile is not optional.** Below `lg` every table becomes `AdminCardList`;
  the new panels follow the same rule, with no horizontal scroll at 360px.
- **Admin buttons are the quiet outline style**, never the public site's orange
  gradient.
- **Update the guide in the same change** — `docs/routes.md` for what the
  screen does, `docs/conventions.md` if a new shared pattern appears, and
  `npm run map` if a module is added.

### Done means

- The Overview issues a small, bounded number of queries and does not grow a
  query per event or load whole tables.
- A pending bank transfer placed this morning is visible on the front page,
  with its age, and one click reaches the screen where it is verified.
- Every date on the screen reads in Manila time, and the same fix is applied to
  the other two admin files that share the defect.
- Every tile and every row goes somewhere.
- At 360px there is no horizontal scroll, and on a calm day with nothing
  pending the page is not longer than it is today.
