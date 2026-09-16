# Super Admin — Organizer Applications Plan

**Status:** Batch 1 landed (uncommitted), Batches 2–6 not started · **Owner decisions captured:** 2026-09-16

`/admin/register` now collects a full organizer application — the contact
person and their role, a mobile number, city and province, a website, how many
races they have run, what they need the platform for, and the event they have
in mind. `/superadmin/organizers` still reads six fields. This plan closes that
gap and finishes the decision the super admin actually has to make.

Work is grouped into **six batches**. Each is one sitting: it ships on its own,
leaves the app working, and is verified before the next one starts. **Batches 1
to 4 are required** — without them the application is data nobody reads and a
promise the app does not keep. **Batches 5 and 6 are optional** and only start
paying off once there are more applications than fit on one screen.

Delete this file once the required batches have landed, the way
`STAFF_ACCESS_PLAN.md` was deleted when staff access shipped.

---

## Decisions already made

| Question | Answer |
| --- | --- |
| How is a refusal recorded? | A **`REJECTED`** status plus a short written reason. |
| Does the applicant hear back? | **Yes — on both approve and reject**, by email. |
| Where is an application read? | **The row opens a panel** over the list, the pattern `/superadmin/feedback` already uses. No new route. |
| Who sets the per-runner fee? | **The organizer does, per event.** The super admin's commission editor comes out entirely — see Batch 1. |

## One decision still open — needed before Batch 3, not before Batch 1

**Is the rejection reason private, or is it sent to the applicant?** The two
answers given point slightly different ways: the reason was described as
*internal*, and the rejection email was described as carrying *your reason*.

**Recommendation: one box, and it is sent.** Label it plainly — *"Why — the
applicant will read this."* A refusal with no reason is the thing that makes
somebody apply three more times, and a second private-only box is friction on
a screen that will be used a handful of times a month. If a decision genuinely
needs a private note, it belongs in the audit trail entry from Batch 4, not
beside the status.

If you would rather it stayed private, it is a one-line change in Batch 3 — the
column is written either way and the email simply stops quoting it. **Say which
before Batch 3 starts.**

---

## Rules that apply to every batch

These come from `PROJECT_GUIDE.md` and are not repeated inside each batch.

- **Mobile ships in the same batch**, never after it. The dashboards must be
  fully usable at 360px, below `lg` a table becomes cards through
  `AdminCardList`, no horizontal scroll, 44px targets, and modals fit the
  viewport and scroll inside.
- **`PROJECT_GUIDE.md` is updated in the same change**, not in a follow-up.
- **No browser defaults.** `AdminSelect`, `AlertProvider`'s `alert`/`confirm`,
  `AlertModal`, `FieldError`, `StatusPanel` — copy an existing control.
- **Validation names what is wrong** and highlights the field; never a
  catch-all.
- **Admin buttons wear the quiet outline style.** The orange gradient belongs
  to the public site and the sign-in CTAs.
- **Nothing is committed or pushed** until you say so. Work lands on `dev`.
- **A batch carrying a migration needs `npx prisma migrate deploy` run against
  production by hand at release** — production and development are separate Neon
  branches, so migrations do not travel with the code.
- **Storage:** Neon's free tier is 0.5 GB. Every column this plan adds is short
  text on a table holding tens of rows — a few kilobytes in total. Nothing here
  is a storage decision.

---

# Batch 1 — Read the application *(required)*

**Goal:** the super admin can see everything an applicant wrote, and the dead
commission editor is gone.

### Why

Approving an organizer hands a stranger the ability to publish a public race,
take runners' money and email everyone who signs up. That decision is currently
made from a name, an email address and a created-at date. The other fifteen
answers exist and are simply not on screen.

### What to build

1. **`GET /api/superadmin/organizers` returns the application columns** —
   `orgType`, `contactFirstName`, `contactLastName`, `contactRole`, `phone`,
   `city`, `province`, `website`, `experience`, `services`, `firstEventName`,
   `firstEventDate`, `firstEventLocation`, `expectedRunners`,
   `applicationNote`. Still `SUPER_ADMIN` only.
