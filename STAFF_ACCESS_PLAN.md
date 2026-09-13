# Staff accounts, per-event access, and the audit trail — work plan

An organizer is a company, not a person. Today it is both: the `Organizer` row
owns the events **and** holds the one email and password everybody on that team
signs in with. So when two staff run two different races under the same
organizer, the app cannot tell them apart, and every validated payment, every
edited runner and every deleted row is recorded as "the organizer did it".

This plan gives each person their own account, scopes what they can reach to the
events they were assigned, and writes an append-only trail of what they did — so
that when something goes wrong on a race day, the question "sino ang gumawa
nito" has an answer that does not depend on anyone's memory.

Written the way `IMPROVEMENTS_PLAN.md` was: **one batch per session**, in order,
each batch landing whole. Update the Status table as they land.

## Status

| Batch | Laman | Migration | Status |
| --- | --- | --- | --- |
| 1 | Schema, `actor.ts` / `permissions.ts` / `audit.ts`, JWT `orgId`, rewire every admin surface, audit the existing actions | yes | Not started |
| 2 | `/admin/team` — invite, roles, event assignments, suspend | small | Not started |
| 3 | `/admin/activity` — the trail, plus inline provenance on the rows | none | Not started |
| 4 | TOTP two-factor, required for anyone who can validate or delete | small | Not started |
| 5 | Optional: Google sign-in, session list, retention sweep | small | Not started |

---

## 1. The decisions, and why

### 1.1 The tenant and the login are separated; the tenant row is not moved

`Organizer` stays exactly what it is — the tenant. It keeps its id, its events,
its `adminFee`, its `status`, and its own email and password, which remain the
**owner's** login. Nothing about an existing organizer changes, and no foreign
key anywhere in the schema is rewritten.

What is added beside it is a person: `StaffAccount`. The rule that comes out of
this, and the one sentence to remember while reading any admin route:

> **Authorisation scopes by `orgId`. Attribution records `actorId`.**

Every place that today asks `event.organizerId !== auth.id` is asking an
authorisation question, so it becomes `!== actor.orgId`. For the owner,
`actor.id === actor.orgId === organizer.id`, which is why the whole rewiring is
invisible until staff exist.

The alternative — one unified `Account` table with the owners migrated into it —
is cleaner on paper and was rejected on purpose. It means rewriting
`Event.organizerId`, `PromoCode.organizerId` and the whole super admin section
against **live production data holding real registrations**, for a gain that is
aesthetic. The shape below is correct where correctness is load-bearing.

### 1.2 A person is separate from their membership

`StaffAccount` is the human being — one row, one email, one password, one set of
recovery codes. `StaffMembership` joins that person to an organizer with a role.

This is deliberately one table more than the obvious design (a `Staff` row
carrying `organizerId` directly). The reason is the race scene itself: a
freelance timer, marshal or finance assistant commonly works for several
organizers in a season. Tied to one organizer, that person needs a second email
address to work a second client's race, and the day that has to be fixed is the
day there is already an audit history pointing at both rows. The join table
costs one table now and prevents that migration entirely.

### 1.3 Access is granted per event, not per organizer, for staff

A membership whose role is `STAFF` sees **nothing** until an event is assigned to
it. `EventAssignment` carries its own role, so the same person can be a
validator on one race and only a viewer on another. `ADMIN` and `OWNER` are
organizer-wide and need no assignments.

### 1.4 The trail is append-only, and the owner cannot edit it

`AuditLog` rows are written inside the same transaction as the change they
describe, and nothing in the app updates or deletes one — not the super admin,
not the owner. A log its subject can rewrite is not evidence. Retention is
time-based only (§4.4), applied by the cron, never by a person.

### 1.5 One person, one credential — otherwise none of this means anything

Staff are added by **invitation**: the owner enters a name and an email, the app
sends a link carrying a single-use token, and the invitee sets their own
password. The owner never types a password for somebody else. The moment two
people know one password, the trail records a session and not a person, and
"hindi ako yun" becomes unanswerable.

For the same reason, a staff account is **suspended or removed, never shared or
recycled**. Removing a membership leaves the audit rows standing — they carry a
snapshot of the name and email (§4.2), so they keep reading correctly afterwards.

### 1.6 SSO is not the answer here; two-factor is, but third

Both were on the table. The honest reading:

