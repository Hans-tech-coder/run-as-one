# One dashboard: merging Admin and Super Admin — work plan

**Status:** Batches 1–4 landed · Batch 5 next · **Owner decisions captured:** 2026-09-17

Run As One is no longer a self-serve platform for organizers. **Run As One staff
create every event and validate every payment**, and runners' money goes to Run
As One, which settles with the organizer afterwards. So there is no separate
super admin any more: there is **one dashboard at `/admin`**, run by Run As One
staff, and an organizer who signs in is a **Viewer** who sees only that their
events exist and how many runners have registered.

Written the way `STAFF_ACCESS_PLAN.md` was: **one batch per session**, in order,
each batch landing whole and verified before the next starts. **Update the Status
table and the checkboxes as work lands** — a new session reads this table first
to know where to pick up.

---

## Status

| Batch | Laman | Migration | Status |
| --- | --- | --- | --- |
| 1 | Production audit (read-only), `Client` model, Viewer role, permissions | yes | Landed (dev) — prod migration at release |
| 2 | One shell: `/superadmin` screens move into `/admin`, redirects, role-aware sidebar | none | Landed (dev) |
| 3 | Applications become client submissions — no password, **Send invite** | none | Landed (dev) |
| 4 | The Viewer dashboard — events and registrant counts | none | Landed (dev) |
| 5 | Link existing events to clients, retire the super admin, remove dead code, release | yes (cleanup) | Not started |
| 6 | Remittance / settlement tracking (Run As One → organizer) | yes | Not started |

