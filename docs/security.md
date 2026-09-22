<!-- Part of the Run As One project guide. This file is §7, the security model; the index is PROJECT_GUIDE.md at the repo root.
     Section references like "§5" point to the other parts listed in the guide's routing table. -->

## 7. Security model

- `src/proxy.ts` guards `/admin/**` (except `/login`, `/register` and
  `/invite`, which a person with no session must reach — `PUBLIC_ADMIN_PATHS`):
  no token, or one that does not verify → `/admin/login`. **It no longer sorts
  sessions between two dashboards** (`ADMIN_MERGE_PLAN.md` Batch 2): every
  session lands on `/admin`, and what it may open there is each page's `can()`.
  A token for the retired super admin, or an OWNER token for any Organizer
  row but Run As One's, does not verify (`jwt.ts`) and goes to sign-in. `/superadmin/**` never reaches the proxy — it is
  a permanent redirect in `next.config.ts`, which runs first.
- **Waiving Run As One's admin fee is `promo:waive-fee`** (`OWNER` alone,
  `PACER_DISCOUNT_PLAN.md`). A pacer's free entry is the organizer's own money
  and `promo:manage` covers it; the admin fee on top is **Run As One's
  commission** (`settlement.ts`), so giving that away is the company deciding
  about itself and not something an organizer's admin does. The screen shows the
  switch disabled with that sentence in its hint, and **both routes check the
  verb rather than trusting the form**, answering **403 with the field** so the
  refusal can be shown on the control that caused it — never silently saving
  `false`, because a pacer promised a free entry and then charged the fee is the
  failure this guards. It is deliberately a new verb rather than a borrowed
  `org:settings`: that one means "set the default platform fee" and only happens
  to be OWNER-only today. **The waiver is the one exception** to "fees are never
  discounted" in `discount.ts`, and it is written there as an exception so a
  reader who finds a fee waived can find the sentence that allowed it.
- **Money paid to organizers is `remittance:manage`** (`OWNER`, `ADMIN`): the
  Remittances pages answer anyone else with the admin 404 (a viewer with the
  forbidden page), and each of the three remittance routes checks it against
  the race the remittance belongs to, answering a missing and a refused id
  alike. Remittances are append-only in practice — no route edits or deletes
  one — and every record, void and receipt opening is in the trail.
- **Run As One's own screens are a permission, not a role.** Clients,
  Communities, Feedback and the Overview's fee tile ask `platform:manage`
  (`OWNER`, `ADMIN`); their pages answer anyone else with the admin's 404 and
  their routes go through `api/admin/platform-actor.ts` (401 / 403). A STAFF
  member, whatever their event roles, and a client viewer are refused.
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
- **Any session can be ended before its JWT expires**: `getActor()` checks
  the StaffAccount's status, membership and `sessionsValidFrom` on every
  request, and **the owner's token against `Organizer.sessionsValidFrom`** too
  (`SETTINGS_PLAN.md` Batch 3). A password change and *Sign out other devices*
  move the person's `sessionsValidFrom` forward, reissuing only the session
  that made the change. `proxy.ts` only verifies the signature, so a dead
  session gets past it and is sent to sign-in by the page's `requireActor()`
  (and answered 401 by every route) — there is no redirect loop, because the
  sign-in page is public. `registrants` and
  `results` both do this; the `edit` screen is a client component, so its scope
  lives in `GET`/`PUT /api/admin/events/[id]`, and the results uploader's in
  `POST /api/admin/events/[id]/results/upload`. **Never read an event by id
  alone on an admin surface** — the registrants screen carries every runner's
  email, phone, birthdate, emergency contact and medical notes, and an id is not
  proof of ownership. There is no cross-tenant branch anywhere: `can()`
  refuses any reach outside the actor's own `orgId`.
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
- **A client viewer reaches registrant counts of its own client's events and
  nothing else**, enforced on the server rather than by hidden links. Its one
  screen is the Overview (`client-summary.ts`, which asks `event:view-summary`
  with each event's `clientId`) plus its own Settings. **Every other dashboard
  page calls `requireTeamActor()`** (`actor.ts`), which answers a viewer with
  `forbidden()` **before reading anything** — so the answer is identical for
  every id in the URL — and `admin/forbidden.tsx` draws *Not Part of Your View*
  inside the sidebar (`experimental.authInterrupts` in `next.config.ts`). New
  Event and Edit Event are client components, so `admin/events/layout.tsx`
  asks it for the whole section; a layout does not re-run on a navigation
  inside it, which is why the server pages keep their own call. The 403 is in
  the stream rather than the HTTP status line, because `loading.tsx` starts the
  response first — the same as `notFound()` here. **Every `/api/admin/**` route
  refuses a viewer by `can()`** (401 / 403 / 404, whatever that route already
  answers a refusal with) and `api/upload` by `canSomewhere`; only
  `admin/profile`, `admin/profile/avatar`, `admin/profile/password` and `admin/profile/sessions` serve it. **A new dashboard page
  calls `requireTeamActor()` unless it is meant for viewers.** Staff refusals
  stay the admin's 404. A viewer whose client was archived is told at sign-in
  that its organization's sign-in is not active and to contact Run As One. Archiving the client ends the session on
  the next request. **Who a client is shown is Run As One's decision**:
  linking a race to a client (`readClientLink`) and sending a client's invite
  both need `platform:manage`, so an event manager can edit a race without
  being able to hand its counts to an outside organization. A viewer's
  invitation can only be accepted onto an INVITED or ACTIVE client, and the
  acceptance makes the client ACTIVE in the same write, so no viewer ever
  holds a session `getActor()` would refuse.
- **Suspension and removal bite on the next request**, not at token expiry:
  `getActor()` refuses a suspended or deleted membership, and sign-in goes
  through `activeMembershipWhere`.
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
- **The ₱0 order is decided on the server only.** An order can legitimately cost
  nothing (a pacer's free entry with the admin fee waived), and such an order
  skips the payment processor entirely — so `isFreeOrder` is asked of the total
  the route **recomputed**, never of anything in the request. A posted
  `totalAmount: 0` on an order that is not actually free is refused 409 like any
  other disagreement, and so is a posted platform fee of 0 without a code that
  earned the waiver. The wizards run the same rule only to decide what to draw;
  a wizard that is wrong about it simply gets the 409. See
  `lib/free-checkout.ts`, and note that such an order is written `PAID` with its
  three chargeable amounts forced to zero rather than copied from the request.
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