- **SSO** (SAML/OIDC against a corporate directory) answers *where identities
  come from*. It is worth it when the staff already exist in a company directory
  — Google Workspace, Okta, Entra. Race staff here are volunteers and
  freelancers with personal Gmail addresses, so there is no directory to
  federate with, and SSO would answer a question nobody is asking. Not planned.
  If it is ever wanted, the only sensible form is **Google sign-in bound to an
  already-invited account's verified email** — that is Batch 5, optional.
- **Two-factor** does not trace anything either. What it does is make the trace
  *defensible*: without it, a phished or borrowed password turns every audit row
  into a claim about a login rather than about a person. So it belongs in the
  plan — after the accounts and the log exist, because 2FA on a shared account
  protects nothing. TOTP (authenticator app), not SMS: free, offline, no carrier,
  and no phone number to keep current. Batch 4.

---

## 2. Data model

New models only. No existing model is altered except `Organizer` and `Event`
gaining back-relations, and the soft-delete columns in §4.5.

```prisma
/// A person who can sign in to an organizer's admin. Separate from Organizer
/// because an Organizer is a company and a person is not a company: the same
/// human works for more than one of them, and a payment validated on a Sunday
/// has to name the human.
model StaffAccount {
  id                String   @id @default(cuid())
  /// Lowercased on write and on every lookup, like every other account email
  /// in this app — see normalizeAccountEmail in lib/text-case.ts.
  email             String   @unique
  /// Null until the invitation is accepted: an invited person has no password
  /// yet, and the owner never sets one for them.
  password          String?
  name              String
  phone             String?
  /// "INVITED" | "ACTIVE" | "SUSPENDED"
  status            String   @default("INVITED")
  /// Base32 TOTP secret, encrypted at rest. Null means 2FA is not set up.
  totpSecret        String?
  totpConfirmedAt   DateTime?
  /// bcrypt hashes, spent one at a time. Never the codes themselves.
  recoveryCodes     String[] @default([])
  lastLoginAt       DateTime?
  /// Every session issued before this instant is dead. Bumped on password
  /// change, on suspension, and by "sign out everywhere" — the reason it is
  /// needed is that the JWT lives a day and nothing today can end one early.
  sessionsValidFrom DateTime @default(now())
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  memberships       StaffMembership[]
}

/// One person's place inside one organizer.
model StaffMembership {
  id              String   @id @default(cuid())
  staffId         String
  organizerId     String
  /// "ADMIN" (every event of this organizer) | "STAFF" (only what is assigned)
  role            String   @default("STAFF")
  /// Who invited them, as a StaffAccount or Organizer id, and when.
  invitedById     String?
  invitedAt       DateTime @default(now())
  acceptedAt      DateTime?
  /// sha256 of the invite token. The token itself is only ever in the email.
  inviteTokenHash String?
  inviteExpiresAt DateTime?
  staff           StaffAccount @relation(fields: [staffId], references: [id], onDelete: Cascade)
  organizer       Organizer    @relation(fields: [organizerId], references: [id])
  assignments     EventAssignment[]

  @@unique([staffId, organizerId])
  @@index([organizerId])
}

/// Which events a STAFF membership may touch, and as what.
model EventAssignment {
  id           String   @id @default(cuid())
  membershipId String
  eventId      String
  /// "EVENT_MANAGER" | "VALIDATOR" | "ENCODER" | "VIEWER"
  role         String
  assignedById String?
  createdAt    DateTime @default(now())
  membership   StaffMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  event        Event           @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([membershipId, eventId])
  @@index([eventId])
}

/// What somebody did. Append-only: nothing in this app updates or deletes one.
model AuditLog {
  id          String   @id @default(cuid())
  organizerId String
  /// Null for actions that belong to no single race (profile, team, promos).
  eventId     String?
  /// "OWNER" | "STAFF" | "SUPER_ADMIN" | "SYSTEM"
  actorKind   String
  /// The Organizer or StaffAccount id. Null only for SYSTEM (cron, webhook).
  actorId     String?
  /// Snapshotted rather than joined, for the same reason Registration.remarksBy
  /// is a name and not a relation: this is a line in a log and it has to keep
  /// reading correctly after the account behind it is gone.
  actorName   String
  actorEmail  String?
  /// Dotted verb: "registration.status.changed", "runner.deleted",
  /// "proof.viewed", "staff.invited". Never free text — the activity screen
  /// filters on it.
  action      String
  entityType  String
  entityId    String?
  /// One sentence, rendered at write time so the screen never has to
  /// reconstruct it: "Marked PT-4821 as PAID (was PENDING)."
  summary     String
  /// Only the fields that changed: { "status": ["PENDING", "PAID"] }. Never a
  /// whole row — see §4.3 on what must not be logged.
  changes     Json?
  ip          String?
  userAgent   String?
  createdAt   DateTime @default(now())

  @@index([organizerId, createdAt])
  @@index([eventId, createdAt])
  @@index([actorId, createdAt])
  @@index([organizerId, action, createdAt])
}
```

