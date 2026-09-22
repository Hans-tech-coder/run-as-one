<!-- Part of the Run As One project guide. This file is §10, the current state; the index is PROJECT_GUIDE.md at the repo root.
     Section references like "§5" point to the other parts listed in the guide's routing table. -->

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

**`MARKETING_DISCOUNTS_PLAN.md` and `PACER_DISCOUNT_PLAN.md` are open queues**
(both written 2026-09-19 from the owner's decisions). The first brings
**percentage and fixed-amount** codes back to `/admin/marketing`, with an
optional per-code category restriction (`PromoCategory`) and shared-code
limits **counted in runners**; a voucher covers one runner, the most expensive
entry. **Both batches are in (2026-09-19)**: both kinds are fully operational, including checkout runner counting, expiry restocks, and partial application messages on the wizards. Releasing it needs `npx prisma migrate deploy` against production. The second, which runs only after the first, adds
**pacer codes**: one free entry per named pacer, one category, solo orders
only, managed at `/admin/events/[id]/pacers`, and never listed in Marketing.
Staff send each code themselves, so the screen reminds them which pacers have
not been sent theirs (`codeSentAt`). A
Super-Admin-only admin-fee waiver makes such an order ₱0, and it completes as
`COMPLIMENTARY` without reaching PayMongo.
**Batches 1 and 2 of the pacer plan are in (2026-09-22)**. Batch 1: migration
`20260922100000_pacer_codes`, the `PACER` kind, the `promo:waive-fee` verb, the
`pacer.ts` / `pacer-store.ts` rules, both routes, the Pacers screen and its
*Pacers* item on the events row menu, and pacer codes excluded from
`/admin/marketing` and from `spendByCode`. **Batch 2 makes a pacer code
spendable**: `discountAmountFor` now takes off the whole entry line,
`promoCodeError` refuses a group and a wrong category by name, a pacer code
wins `bestDiscount` outright, `platformFeeAfterDiscount` applies the waiver in
all four places, and `lib/free-checkout.ts` is the ₱0 path — both wizards drop
their payment half and both checkout routes write `PAID`/`COMPLIMENTARY` at ₱0
and send the receipt instead of the acknowledgement, never touching PayMongo.
Two defects found while verifying were fixed with it: a `COMPLIMENTARY` order
would have sat in the unsent-email backlog for good (`outstandingEmail` now
knows about it), and both wizards' success screens read the stored total with
`||`, which threw a free order's ₱0 away. **Batch 3 finishes the dashboard side (2026-09-22)**: the
registrants list marks each row `isPacer` from the order's own `discountType`
snapshot and wears a blue *Pacer* chip under the status — where it explains a
PAID row with nothing collected — with a **Type → Pacers** option in the one
Filters sheet and a **Pacer** column in the CSV; the detail modal repeats the
chip, prints *Complimentary: pacer entry* under the payment method, and no
longer claims PayMongo settled a free order (`statusProvenance` now takes
`{ isBankTransfer, isComplimentary }`). A complimentary order cannot reach the
*Needs Validation* queue or the bell, which both ask for PENDING **and** bank
transfer. `settlement.ts` needed no arithmetic — a ₱0 order adds nothing to
collected and nothing to Run As One's share — and now says so in its header,
naming the breakdown's *Discounts* line as where a pacer shows. The Pacers
screen gained **"N of M pacers registered"**. **The registrants screen was split
in the same change**, from 2,571 lines to 2,017: `RegistrantDetailModal.tsx`,
`registrant-display.tsx` and `registrant-csv.ts` beside it. `dev` may be
promoted whenever the owner says. Releasing it still needs
`npx prisma migrate deploy` against production for Batch 1's migration. Each file holds its decisions,
batches and open questions; the behaviour described in §4–§7 is unchanged
until a batch lands.

**`GUARDIAN_CONSENT_PLAN.md` is finished — all four batches have landed**, and
the file is kept only for the owner's decisions and the reasoning behind them.
A birthdate can no longer be in the future anywhere it is written:
both wizards pick it with the custom `BirthdatePicker` (§9; Batch 2), which
cannot select a day after today in Manila, step 1 validation gives the specific message from
`lib/minor-consent.ts` and highlights the field, both checkout routes refuse it
with `participantBirthdateError`, and the admin runner edit refuses it (its
modal now picks it with `AdminDatePicker`, capped at today). **Batch 3**
asks for guardian consent: a runner 12 or under on race day gets a
*Parent/Guardian Consent* panel in their card (`register/GuardianConsent.tsx`:
name, `SelectField` relationship, a tick naming the child), step 1 validation
owes all three, both checkout routes refuse an order missing them
(`participantGuardianError`) and write `Runner.guardianName` /
`guardianRelationship` / `guardianConsentAt` through `storedGuardianConsent`.
Migration `20260919120000_runner_guardian_consent` adds the three nullable
columns — **run `npx prisma migrate deploy` against production when this is
promoted to `main`**. **Batch 4** lets organizers see it (§6, registrants):
a *Minor* chip, the Parent/Guardian Consent block in the detail modal (amber
*No guardian consent on file* for a minor without it), the printable sheet at
`/admin/events/[id]/registrants/[runnerId]/consent`, three CSV columns, an
*Age → Minors* filter, guardian fields in the runner edit (warns, never
blocks; audited as sensitive), and the guardian in both registration emails.

**The dashboard has a Dark Mode switch and a complete light theme**
(2026-09-18, on `dev`, uncommitted). The account menu's switch works and
persists (`dash_theme`, §6), and **all three batches of `LIGHT_THEME_PLAN.md`
have landed**: the palette is tokens (§9); `Admin.css`, the shared table
primitives, modals, bell and toasts read them; and every dashboard page's TSX
has been swept onto them, with brand-coloured words on the new
`--accent-*-ink` pair and status words on `--status-*`. The plan file is now
kept only for its reasoning and its list of deliberate literals. `--bg-dark` is
finally defined (the collapse knob's ring is back), the duplicate
`.action-dropdown-item` rules are merged, and the date pickers and chevrons
follow the theme. `Auth.css`'s field rules are scoped to `.auth-container`:
the dashboard loads that file through `admin/loading.tsx`, and its unscoped
`.form-input` was stripping the border off dashboard fields (it read an
undefined `--color-border`) and painting them grey on the light theme. **A
stylesheet imported anywhere under `/admin` reaches every dashboard page**, so
its generic class names must be scoped to the page they belong to. The
sign-in, register and invite pages stay dark by decision. No schema change.

**Settings is grouped into four pages** (2026-09-18, on `dev`, uncommitted):
Profile, Security, Site Settings and Your Access, listed in the account menu in
place of its single Settings row (§6). No schema change.

**Settings got its panels** (2026-09-18, on `dev`, uncommitted): profile
photo, phone for staff, email change behind the current password, sign-in
activity and the read-only role panels (§6). **Carries a migration,
`20260918100000_account_avatar`** (`avatarUrl` on Organizer and StaffAccount) —
applied to `local-dev`; **releasing it needs `npx prisma migrate deploy` against
production**, and a running `next dev` must be restarted after `prisma generate`
or every dashboard page fails on the unknown field. **What is left is tracked
in `SETTINGS_PLAN.md`**; all four batches have landed, and only 2FA
(on hold) remains.

**Social links are a setting** (2026-09-18, Settings Batch 2, on `dev`,
uncommitted): the Social Links panel on `/admin/settings`, four nullable columns
on `SiteSettings`, and a footer that shows only the channels with a saved link
(none saved → the whole "Follow the community" block is hidden). **Carries a
migration, `20260918110000_site_social_links`; releasing it needs
`npx prisma migrate deploy` against production.**
**Two-factor sign-in is on hold** by the owner's call.

**Everyone can sign out their other devices** (2026-09-18, Settings Batch 3, on
`dev`, uncommitted): Sign-in Activity on `/admin/settings` now shows for the
owner too, with a **Sign out other devices** button (`admin/profile/sessions`);
the owner's sessions are checked against `Organizer.sessionsValidFrom`, the
owner's sign-in is recorded (`lastLoginAt`, also on the Team table), and an
owner password change ends the owner's other sessions like a staff one does.
**Carries a migration, `20260918120000_organizer_sessions`; releasing it needs
`npx prisma migrate deploy` against production** — without it every owner
request fails on the unknown column and Run As One is locked out of its own
dashboard, so run the migration *before* promoting `dev` to `main`.

**The default platform fee is a setting** (2026-09-18, Settings Batch 4, on
`dev`, uncommitted): the Super Admin's Default Platform Fee panel on
`/admin/settings` writes `Organizer.adminFee` (no longer a dead column) through
`admin/platform-fee`, and the create-event form starts from it. It only affects
new events. **No migration.**

**The dashboard has notifications** (2026-09-18, on `dev`, uncommitted): the
header bell and its modal (§6), fed by `notification-store.ts` (§5) through
`admin/notifications` — derived from existing rows, no schema change, no
migration. Read state is per browser. Not yet a notification: remittances owed
on a finished race (it has no instant of its own to be "new" at), and no
screen deep-links to one client, club or feedback message yet, so those three
open their list.

**The account lives in the header** (2026-09-18, on `dev`, uncommitted): the
sidebar's user block and its Settings and Log Out rows moved into
`AccountMenu` beside the bell (§6), so the sidebar is the pages alone.

**Every admin table filters through one Filters chip** (2026-09-17, on `dev`,
uncommitted): `FiltersMenu` was lifted out of the events list and now carries
the filters of registrants (its `sm`-up per-column chips are gone), results (its
private `FilterOptions` copy is gone), clients, feedback and remittances (their
`FilterChip` rows, and the component, are gone) and activity (its four
`AdminSelect` pickers became sheet groups, and Person / Event / Activity became
many-valued in `lib/activity.ts` and `activity-store.ts`). Screens with no
filter (marketing, team, communities, a race's settlement) were left as they
are. No migration.

**`ADMIN_MERGE_PLAN.md` is the active queue — Batches 1–5 have landed on `dev` (2026-09-17); nothing is released to production yet.**
The owner decided there is no super admin any more: one dashboard at `/admin`,
run by Run As One staff, who create every event and validate every payment;
runners' money goes to Run As One, which remits to the organizer. An organizer
becomes a **Viewer** that sees only its events and registrant counts. The
application form stays (password removed) and feeds a submissions list with a
**Send invite** instead of approve/reject. The organizer owner account that
signs in today **is Run As One's own account**, so its row stays the one tenant
and a new `Client` record is added. Six batches, the last being remittance
tracking. **Read the plan's Status table before touching `/admin`,
`actor.ts`, `permissions.ts` or the `Organizer` model**, and
tick it as work lands. **Batch 1:** the production
audit confirmed Run As One's row is `seed-crc-organizer` ("Cresendo Running
Community", `cresendorunningcommunity@gmail.com`, owner of all four events,
every promotion and both staff memberships), and the owner confirmed that
"System Owner" (the `SUPER_ADMIN` row), "Super Admin Test" and "Test" are test
accounts; the `Client` model, `Event.clientId`, `StaffMembership.clientId`,
the `VIEWER` membership role, `lib/client.ts` and the viewer scoping in
`actor.ts` are in, verified on localhost (plan's Batch 1 notes). Migration
`20260917120000_clients_and_viewer_role` is on `local-dev`; **run `npx prisma
migrate deploy` against production when this is released** — until then a
production build of this code fails every staff sign-in, because `getActor()`
selects the new column. Nothing a
viewer sees exists yet. **Batch 2 (one shell):** `/superadmin` is gone — its
Organizers, Communities and Feedback screens are `/admin/organizers`,
`/admin/communities` and `/admin/feedback` behind the new `platform:manage`
permission (owner and admin), their routes moved to `/api/admin/*` behind
`platformActor()`, its Activity merged into `/admin/activity` (an *Organizer
decisions* shelf; the scope split is gone), and its dashboard became the
Overview's *Platform Fees Collected* tile — the owner's two calls. Every old
`/superadmin` URL is a permanent redirect (`next.config.ts`), `proxy.ts` sends
nobody to a second dashboard, and `SuperAdminShell`, `OrganizerSwitcher` and
`api/auth/switch-organizer` are deleted (the audit showed one tenant). No
migration. Verified on localhost at 360 / 767 / 820 / 1280 with throwaway
`local-dev` accounts (plan's Batch 2 notes). **Batch 3 (submissions and Send
invite):** the application form has no password and writes a `Client`
submission; `/admin/organizers` became `/admin/clients` (chips, the application
panel with a Sign-ins section, Send / Resend invite, Archive / Restore) and
redirects there; Send invite makes a `VIEWER` membership through the team
invite machinery with its own email and accept-page wording, and acceptance
makes the client ACTIVE; the event forms gained a Client picker for
`platform:manage`; `RejectDialog` and the approve / reject / suspend UI are
deleted, and so is `SUPERADMIN_APPLICATIONS_PLAN.md`. No migration. Verified on
localhost with throwaway `local-dev` rows (plan's Batch 3 notes). **Then, at the owner's word, on `local-dev` only:**
Run As One's row signs in as `runasoneph@gmail.com`, named "Run As One" and
labelled **Super Admin**; Cresendo Running Community
(`cresendorunningcommunity@gmail.com`) is a client with all four events linked
and an invite sent — **production needs the same at release** (plan's notes).
**Batch 4 (the Viewer dashboard):** a viewer's `/admin` is *Your Events* —
count tiles and one card per race with its total, paid vs pending and
per-category counts, no money (`client-summary.ts`, `ViewerDashboard.tsx`); its
sidebar is Dashboard and Settings; every team screen answers it with the
designed *Not Part of Your View* page through `requireTeamActor()` /
`forbidden()` (`experimental.authInterrupts` turned on); an archived client's
viewer gets client wording at sign-in. No migration. Verified on localhost with
throwaway `local-dev` rows (plan's Batch 4 notes). **Batch 5 (link, retire,
clean up):** the `SUPER_ADMIN` session kind, `SUPER_ADMIN_REACH`, every super
admin branch, the `admin/organizers` routes, the decision emails, the approval
parts of `organizer-status.ts` and the `seed.ts` / `seed-superadmin.ts` scripts
are gone; **owner sign-in is pinned to Run As One's row**
(`RUN_AS_ONE_ORGANIZER_ID`) at login, in `jwt.ts` and in `getActor()`, because
production's "Super Admin Test" row was `APPROVED` and would otherwise have
become a Super Admin. Migration `20260917180000_retire_super_admin` deletes the
two test rows by id and drops the Organizer application and decision columns.
**Production is four migrations behind `dev`** (Batch 1's three and Batch 5's);
the release order — `migrate deploy` first, then the in-app data steps, then
`main` — is the checklist in the plan's Batch 5 notes. **Batch 6 (remittance
tracking) is built on `dev`, ahead of that release at the owner's request:**
`/admin/remittances` and its per-race settlement page, the `Remittance` model
(migration `20260917200000_remittances`, additive — production then needs
**five** migrations), `settlement.ts` / `settlement-store.ts`, the
`remittance:manage` permission, three API routes, three trail verbs on a
*Remittances* Activity shelf, and an event DELETE that refuses a race with
remittances. The owner's calls: Run As One keeps the platform and transaction
fees, the organizer absorbs discounts, per event, a refund makes the balance
go negative, and a viewer sees no settlement. See the plan's Batch 6 notes for
what was verified.

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

**`SUPERADMIN_APPLICATIONS_PLAN.md` is deleted** (`ADMIN_MERGE_PLAN.md` Batch
3). Its four landed batches built the application panel, the `REJECTED` status
with its reason (`statusNote`, `statusChangedAt` — migration
`20260916120000_organizer_status_decision`, which production needs at release),
the decision emails and the `organizer.*` trail rows; its optional Batches 5–6
extended the approval screen that Batch 3 replaced with `/admin/clients`. The
panel lives on there; the columns, routes and emails were removed in
`ADMIN_MERGE_PLAN.md` Batch 5 (the `organizer.*` verbs stay for old rows).

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
The club rename opens as a full-width `AdminCardEdit` block on
the card (the admin fee's went with the fee editor), a feedback card opens its message through a "Read message" accordion
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

- The **admin email and the social links are settings** (`/admin/settings`,
  `SiteSettings`). Until somebody saves a link, the footer shows **no** social
  icons. **Releasing them needs `npx prisma migrate deploy` against
  production** for `20260918090000_site_settings` and
  `20260918110000_site_social_links`.
- **Owner sessions can be ended** (`SETTINGS_PLAN.md` Batch 3). **Releasing it
  needs `npx prisma migrate deploy` against production** for
  `20260918120000_organizer_sessions`, before the code reaches `main`.
- PayMongo runs in **test mode**.
- Registration emails send via **Resend** from the admin email when it is on
  `@cresendorunningcommunity.com`, else from
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
  and their rows deleted (the first two came back per runner in 2026-09 — see
  `MARKETING_DISCOUNTS_PLAN.md` above); receipts are unaffected, because `promoCode` and
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

