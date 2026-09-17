# One dashboard: merging Admin and Super Admin — work plan

**Status:** No batch started · **Owner decisions captured:** 2026-09-17

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
| 1 | Production audit (read-only), `Client` model, Viewer role, permissions | yes | Not started |
| 2 | One shell: `/superadmin` screens move into `/admin`, redirects, role-aware sidebar | none | Not started |
| 3 | Applications become client submissions — no password, **Send invite** | maybe small | Not started |
| 4 | The Viewer dashboard — events and registrant counts | none | Not started |
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

- [ ] **Read-only production audit** (no writes). List for the owner:
  - every `Organizer` row: id, name, email, `role`, `status`, event count,
    promo count, membership count;
  - every `StaffAccount` with its memberships (organizer, role, accepted,
    suspended) and event assignments;
  - every `Event`: title, `organizerId`, date, registration counts by status.
- [ ] Confirm with the owner: Run As One's row id, what the `SUPER_ADMIN`
  account is (same person? retire?), and that no other organizer owns live
  events. **Stop and ask if the audit disagrees with the design above.**
- [ ] Schema: `Client`, `Event.clientId`, `StaffMembership.clientId`
  (all additive, nullable). Migration copies each applicant `Organizer` row
  (not Run As One's, not the super admin's) into a `Client` row — a copy, the
  original rows stay until Batch 5.
- [ ] `permissions.ts`: `VIEWER` membership role, its one permission, labels
  and hints; `asMembershipRole` accepts it.
- [ ] `actor.ts`: a Viewer's `clientId` on the actor; `reachableEvents` scopes a
  Viewer to its client; `can()` refuses a Viewer everything else.
- [ ] `lib/client.ts` (or extend `organizer-application.ts`): the rule module for
  client status and moves.
- [ ] Run the migration on the **dev** branch only; verify existing staff and
  owner sign-ins are unchanged.
- [ ] `PROJECT_GUIDE.md` §4, §5, §7, §10.

**Done when:** the owner and staff see no difference, the new tables exist on
dev, and a hand-made Viewer membership reaches only its client's events.

## Batch 2 — One shell

- [ ] Move `/superadmin/communities`, `/superadmin/feedback` and the platform
  activity into `/admin` (staff with `ADMIN`/`OWNER` only). Keep one Activity
  screen; decide with the owner whether the platform trail merges into it.
- [ ] `/superadmin/organizers` is replaced in Batch 3; until then it stays
  reachable from the new sidebar.
- [ ] `/superadmin/**` → permanent redirect to the matching `/admin` URL (no
  dead links); `proxy.ts` stops sending anyone to `/superadmin`.
- [ ] One sidebar (`dashboard-sidebar.ts`, `DashboardShell`) filtered by
  permission. Remove `SuperAdminShell`. Review `OrganizerSwitcher` — with one
  tenant it has nothing to switch; remove it if the audit confirms that.
- [ ] Mobile check of every moved screen.
- [ ] `PROJECT_GUIDE.md` §3, §6, §7, §10.

**Done when:** every former super admin screen works under `/admin`, old URLs
redirect, and nothing links to `/superadmin`.

## Batch 3 — Submissions and Send invite

- [ ] `/admin/register`: remove **password and confirm password** only. Every
  other field and step stays. Update copy that promised an approval.
- [ ] `api/auth/register` → creates a `Client` (`NEW`), no account, no session,
  no email. Still refuses a duplicate email per field.
- [ ] `/admin/clients` (staff): the submissions list — chips by status, row opens
  the application panel (reuse `ApplicationPanel`), cards below `lg`.
- [ ] **Send invite** / **Resend invite** on a client: creates the Viewer
  `StaffAccount` + membership with `clientId` through the team invite machinery
  (`readInvitee`, hashed token, `auth/invite/[token]`), writes the trail, reports
  `emailSent` like the team invite. Client → `INVITED`, then `ACTIVE` on accept.
- [ ] Archive a submission (status only, never a delete).
- [ ] Invite email copy for a client viewer (not the staff invite wording).
- [ ] Event create/edit form: **Client** picker (`AdminSelect`), optional.
- [ ] Remove approve / reject / suspend UI and `RejectDialog` from the screens.
  (Routes and columns are removed in Batch 5.)
- [ ] Delete `SUPERADMIN_APPLICATIONS_PLAN.md` — its optional Batches 5–6
  extend a screen this batch replaces.
- [ ] `PROJECT_GUIDE.md` §1, §6, §7, §10.

**Done when:** a new application appears in the list without a password, Send
invite delivers a link, and accepting it signs the person in as a Viewer.

## Batch 4 — The Viewer dashboard

- [ ] A Viewer's `/admin` is its own page: its client's events as cards (poster,
  title, date, status — draft / open / paused / done).
- [ ] Per event: **registrant count** — total, per category, **Paid vs Pending**.
  No money, no names, no runner list.
- [ ] Sidebar for a Viewer: Dashboard and Account settings (own password) only.
- [ ] Every other `/admin/**` page and `/api/admin/**` route refuses a Viewer
  (server check, not hidden links); verify by URL.
- [ ] Empty state for a Viewer whose client has no linked event yet.
- [ ] Loading shape and mobile layout.
- [ ] `PROJECT_GUIDE.md` §6, §7, §10.

**Done when:** a Viewer sees exactly their client's counts and gets a real
not-allowed page everywhere else.

## Batch 5 — Link, retire, clean up, release

- [ ] Staff link existing live events to their clients through the event form
  (one event at a time, the owner confirming each). No registration row changes.
- [ ] Retire the `SUPER_ADMIN` account as decided in Batch 1 (sign-in refused,
  row kept unless the owner says otherwise).
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

_None yet. Add "Batch N — what landed" here as each batch finishes._