`Organizer` gains `staff StaffMembership[]`; `Event` gains
`assignments EventAssignment[]`.

---

## 3. Roles and permissions

Permissions are verbs, held in one table in `lib/permissions.ts`. **No route
compares a role string.** A role that exists in two places drifts in two
directions; a matrix in one file can be read in one sitting.

| Permission | OWNER | ADMIN | EVENT_MANAGER | VALIDATOR | ENCODER | VIEWER |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `event:view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `event:create` | ✓ | ✓ | | | | |
| `event:edit` | ✓ | ✓ | ✓ | | | |
| `event:delete` | ✓ | | | | | |
| `registration:view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `registration:validate` | ✓ | ✓ | ✓ | ✓ | | |
| `registration:remark` | ✓ | ✓ | ✓ | ✓ | | |
| `registration:email` | ✓ | ✓ | ✓ | ✓ | | |
| `registration:edit` | ✓ | ✓ | ✓ | | | |
| `registration:delete` | ✓ | ✓ | | | | |
| `proof:view` | ✓ | ✓ | ✓ | ✓ | | |
| `results:manage` | ✓ | ✓ | ✓ | | ✓ | |
| `promo:view` | ✓ | ✓ | ✓ | | | ✓ |
| `promo:manage` | ✓ | ✓ | | | | |
| `team:manage` | ✓ | ✓ | | | | |
| `org:settings` | ✓ | | | | | |
| `activity:view` | ✓ | ✓ | | | | |

The four event roles cover the cases actually seen on a race: the person running
the event end to end (`EVENT_MANAGER`), the finance person checking deposit slips
(`VALIDATOR` — reads everything about an order and can settle it, but cannot
alter a runner or delete anything), the timer loading the results sheet
(`ENCODER`), and the sponsor or reporting contact who should see and change
nothing (`VIEWER`).

Note what `VALIDATOR` deliberately lacks: **edit and delete**. That is the whole
point of the separation. If the validator can also rewrite the row, an argument
about an order becomes an argument about the data.

---

## 4. How the trail works

### 4.1 Written in the same transaction as the change

`recordAudit(tx, {...})` takes the Prisma transaction client, so the log row and
the change commit or fail together. An action that succeeded without a log entry
is impossible by construction rather than by discipline. Routes that already run
inside a transaction (`reserveSlots`, `redeemPromoCode`) pass theirs through.

### 4.2 The actor is snapshotted

`actorName` and `actorEmail` are copied at write time. This matches the argument
already in the schema for `Registration.remarksBy`, and it is what lets a
membership be removed without hollowing out the history.

`actorId` is kept as well, because the activity screen has to be able to say
"show me everything this person did", and a name is not a key.

### 4.3 What is logged, and what must never be

**Logged — every write:** registration status changes, remarks, manual emails
sent, runner edits and deletes, event create/edit/delete, category and bank
account changes, promo create/edit/pause/delete, staff invited / role changed /
assigned / suspended / removed, profile and password changes, sign-ins and
**failed sign-ins**.

**Logged — two reads, on purpose:** opening a payment proof (`proof.viewed`) and
exporting a registrant list (`registrants.exported`). These are the two ways
personal data leaves the system without changing anything, and under the Data
Privacy Act they are exactly what an incident review asks about. No other read is
logged; a log that records browsing is a log nobody reads.

**Never logged:** the contents of a proof file, passwords or hashes, TOTP secrets
or recovery codes, and the sensitive runner columns — birthdate, emergency
contact, medical notes. `changes` names the field and, where it is not sensitive,
its old and new value. For a sensitive field it records that it changed, not what
it changed to. The audit log must never become a second, less-guarded copy of the
registrants table.

### 4.4 Size, and what it costs

Roughly 300–500 bytes a row. A busy year at 20,000 recorded actions is about
**10 MB** — comfortable against Neon's free 0.5 GB, and the indexes above are the
ones the activity screen actually filters on. Retention is **24 months**, swept by
a monthly pass added to the existing cron alongside `api/cron/expire-pending`.