When a batch lands, change its Status to *Landed* and add a short
**"Batch N — what landed"** note under [Batch notes](#batch-notes): the calls made
along the way, anything deferred, and the migration name. Keep the notes short;
the reasoning that outlives the plan goes into `PROJECT_GUIDE.md`.

---

## Decisions already made (do not re-ask)

| Question | Answer |
| --- | --- |
| Is there still a super admin? | **No.** One dashboard, `/admin`. `/superadmin/**` redirects to its new home. |
| Who creates events and validates payments? | **Run As One staff.** |
| What does an organizer see? | **Viewer:** their events and the **registrant count** only (total, per category, Paid vs Pending). No revenue, no runner list, no editing. |
| Does the *Apply as an Organizer* form stay? | **Yes.** Only the **password and confirm password** are removed for now; every other field stays. |
| Is an application approved or rejected? | **No.** Submissions collect in a list. A staff member presses **Send invite** when ready → email → the applicant sets a password → Viewer. Nothing is sent automatically on submit. |
| Who receives runners' payments? | **Run As One.** Run As One then remits to the organizer. |
| Bank accounts? | **Still entered per event**, as today. No platform-wide bank settings. |
| The team members invited today through `/admin/team`? | **They are Run As One staff.** They keep their access. |
| The organizer owner account that signs in today? | **It is Run As One's own admin account** — the real owner of Run As One, not a client. |
| Remittance tracking? | **Yes, as the last batch (6)**, after the merge is done. |
| Does the platform trail merge into `/admin/activity`? (Batch 2) | **Yes — one Activity screen**, with an *Organizer decisions* shelf. |
| What happens to the `/superadmin` dashboard? (Batch 2) | **It redirects to `/admin`**, and owners and admins get a *Platform Fees Collected* tile. Total Organizers is not carried over (clients replace it in Batch 3). |
| Which account is Run As One's? (Batch 1) | **The `seed-crc-organizer` row.** It signed in as `cresendorunningcommunity@gmail.com` as "Cresendo Running Community" until the owner's call below. |
| Run As One's login and name? (after Batch 3) | **`runasoneph@gmail.com`, named "Run As One"**, and its role reads **Super Admin**, not Owner (`ROLE_LABELS.OWNER`). **Cresendo Running Community (`cresendorunningcommunity@gmail.com`) is a client**, invited as a viewer, with all four live events linked to it. Done on `local-dev` 2026-09-17; **production needs the same at release.** |
| Who is "System Owner" (`SUPER_ADMIN`)? (Batch 1) | **A test super admin account, not a real person's.** Nobody depends on it; retire it in Batch 5. |
| "Super Admin Test" and "Test"? (Batch 1) | **Test accounts.** Their copied `Client` rows (both `ARCHIVED`) are test data too. |

---

## The design, in one page

### Run As One's organizer row becomes the one tenant

The owner account that signs in today *is* Run As One. Its `Organizer` row
already owns the live events (Pink Run 2026 included), every existing
`StaffMembership` points at it, and its audit trail is Run As One's history. So
the tenant **does not move**:

- `actor.orgId` stays Run As One's organizer id for every staff session.
- The owner keeps signing in exactly as today, as `OWNER`.
- Existing staff keep their memberships, roles and event assignments unchanged.
- **No `Event`, `Registration` or `Runner` row is rewritten** by this plan. The
  live PENDING orders are real (see the pinned memory); nothing here touches them.

This is the smallest change that fits the owner's answers: `actor.ts`,
`reachableEvents` and the audit trail keep their current tenant logic, and the
work is *adding* a client concept rather than re-plumbing reach across tenants.

> **Confirm in Batch 1, after the audit.** If the audit shows another `APPROVED`
> organizer that owns real events, stop and ask before going further — the
> single-tenant design assumes Run As One's row owns every live event.

### A client is a new, small record

```
Client            the organization a race is run for (from the application)
  id, name, email, status (NEW | INVITED | ACTIVE | ARCHIVED)
  + the application columns the form collects today (orgType, contact name
    and role, phone, city, province, website, experience, services, first
    event name/date/location, expected runners, note)
  createdAt, invitedAt, updatedAt

Event.clientId    String?   which client this race is for (null = not linked yet)

StaffMembership.clientId  String?   set only on a VIEWER membership
```

- A **Viewer** is a `StaffAccount` with a `StaffMembership` on Run As One's
  tenant, `role = 'VIEWER'`, and `clientId` set. That reuses the invite token,
  accept page, resend, suspend and remove that `/admin/team` already has.
- `MEMBERSHIP_ROLES` gains `VIEWER`. `permissions.ts` gives it one permission
  (e.g. `event:view-summary`), and `reachableEvents` for a Viewer is
  `{ organizerId: orgId, clientId: membership.clientId }`.
- A Viewer's sign-in lands on the Viewer dashboard (Batch 4), never on staff
  screens; server pages **and** API routes check it, not just the sidebar.
- Storage: a few short-text columns on tables of tens of rows. Not a storage
  decision on the Neon free tier.

### Staff roles

Unchanged in meaning, now read as Run As One roles: **OWNER** (the owner
account), **ADMIN** (every event, manages team), **STAFF** with per-event
**EVENT_MANAGER / VALIDATOR / ENCODER / VIEWER** assignments. `SUPER_ADMIN_REACH`
and every `role === 'SUPER_ADMIN'` branch go away in Batch 5.

---

## Rules that apply to every batch

From `PROJECT_GUIDE.md`; not repeated inside each batch.

- **Read `PROJECT_GUIDE.md` first**, and the Next.js docs in
  `node_modules/next/dist/docs/` before Next-specific code.
- **Production data is real.** No delete, cancel or bulk update of registration,
  runner or organizer rows without the owner naming the rows. Audit first, show
  the rows, then act. Status transitions, never hard deletes of real orders.
- **Mobile ships in the same batch**: usable at 360px, tables become cards below
  `lg` (`AdminCardList`), no horizontal scroll, the same collapsible sidebar on
  a phone.
- **No browser defaults**; copy an existing control (`AdminSelect`, `AlertModal`,
  `FieldError`, `.btn-secondary`). Admin buttons use the outline style.
- **Validation names the field** that is wrong; never a catch-all.
- **Loading states draw the page shape** (`RunnerLoader` only).
- **No dead links**: every moved URL redirects to a real page.
- **`PROJECT_GUIDE.md` is updated in the same change.**
- **Nothing is committed or pushed** until the owner says so. Work lands on
  `dev`; `main` only on an explicit deploy instruction.
- **A batch with a migration needs `npx prisma migrate deploy` against
  production by hand at release** — dev and prod are separate Neon branches.
- **One batch per session.** Stop after the batch and report.

---

## Batch 1 — Audit, `Client` model, Viewer role

- [x] **Read-only production audit** (no writes). List for the owner:
  - every `Organizer` row: id, name, email, `role`, `status`, event count,
    promo count, membership count;
  - every `StaffAccount` with its memberships (organizer, role, accepted,
    suspended) and event assignments;
  - every `Event`: title, `organizerId`, date, registration counts by status.
- [x] Confirm with the owner: Run As One's row id, what the `SUPER_ADMIN`
  account is (same person? retire?), and that no other organizer owns live
  events. **Stop and ask if the audit disagrees with the design above.**
- [x] Schema: `Client`, `Event.clientId`, `StaffMembership.clientId`
  (all additive, nullable). Migration copies each applicant `Organizer` row
  (not Run As One's, not the super admin's) into a `Client` row — a copy, the
  original rows stay until Batch 5.
- [x] `permissions.ts`: `VIEWER` membership role, its one permission, labels
  and hints; `asMembershipRole` accepts it.
- [x] `actor.ts`: a Viewer's `clientId` on the actor; `reachableEvents` scopes a
  Viewer to its client; `can()` refuses a Viewer everything else.
- [x] `lib/client.ts` (or extend `organizer-application.ts`): the rule module for
  client status and moves.
- [x] Run the migration on the **dev** branch only; verify existing staff and
  owner sign-ins are unchanged.
- [x] `PROJECT_GUIDE.md` §4, §5, §7, §10.

**Done when:** the owner and staff see no difference, the new tables exist on
dev, and a hand-made Viewer membership reaches only its client's events.

## Batch 2 — One shell

- [x] Move `/superadmin/communities`, `/superadmin/feedback` and the platform
  activity into `/admin` (staff with `ADMIN`/`OWNER` only). Keep one Activity
  screen; decide with the owner whether the platform trail merges into it.
- [x] `/superadmin/organizers` is replaced in Batch 3; until then it stays
  reachable from the new sidebar.
- [x] `/superadmin/**` → permanent redirect to the matching `/admin` URL (no
  dead links); `proxy.ts` stops sending anyone to `/superadmin`.
- [x] One sidebar (`dashboard-sidebar.ts`, `DashboardShell`) filtered by
  permission. Remove `SuperAdminShell`. Review `OrganizerSwitcher` — with one
  tenant it has nothing to switch; remove it if the audit confirms that.
- [x] Mobile check of every moved screen.
- [x] `PROJECT_GUIDE.md` §3, §6, §7, §10.

**Done when:** every former super admin screen works under `/admin`, old URLs
redirect, and nothing links to `/superadmin`.

## Batch 3 — Submissions and Send invite

- [x] `/admin/register`: remove **password and confirm password** only. Every
  other field and step stays. Update copy that promised an approval.
- [x] `api/auth/register` → creates a `Client` (`NEW`), no account, no session,
  no email. Still refuses a duplicate email per field.
- [x] `/admin/clients` (staff): the submissions list — chips by status, row opens
  the application panel (reuse `ApplicationPanel`), cards below `lg`.
- [x] **Send invite** / **Resend invite** on a client: creates the Viewer
  `StaffAccount` + membership with `clientId` through the team invite machinery
  (`readInvitee`, hashed token, `auth/invite/[token]`), writes the trail, reports
  `emailSent` like the team invite. Client → `INVITED`, then `ACTIVE` on accept.
- [x] Archive a submission (status only, never a delete).
- [x] Invite email copy for a client viewer (not the staff invite wording).
- [x] Event create/edit form: **Client** picker (`AdminSelect`), optional.
- [x] Remove approve / reject / suspend UI and `RejectDialog` from the screens.
  (Routes and columns are removed in Batch 5.)
- [x] Delete `SUPERADMIN_APPLICATIONS_PLAN.md` — its optional Batches 5–6
  extend a screen this batch replaces.
- [x] `PROJECT_GUIDE.md` §1, §6, §7, §10.

**Done when:** a new application appears in the list without a password, Send
invite delivers a link, and accepting it signs the person in as a Viewer.

## Batch 4 — The Viewer dashboard

- [x] A Viewer's `/admin` is its own page: its client's events as cards (poster,
  title, date, status — draft / open / paused / done).
- [x] Per event: **registrant count** — total, per category, **Paid vs Pending**.
  No money, no names, no runner list.
- [x] Sidebar for a Viewer: Dashboard and Account settings (own password) only.
- [x] Every other `/admin/**` page and `/api/admin/**` route refuses a Viewer
  (server check, not hidden links); verify by URL.
- [x] Empty state for a Viewer whose client has no linked event yet.
- [x] Loading shape and mobile layout.
- [x] `PROJECT_GUIDE.md` §6, §7, §10.

**Done when:** a Viewer sees exactly their client's counts and gets a real
not-allowed page everywhere else.

## Batch 5 — Link, retire, clean up, release

- [ ] Staff link existing live events to their clients through the event form
  (one event at a time, the owner confirming each). No registration row changes.
- [ ] Retire the `SUPER_ADMIN` account as decided in Batch 1: "System Owner" is
  a **test** account, so sign-in is refused; the row, and the test clients
  "Super Admin Test" and "Test" with their Organizer originals, may be removed
  only once the owner confirms the exact rows at that point (re-audit
  production first — it may hold rows `local-dev` did not).
- [ ] Remove `SUPER_ADMIN_REACH`, `role === 'SUPER_ADMIN'` branches,
  `superadmin/organizers` routes, decision emails, `organizer-status.ts` parts
  that only served approval, and the `/superadmin` folder (redirects stay).
- [ ] Only after the owner confirms: migration dropping the copied application
  columns and the applicant `Organizer` rows that became clients.
- [ ] Release checklist: fast-forward `main` onto `dev` on the owner's word, then
  `npx prisma migrate deploy` against production for Batches 1, 3 (if any) and 5.
- [ ] `PROJECT_GUIDE.md` rewritten where it still describes a super admin (§1,
  §6, §7, §10).

**Done when:** no code path mentions a super admin, production runs the merged
dashboard, and every live event shows under its client.

## Batch 6 — Remittance / settlement tracking

Runners pay Run As One; Run As One remits to the organizer. This batch records
what is owed and what was paid.

**Ask the owner before building:**
- [ ] What Run As One keeps: the per-runner `Event.adminFee` only, or also a
  percentage, and who absorbs PayMongo's fees?
- [ ] Is a remittance per event, or per client across events?
- [ ] Only `PAID` registrations count — confirm how a later `REFUNDED` after a
  remittance is handled (negative adjustment on the next one?).
- [ ] Does the Viewer see the settlement (the owner's current answer is counts
  only, so the default is **no**)?

**Build (after the answers):**
- [ ] A settlement rule module in `src/lib` (Prisma-free, integer centavos like
  the rest of the money code): gross collected, Run As One's share, net owed,
  total remitted, balance.
- [ ] `Remittance` model: client, event (if per event), amount, paid date, method,
  reference, note, optional proof (private blob), recorded by, created at.
  Corrections are new rows or a status, never edits that erase history.
- [ ] Staff screen (`OWNER`/`ADMIN`, new `remittance:manage` permission):
  per event/client — collected, share, owed, remitted, balance; record a
  remittance; list with cards below `lg`.
- [ ] Every remittance written to the audit trail in the same transaction.
- [ ] `PROJECT_GUIDE.md` §4, §5, §6, §7, §10.

**Done when:** for any event the owner can see how much is owed to the organizer,
record a payout, and see the balance reach zero.

---

## Interaction with other plans

- **`SUPERADMIN_APPLICATIONS_PLAN.md`** — superseded. Its landed work (the
  application panel, the audit rows) is reused; its optional Batches 5–6 are
  dropped. Delete the file in Batch 3.
- **`STAFF_ACCESS_PLAN.md`** — still valid. Batch 4 (TOTP) now protects Run As
  One staff and can run any time after this plan's Batch 2; a Viewer does not
  need two-factor since it can change nothing.

## Batch notes

### Batch 1 — what landed

**Audit (2026-09-17).** Events, registrations and staff were read on production;
the `Organizer` listing was read on `local-dev` (a production copy) because the
production read of that table was refused by the session's permissions —
**re-run it on production before release** to catch applications submitted
since the branch was last reset.
- Organizers: `seed-crc-organizer` "Cresendo Running Community" — ORGANIZER,
  APPROVED, 4 events, 5 promos, 2 memberships (**Run As One's row**);
  "System Owner" — SUPER_ADMIN, APPROVED, owns nothing; "Super Admin Test" —
  ORGANIZER, SUSPENDED, owns nothing, no application; "Test" — ORGANIZER,
  REJECTED, owns nothing, has an application.
- Staff: Pik (ADMIN) and Kyla (STAFF, Validator on Pink Run 2026), both on
  Run As One's row, accepted, not suspended.
- Events, all on `seed-crc-organizer`: Cresendo In Motion 2026 (no orders),
  BizRun V2.0 (none), **Pink Run 2026 (16 PAID, 3 PENDING)**, **Run and
  Reachout 2026 (2 PENDING)**.
- The audit agrees with the design: no other organizer owns an event.

**Calls made.**
- `MEMBERSHIP_ROLES` gained `VIEWER`, but the team code now reads a separate
  `TEAM_ROLES` (`ADMIN`, `STAFF`) so a viewer is never listed, offered or
  manageable on `/admin/team`; `loadManagedMember` answers a viewer's membership
  id with "Team member not found."
- The viewer's permission is `event:view-summary`. Every staff role holds it
  too, and `MATRIX_PERMISSIONS` keeps it off the team screen's role table.
- `can()` for a viewer needs the event's `clientId` in `reach` — fail closed.
- Viewers sign in only while their client is `ACTIVE` (`clientViewersCanSignIn`),
  checked in `getActor()` and in `activeMembershipWhere`.
- The migration copies applicants **by what they hold** (ORGANIZER role, no
  event/promo/membership) with the **same id**; REJECTED/SUSPENDED → `ARCHIVED`,
  else `NEW`. On today's data that is "Super Admin Test" (ARCHIVED) and
  "Test" (ARCHIVED).

**Still open in this batch.**
- ~~Dev migration and verification~~ — done, see below.
- ~~The owner's questions~~ — answered 2026-09-17 and moved to *Decisions
  already made*: Run As One is `cresendorunningcommunity@gmail.com`
  (`seed-crc-organizer`); "System Owner", "Super Admin Test" and "Test" are all
  test accounts.

Migration: `20260917120000_clients_and_viewer_role` — applied to `local-dev`
by the owner; copied "Super Admin Test" and "Test" as `ARCHIVED` clients.

**Verified on localhost (2026-09-17)** with throwaway `verify-b1-*` rows on
`local-dev`, signing in through `/api/auth/login`, all removed afterwards
(accounts, memberships, client, the event link and their audit rows):
- An owner signs in and sees only its own tenant.
- An ADMIN on Run As One's row sees all four events; `/admin/team` lists the
  team and **not** the viewer.
- A STAFF validator on Pink Run sees Pink Run only (edit API 200 there, 404 on
  BizRun) — unchanged.
- A VIEWER linked to a client that owned BizRun V2.0 signs in (sidebar reads
  "Client Viewer"), sees an empty dashboard and "No events found", gets Page
  Not Found on `/admin/team`, "Event not found" on both events' registrants,
  404 from the event API and 403 creating an event, inviting or making a promo.
  It reaches nothing yet because no screen asks `event:view-summary` — that is
  Batch 4.
- Archiving the client: the viewer's API calls answer 401 on the next request,
  `/admin` sends it to `/admin/login`, and a fresh sign-in is refused.
- The viewer currently sees the dashboard's zero tiles and the Events and
  Settings links — expected until Batches 2 and 4 give it its own page.

### Batch 2 — what landed

**Owner's calls (2026-09-17).** The platform trail **merges** into
`/admin/activity`; the `/superadmin` dashboard **redirects to `/admin`**, which
gains a *Platform Fees Collected* tile for owners and admins.

**Calls made.**
- A new permission, **`platform:manage`** (`OWNER`, `ADMIN`), rather than a role
  check. It gates the Organizers, Communities and Feedback screens, their API
  routes and the fee tile, and it appears as a row on the team screen's role
  table ("Applications, clubs, feedback and fees"). The `ADMIN` hint says so.
- Screens moved to `/admin/organizers`, `/admin/communities`, `/admin/feedback`.
  Each is its old client component (`*Client.tsx`) under a new server
  `page.tsx` that asks `can()` and answers anyone else with the admin 404.
  `/admin/organizers` is a stopgap: Batch 3 replaces it with `/admin/clients`
  and should redirect it there.
- APIs moved to `/api/admin/{organizers,communities,feedback}` behind one guard,
  `api/admin/platform-actor.ts` (401 / 403). The old `/api/superadmin/*` paths
  are gone, not redirected — only these screens called them.
- Redirects are two rules in `next.config.ts` (`/superadmin` → `/admin`,
  `/superadmin/:path*` → `/admin/:path*`, 308). The query string is kept, so a
  filtered activity link keeps its filter. An unknown old path lands on
  `/admin`'s 404 inside the sidebar.
- Activity: `ActivityScope`, `SCOPE_GROUPS` and `ACTIVITY_PATHS` are gone. The one
  screen offers every shelf, *Organizer decisions* included. Decisions made from
  now on land in Run As One's trail, because the deciding staff member's `orgId`
  is Run As One's. The old decisions stay under the "System Owner" test
  account's `orgId`.
- `proxy.ts` only proves a session exists. A `SUPER_ADMIN` session now reaches
  `/admin` as the owner of its own empty tenant — still `platform:manage`, so the
  test account keeps working until Batch 5 retires it.
- `OrganizerSwitcher`, its CSS, `DashboardShell`'s `beforeUser` slot,
  `SignedInUser.organizers` and `api/auth/switch-organizer` are removed. The
  `auth.organizer.switched` audit verb stays, so old rows keep their label.
- The Overview's loading skeleton draws four tiles for `platform:manage`
  through a small context (`admin/dashboard-nav.tsx`) that `AdminShell` provides.
- Not carried over from the super admin dashboard: *Total Organizers*,
  *Transaction Volume* and the *System Overview* text panel.
- At 1280 with the sidebar expanded, the fourth tile wraps to its own row. It is
  the same `auto-fit` grid the super admin dashboard's four tiles used.

**Deferred.** `SUPER_ADMIN_REACH`, the `SUPER_ADMIN` branches in `actor.ts` /
`jwt.ts` / `auth/login`, and the approval routes' approve/reject semantics stay
for Batches 3 and 5. The moved client screens carry their existing lint errors
(`set-state-in-effect`, one `no-explicit-any` in `communities/[id]`) unchanged.

**Verified on localhost (2026-09-17)** with throwaway `verify-b2-*` accounts on
`local-dev` (an ADMIN, and a STAFF validator on Pink Run 2026). They signed in
through `/api/auth/login` and were removed afterwards with their 2 audit rows.
- Every `/superadmin` URL answers 308 to its `/admin` twin, query string kept.
  `/api/superadmin/feedback` is 404, and `/api/admin/feedback` is 401 with no
  session.
- ADMIN: the sidebar lists Dashboard, Events, Marketing Tools, Organizers,
  Communities, Feedback, Team and Activity. The three screens load their data.
  The Overview shows four tiles. `/admin/activity?action=group:organizers`
  applies *All organizer decisions*. All three APIs answer 200.
- STAFF validator: the sidebar is Dashboard and Events. `/admin/feedback` (and
  its `/superadmin` link) is the admin 404 in the sidebar. All three APIs,
  including a PATCH, answer 403. The Overview has three tiles.
- Test super admin ("System Owner"): `/admin`, `/admin/feedback` and
  `/admin/activity` load with no redirect loop, and its feedback API answers 200.
- Overflow script `ok: true` with no offenders on Overview, Organizers,
  Communities and Feedback at 360, on Feedback at 767 and Organizers at 820. The
  rail holds the three extra rows at 360×780. No console errors.
- `npx tsc --noEmit` is clean for `src` (only stale `.next` types failed).

### Batch 3 — what landed

**Calls made.**
- **No migration.** `Client.invitedAt`, `StaffMembership.clientId` and the
  `VIEWER` role from Batch 1 were enough; the trail rows use
  `entityType: 'Client'`, which is text.
- The application form keeps every field; only the two password boxes, their
  rules and `MIN_ORGANIZER_PASSWORD` went. `auth/register` writes a `Client`
  and refuses an address that already signs in **or** already applied.
- `/admin/clients` replaces `/admin/organizers` (both old addresses redirect
  there). With no chip pressed it lists **live** submissions; Archived is its
  own chip. The panel is the old `ApplicationPanel`, moved to `clients/`, with
  *The decision* replaced by **Sign-ins** (each viewer's `memberState` badge).
- **Send invite opens a dialog** (Name, Email) prefilled with the application's
  contact, rather than sending blind, so a second contact or a corrected
  address needs no other screen. A press for a person whose invitation is
  still waiting is the **resend** (new token). New audit verbs:
  `client.invited`, `client.invitation.resent`, `client.invitation.accepted`,
  `client.archived`, `client.restored`, on a new **Clients** Activity shelf.
- **A restored client** lands on NEW while its old accepted sign-in still
  exists. Inviting that same person makes the client ACTIVE again with no
  email (`reactivated`) rather than a dead end.
- Acceptance moves the client INVITED → ACTIVE **inside the claim's
  transaction**, and rolls the claim back if the client moved meanwhile.
- **Linking an event to a client needs `platform:manage`** (`client-store.ts`).
  The picker hides itself for anyone else, and the routes ignore their
  `clientId`.
- Invite page title is now *Accept Your Invitation* for both kinds.

**Deferred.** An archived viewer trying to sign in gets login's existing
*"not part of an active organizer"* sentence; Batch 4 may want client wording.
There is no way to revoke one viewer's sign-in short of archiving the client.
The `admin/organizers` routes, the decision emails and the Organizer
application columns stay for Batch 5.

**Verified on localhost (2026-09-17)** against `local-dev` with throwaway
`verify-b3-*` rows (an ADMIN staff account, one application, its viewer), all
removed afterwards with their 17 audit rows. The invitation email went to
Resend's test sink `delivered+verify-b3@resend.dev`, not a real inbox.
- The form's step 2 has no password; submitting shows the new next steps and
  creates a `NEW` client with no account. A second submission from the same
  address in other casing is refused under the email field.
- `/admin/organizers` and `/superadmin/organizers` answer 308 to
  `/admin/clients`. The sidebar reads Clients.
- Send invite: a bad address is refused under the box; a good one toasts,
  the client goes INVITED and a VIEWER membership exists. The accept page reads
  *Your sign-in for Verify B3 Runners*; accepting signs the viewer in and makes
  the client ACTIVE; the same link then answers 410. The viewer gets 403 from
  `/api/admin/clients` and event create, and the admin 404 on `/admin/clients`.
- Refusals: already signing in for this client, a team member's address, the
  owner organizer's address, blank name and bad email (both fields), a status
  other than archive/restore, archiving twice, inviting an archived client.
- Archive → the viewer's sign-in is refused → restore → inviting the same
  person reactivates the client with no email, and the viewer signs in again.
- The event edit form shows the Client picker (archived test clients hidden),
  links BizRun V2.0 to the client and unlinks it again; both saves wrote
  `event.updated` with `clientId`. BizRun has no client now, as before.
- At 360×780 the Clients cards, the invite dialog (16px boxes) and the panel
  sheet have no horizontal scroll.
- `npx tsc --noEmit` is clean for `src`; eslint is clean on every new file
  (the event routes keep their existing `any` errors).

**Owner's follow-up (2026-09-17, `local-dev` only).** Run As One's row
(`seed-crc-organizer`) now signs in as `runasoneph@gmail.com` and is named "Run
As One" (same password; one `profile.updated` trail row). A `Client` "Cresendo
Running Community" (`cresendorunningcommunity@gmail.com`) was created, all four
events were linked to it (one `event.updated` row each, no registration
touched), and Send invite went to that inbox through the real route
(`client.invited`) — the link points at `localhost:3000`, since invitations
link back to the database they were written into. The OWNER role is labelled
**Super Admin** everywhere it is shown (sidebar, team screen, role table,
Activity's actor kind, the team routes' refusals). **At release, production
needs the same data change** — owner email and name, the client, the four
links, and an invite sent from the live site so its link points there.

### Batch 4 — what landed

**Calls made.**
- **A viewer's `/admin` is *Your Events*** (`admin/ViewerDashboard.tsx`): three
  tiles (Registered Runners, Paid, Pending Payment) over one card per race —
  poster, the events table's registration badge (moved to
  `events/registration-state-badge.ts` so both share it), title, date, place,
  total, a paid / pending bar with the numbers in words beside it, and each
  category's `total · N paid · N pending`. The cards are not links. The plan's
  "draft / open / paused / done" became the badges the app already has (Open,
  Paused, Scheduled with its date, Full, Race Over): there is no draft state on
  an event.
- **The counts live in `lib/client-summary.ts`**, whose returned shape has no
  money, name or reference field. A registrant is a runner on a PAID or
  PENDING order, not removed — the staff Overview's and the slot count's own
  definition. Upcoming races first (soonest), finished ones after.
- **Refusal is `forbidden()`, not a 404.** `requireTeamActor()` (`actor.ts`)
  answers a viewer before the page reads anything, and `admin/forbidden.tsx`
  draws *Not Part of Your View* in the sidebar. That needs
  **`experimental.authInterrupts`** in `next.config.ts`. It is on every team
  page, plus `admin/events/layout.tsx` for the two client-component forms.
  Staff refusals stay the admin's 404. Because `loading.tsx` streams first, the
  403 is in the RSC stream and the status line reads 200, the same as
  `notFound()` does today.
- **API routes needed no change**: every `/api/admin/**` route already refuses
  a viewer through `can()` / `platformActor()` / `loadManagedMember`, which was
  verified route by route (below). `admin/profile` and `admin/profile/password`
  serve it, so Settings keeps name, email and password.
- Sidebar: `nav.events` (false only for a viewer) hides Events; the role line
  names the client (`Client Viewer · Cresendo Running Community`). The loading
  fallback reads the same flag to draw tiles over three event cards.
- **Batch 3's deferral**: an archived client's viewer is now told *"Your
  organization's sign-in is not active right now. Please contact Run As One."*
  at sign-in (same `NO_ACTIVE_ORGANIZER` trail reason).

**Deferred.** Still no way to revoke one viewer short of archiving the client
(Batch 3's note). The viewer's Settings still offers changing the sign-in
email, as it does for staff.

**Verified on localhost (2026-09-17)** against `local-dev` with throwaway
`verify-b4-*` rows — a viewer on the Cresendo Running Community client (all
four events linked), a viewer on a new empty ACTIVE client, and an ADMIN —
signed in through `/api/auth/login` and removed afterwards (3 accounts, their
memberships, 4 audit rows, 1 client). No real row was written.
- Viewer `/admin`: *Your Events*, 43 registered / 39 paid / 4 pending; Pink
  Run 2026 42 (39 · 3), Run and Reachout 2026 1 pending (its 5K), BizRun V2.0
  last as Race Over. Sidebar Dashboard + Settings only. `/admin/settings` loads.
- Viewer on every other screen — events list, new, edit, registrants and
  results (a real id and a made-up id alike), marketing, clients, communities,
  feedback, team, activity: the forbidden boundary (`NEXT_HTTP_ERROR_FALLBACK;403`,
  *Not Part of Your View*). An unknown `/admin/nope` stays the 404.
- Viewer against the API, including a real Pink Run registration and runner:
  event GET 404, PATCH / DELETE / create 403, export and results upload 404,
  registration email 401, status PATCH 401, runner PUT 401, proof 403, promos
  403/404, team 403, clients / options / invite / communities / feedback /
  organizers 403, `api/upload` 403.
- ADMIN: Overview, Events, Team, Clients and Activity load as before, and its
  event and clients APIs answer 200.
- Empty client: tiles at 0 over *No events linked yet* naming the client.
  Archiving that client refused the next sign-in with the client wording.
- Layout from the served HTML at 1440, 820 and 360: no horizontal scroll at
  360 or 820, cards one column on a phone and three at 1440, the loading
  skeleton drew three tiles over event cards.
- `npx tsc --noEmit` is clean for `src`; eslint is clean on every changed file.