2. **The row opens.** Tapping a row anywhere but on its action controls opens a
   panel over the list holding the whole application, grouped the way the form
   asked for it: the organization, the person, what they are planning. Close on
   Escape and on the backdrop, focus trapped, scrolls inside on a short screen.
3. **Labels come from `lib/organizer-application.ts`** — `organizerTypeLabel`,
   `organizerExperienceLabel`, `organizerServiceLabel`,
   `expectedParticipantsLabel`. Never render the stored `RUNNING_CLUB` at a
   person. Each falls back to the stored text, so a row written before an
   option was renamed still reads as itself.
4. **Contact details are actionable**, because this screen exists to get the
   super admin in touch: the phone is a `tel:` link, the email a `mailto:`, the
   website opens in a new tab with `rel="noopener noreferrer"`.
5. **Accounts that pre-date the form say so.** Every column is nullable.
   `hasApplicationDetails()` already answers this — the panel shows one honest
   sentence ("This account was created before the application form existed")
   rather than fifteen dashes.
6. **Below `lg`,** the card gets a *Read application* button rather than
   opening on a tap anywhere — the same choice `/superadmin/feedback` made,
   because a card carries its own controls and a tap target that covers all of
   them is a mis-tap waiting to happen.
7. **Remove the commission editor.** The inline *Admin Fee* cell, its edit
   state, the `AdminCardEdit` block on the card, and `adminFee` from the
   `PATCH` route's accepted body.

### The fee, verified