### 4.5 Deletes become soft, or the trail has holes

`POST /api/admin/runners/bulk-delete` and `DELETE /api/admin/runners/[id]` remove
rows outright today. An audit row saying "somebody deleted three runners" with
nothing left to inspect is half a trail, and this database holds real
registrations. So deletion on `Runner` and `Registration` becomes `deletedAt` +
`deletedById`, filtered out of every list, with the audit row carrying the
`orderRef` and runner name in its summary. Hard deletion stays available to the
super admin only, and logs what it removed.

---

## 5. What Batch 1 touches

The mechanical half. Every file below currently calls `getAuthCookie()`; each
moves to `requireActor()` and, where it acts, to `assertCan()`.

**New:** `src/lib/actor.ts`, `src/lib/permissions.ts`, `src/lib/audit.ts`, and one
migration.

**Changed — libs and session:** `src/lib/jwt.ts` (typed claims: `sub`, `kind`,
`orgId`, `role`, `name`, `email`), `src/lib/auth.ts`, `src/lib/signed-in-user.ts`
(reads the actor, not the organizer), `src/app/api/auth/login/route.ts` (looks the
address up in `StaffAccount` as well as `Organizer`, through one helper so the two
can never disagree — the same argument §7 of the guide makes about
`normalizeAccountEmail`), `src/proxy.ts` (unchanged in shape; it still only proves
a session exists).

**Changed — admin pages:** `admin/page.tsx`, `admin/events/page.tsx`,
`admin/events/[id]/registrants/page.tsx`, `admin/events/[id]/results/page.tsx`,
`admin/marketing/page.tsx`, `admin/settings/page.tsx`, `admin/[...missing]/page.tsx`.

**Changed — admin API:** `api/admin/events/route.ts`,
`api/admin/events/[id]/route.ts`, `api/admin/events/[id]/results/upload/route.ts`,
`api/admin/registrations/[id]/status/route.ts`,
`api/admin/registrations/[id]/email/route.ts`, `api/admin/runners/[id]/route.ts`,
`api/admin/runners/bulk-delete/route.ts`, `api/admin/proof/[id]/route.ts`,
`api/admin/promos/**`, `api/admin/profile/**`, `api/upload/route.ts`.

**Verification for the batch:** grep that no admin route still calls
`getAuthCookie()` directly, and that no `organizerId !== auth.id` comparison
survives. The owner's behaviour must be byte-for-byte what it is today — that is
the acceptance test, since no staff exist yet.

---

## 6. Batches 2–5, in short

**Batch 2 — `/admin/team`.** The list of people, their role, the events assigned
to them, their status and last sign-in, on the same searchable, sortable,
paginated table the registrants and marketing screens use. Invite by email
(Resend, on the free tier's budget), accept at `/admin/invite/[token]` where the
invitee sets their own password. Suspend and remove. The sidebar and the events
list start filtering by what the actor can reach, and `/admin/events/[id]/**`
denies an unassigned event with the same "Event not found." wording the guide
already insists on, so the screen cannot be used to probe which ids exist.

**Batch 3 — `/admin/activity`.** The trail with filters for person, event, action
and date range, newest first, never re-sorting under someone reading it. Plus
provenance where an issue is actually traced: "Validated by Ana Cruz · 12 Mar,
4:02 PM" in the registrant detail modal, beside the remarks line that already
names its author.

**Batch 4 — TOTP.** `/admin/settings/security`: enrol with a QR, confirm with a
code, ten single-use recovery codes shown once. **Required** for any membership
holding `registration:validate`, `registration:delete` or `event:delete`;
optional for `VIEWER` and `ENCODER`. Enforced at sign-in, not in the UI.

**Batch 5 — optional.** Google sign-in bound to an invited account's verified
email; an active-sessions list with "sign out everywhere"; the retention sweep.

---

## Things settled here, not to be relitigated

- `Organizer` remains the tenant row and the owner's login. It is not migrated
  into a unified account table.
- A person (`StaffAccount`) is separate from their membership, so one human can
  serve several organizers on one email address.
- Roles are org-wide for OWNER and ADMIN, per-event for everyone else.
- `VALIDATOR` can settle an order and cannot edit or delete one.
- The audit log is append-only and nobody in the app can edit it.
- The trail records two reads — proof views and registrant exports — and no
  others.
- Sensitive runner columns never appear in `changes`.
- 2FA is TOTP, not SMS, and comes after accounts and the log exist.
- SSO is not being built.