`Organizer.adminFee` is **read by nothing**. Every peso a runner is actually
charged comes from `Event.adminFee`, which the organizer sets per event (the
create form defaults it to ₱60 and does not inherit the organizer's value).
The only code that touches `Organizer.adminFee` is the superadmin screen that
edits it and the route that saves it — a closed loop that has never moved
money. So this is not a trade-off, it is deleting a control that does nothing,
and your instinct was right.

- *Optional:* **drop the `Organizer.adminFee` column** in a later cleanup
  migration. Left in place it is harmless and costs 4 bytes a row; dropping it
  is the only destructive migration anywhere in this plan, so it should travel
  on its own and never inside a batch that also adds things.

### Files

`src/app/superadmin/organizers/page.tsx` · `src/app/api/superadmin/organizers/route.ts` ·
`src/app/api/superadmin/organizers/[id]/route.ts` · `PROJECT_GUIDE.md`

### Done when

- Every field an applicant typed is visible without opening the database.
- A legacy organizer opens to the honest empty state, not to blanks.
- The panel works at 360px with no horizontal scroll, and on desktop.
- No *Admin Fee* control remains, and `PATCH` refuses an `adminFee` body.
- No schema change. No migration.

---

# Batch 2 — Decide: approve, reject, suspend *(required)*

**Goal:** a refused application can be refused, and the reason survives.

### Why

Today a refusal has nowhere to go. It either sits `PENDING` forever — where it
keeps appearing as work still to do — or it is marked `SUSPENDED`, which says
an account was switched off when the truth is it never opened.

### A trap to fix in this batch

Sign-in and `getActor()` check a **blocklist**, not an allowlist:
`BLOCKED_ORGANIZER_STATUSES = ['PENDING', 'SUSPENDED']` in `src/lib/actor.ts`,
and `auth/login` tests for those two statuses by name. **A new `REJECTED`
status would therefore be allowed straight in** — a rejected applicant could
sign in and start publishing races.

Invert it: an organizer signs in when their status **is `APPROVED`**, and
anything else is refused with wording matched to the status. That is the safer
shape permanently, because the next status added after this one inherits the
right default instead of the dangerous one.

### What to build

1. **`src/lib/organizer-status.ts`** — the statuses, their labels, their chip
   copy, `asOrganizerStatus()` guarding the `PATCH` door, and the one predicate
   that says whether a status may sign in. Four surfaces have to agree about
   this (the screen, the chips, the PATCH route, the sign-in path), which is
   exactly the job `lib/feedback.ts` and `lib/organizer-application.ts` do for
   their own vocabularies.
2. **`REJECTED` joins the vocabulary.** `status` is already a plain string
   column, so this needs no migration.
3. **`statusNote`** — one nullable text column, the written reason. *This is
   the only migration in this batch.*
4. **Invert the sign-in check** to the allowlist above, and give `REJECTED` its
   own refusal wording and its own audit outcome in `auth/login`.
5. **A fourth chip**, *Rejected*, beside Pending / Approved / Suspended. The
   chips find rows and never reorder them, so an application decided from the
   Pending view leaves that view instead of jumping around a list somebody is
   working down.
6. **Reject asks for the reason**, in an `AlertModal`-based dialog with a real
   textarea and a `FieldError` — a rejection saved with an empty reason is the
   one this screen should refuse. Approve and suspend keep the existing
   `confirm`.
7. **The panel from Batch 1 shows the decision** — the status, when it moved,
   and the reason — so a row already decided explains itself.

### Files

`src/lib/organizer-status.ts` *(new)* · `src/lib/actor.ts` ·
`src/app/api/auth/login/route.ts` · `src/app/api/superadmin/organizers/[id]/route.ts` ·
`src/app/superadmin/organizers/page.tsx` · `prisma/schema.prisma` + migration ·
`PROJECT_GUIDE.md`

### Done when

- A rejected account cannot sign in — **test this explicitly**, it is the point
  of the batch.
- A rejection cannot be saved without a reason, and the reason reads back.
- The four chips find the right rows and the order never shifts underneath.
- Storage: one nullable text column. Negligible.

---

# Batch 3 — Tell the applicant *(required)*

**Goal:** the promise the application page makes is one the app keeps.

### Why

The success panel says, in as many words, *"We will write to
`you@example.com`."* Nothing sends anything. An applicant who hears nothing for
a week assumes the form was broken and applies again, or goes elsewhere.

**Read the open decision at the top of this file before starting.**

### What to build

1. **Two emails** through the existing Resend setup in `lib/email.ts`, in the
   same voice as the registration receipt:
   - **Approved** — welcome, what they can do now, and the link to
     `/admin/login`. It must **not** contain their password.
   - **Rejected** — a short, human refusal carrying the reason, and a line
     saying they are welcome to apply again with more detail.
2. **The email never fails the decision.** Follow `admin/team`'s invite
   pattern exactly: the status moves in the database first, the send happens
   after, and the answer carries `emailSent` / `emailError`. A mail outage must
   not leave a decision half-made.
3. **The screen says what happened** — approved *and* notified, or approved but
   the email bounced, so the super admin knows to pick up the phone. A failure
   is answered, a success is announced.
4. **`RESEND_API_KEY` unset just skips the send**, which is already how
   `lib/email.ts` behaves in development. Do not make that path throw.

- *Optional:* a **Resend decision email** action on an already-decided row, for
  the send that failed or the applicant who lost it.
- *Optional:* record `decisionEmailSentAt` so the screen can say *"notified 2
  days ago"* rather than only *"notified"*. One nullable timestamp; skip it
  unless the resend action above is built, since otherwise nothing reads it.

### Files

`src/lib/email.ts` · `src/app/api/superadmin/organizers/[id]/route.ts` ·
`src/app/superadmin/organizers/page.tsx` · `PROJECT_GUIDE.md`

### Done when

- Approving sends the welcome; rejecting sends the refusal with its reason.
- Killing the API key mid-test still moves the status and reports the failure.
- Neither email contains a password or another organizer's data.

---

# Batch 4 — Write the decision down *(required)*

**Goal:** six months from now it is possible to answer "who approved this, and
when?"

### Why

`/admin/activity` and `lib/audit.ts` already exist, and every sign-in, every
registrant edit and every staff change is written there. Approving an
organizer — the single highest-consequence action on the platform — is written
nowhere.

### What to build

1. **An audit row per decision**: approved, rejected, suspended, reinstated.
   Each records the acting super admin, the organizer, the status it moved from
   and to, and the reason where there is one.
2. **Scoping.** The trail is organizer-scoped today. Write the row **to the
   organizer being decided about**, so it appears on their own account's
   history where it belongs, and record the super admin as the actor. This is
   the `actor.ts` rule already in force: *authorisation scopes by `orgId`,
   attribution records the actor's `id`.*
3. **Sensitive values are named, never quoted** — the existing convention.

- *Optional:* a **superadmin-facing view** of these rows. The entries are
  written and queryable either way; a screen for them is only worth building
  once there are enough decisions to want to scroll through. When it is built,
  it should be a filter on the existing activity surface rather than a second
  trail with its own look.

### Files

`src/app/api/superadmin/organizers/[id]/route.ts` · `src/lib/audit.ts`
*(vocabulary only)* · `PROJECT_GUIDE.md`

### Done when

- Every one of the four transitions writes exactly one row, with the actor.
- No reason text or personal data is written into a field meant for a label.
- No migration, assuming the existing audit table takes these action names.

---

# Batch 5 — Make the queue visible *(optional)*

**Goal:** a new application makes a noise somewhere.

### Why

Right now the only way to discover an application is to remember to go looking
for one. Everything in Batches 1 to 4 is wasted on an application nobody opens
for a fortnight.

Optional because it changes no data and blocks nothing — but it is the cheapest
batch here and probably the one you would feel first.

### What to build

1. **A pending count on the `/superadmin` dashboard**, as a tile that links
   straight into the Pending chip. It only earns its place if a real number
   sits behind it — the organizer dashboard's *Page Views* tile was removed for
   reading `N/A` forever, and this must not repeat that.
2. **A badge on the sidebar's Organizers item**, carrying the same count.
3. Both read one `count` query. Neither is allowed to be slow.

- *Optional within the optional:* an email to the super admin when an
  application arrives. Only worth it if the dashboard is not checked daily —
  and it should be one address from `lib/site-contact.ts`, never a hardcoded
  one.

### Files

`src/app/superadmin/page.tsx` · `src/app/superadmin/SuperAdminShell.tsx` ·
`PROJECT_GUIDE.md`

### Done when

- The count is right, links through to the right filter, and reads correctly at
  360px.

---

# Batch 6 — Sift a longer list *(optional)*

**Goal:** find one application among two hundred.

### Why

Genuinely premature today. Build it when the list stops fitting on a screen —
not before, because every filter added now is a control to keep responsive and
a query to keep fast in exchange for solving a problem you do not have.

### What to build

1. **Search covers the application**, not just the organization name — the
   contact person, the phone number, the city.
2. **Filter by organizer type and by province**, as `FilterChip`s or a single
   `AdminSelect`, whichever keeps the toolbar from wrapping on a phone.
3. **A lookalike flag** — mark an application whose organization name, phone
   number or website matches an existing organizer. A duplicate is the
   cheapest fraud signal available and it costs one query. Show it as a quiet
   note inside the panel, never as an accusation on the row.

- *Optional:* **export the pending queue** as CSV. Only if applications are
  ever reviewed away from the screen; otherwise it is a second path carrying
  personal data for no reason.

### Files

`src/app/superadmin/organizers/page.tsx` · possibly
`src/app/api/superadmin/organizers/route.ts` · `PROJECT_GUIDE.md`

### Done when

- Searching a phone number finds its application.
- The toolbar does not wrap into a mess at 360px.

---

## Deliberately not in this plan

- **A `/superadmin/organizers/[id]` page.** Considered and set aside: the panel
  covers the decision, and a second route is a second thing to keep responsive.
  Revisit only if the screen grows to need an organizer's events, revenue and
  staff on one page.
- **Editing an application's answers.** The application is what somebody else
  wrote. An inbox that can rewrite its own mail is one whose contents cannot be
  trusted later — the same reason `superadmin/feedback`'s `PATCH` moves only
  the triage mark.
- **Deleting an organizer.** A decided application is a record. Rejection is
  the answer; deletion is not.
- **Superadmin-editable vocabularies** (organizer types, services). They live
  in `lib/organizer-application.ts` and change about once a year. A settings
  screen for them is work spent on a list that does not move.

---

## Suggested order

Batch 1 → 2 → 3 → 4, then stop and use it. Batches 5 and 6 are worth revisiting
once applications are arriving regularly rather than in ones and twos.

Batch 1 alone already changes the decision you are able to make, so it is worth
landing on its own even if the rest waits.
