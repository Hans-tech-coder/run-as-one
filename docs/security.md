<!-- Part of the Run As One project guide. This file is §7, the security model; the index is PROJECT_GUIDE.md at the repo root.
     Section references like "§5" point to the other parts listed in the guide's routing table. -->

## 7. Security model

- `src/proxy.ts` guards `/admin/**` (except `/login`, `/register` and
  `/invite`, which a person with no session must reach — `PUBLIC_ADMIN_PATHS`
  in `lib/next-path.ts`): no token, or one that does not verify →
  `/admin/login?next=<the page asked for>` (`LOGIN_UX_PLAN.md` Batch 1). **It no longer sorts
  sessions between two dashboards** (`ADMIN_MERGE_PLAN.md` Batch 2): every
  session lands on `/admin`, and what it may open there is each page's `can()`.
  A token for the retired super admin, or an OWNER token for any Organizer
  row but Run As One's, does not verify (`jwt.ts`) and goes to sign-in. `/superadmin/**` never reaches the proxy — it is
  a permanent redirect in `next.config.ts`, which runs first.
- **Track My Registration is public and shows only what is safe in a
  stranger's hands** (`TRACK_PAGE_PLAN.md` §4, §5; `/track`, `api/track`,
  `lib/track*.ts`). A reference + email (D1), POSTed, never in a URL. **The
  group rule**: order ref + the contact's email → the whole order; order ref +
  a runner's email → only the runner(s) with that email; runner ref `-N` +
  that runner's or the contact's email → only runner N; anything else is one
  identical "not found". **Masking happens on the server** from a whitelisted
  Prisma `select` (like `client-runners.ts`): email `ju•••@gmail.com`, phone
  `0917•••4567`, address city + province only (D9), birthdate month + year
  (D10), emergency phone `•••4567`, medical "Declared" / "None declared";
  payment proof, amounts paid, transaction numbers and staff remarks are never
  read. The full values never reach the JSON, the HTML or the bundle. The
  throttle (`TRACK_LOOKUP_RULE` per address, `TRACK_REF_RULE` per reference)
  is per-instance memory, so it slows one script, not a distributed one: the
  masking is what makes a leaked reference safe, not the throttle. The emailed
  `/track/<token>` link is a stateless `purpose: 'track'` JWT (a whole order;
  a `runners` claim narrows a lookup's own short-lived token to the runners it
  proved), refused by every other token reader and re-checked against the
  order on every open. **What belongs to the whole order is the contact's
  alone** (`provesContact`, Strix vuln-0001): a delivery switch's pay link
  (`/pay/logistics/<token>` shows the full delivery address and takes edits to
  it) is listed only when the lookup covers the whole order or shows a runner
  with the contact's email, and so is *Resend*; another runner sees only their
  own upgrades. *Resend* mails only the order's contact, proved by that token
  (403 for a token that proved another runner's email), and is throttled per
  order to spare Resend's 100-a-day free tier.
  `noindex` and `no-store` throughout. An order is shown only on its race's
  own site (a client's race on the client's subdomain); asked elsewhere, the
  answer is a link there, and only after the reference and email matched, so
  it tells a stranger nothing a "not found" would not. The host stays a lens:
  it decides where an order is drawn, never whether the pair may see it.
- **Client subdomains are a lens, never a permission** (`CLIENT_SUBDOMAIN_PLAN.md`).
  The proxy's matcher now covers every page, but only `/admin/**` reaches the
  session check, which is unchanged (`toSignIn`'s `?next=` included); a public
  page never asks for a sign-in. The host's client label travels as
  `x-rao-site` (and the URL as `x-rao-url`), and **the proxy deletes both from
  what the browser sent before setting its own**, so a visitor cannot choose a
  site by header. The site-tree pages get the label as a path instead (the
  proxy rewrites them to `/s/<label>/…`, routes §6), and a browser's own
  `/s/…` is rewritten like any other path, so it lands on a 404 and a visitor
  cannot choose a site by path either; `/s/:path*` is its own matcher entry so
  no file extension slips it past. Nothing that decides who may do what reads
  the label. On a
  subdomain, `/admin/**` is sent to the main host *before* the session check
  (the cookie is host-only, so a sign-in there would land on the wrong host).
  `/admin/:path*` stays its own matcher entry so the page matcher's static-file
  exclusions can never drop the session check. A client site's subdomain and
  branding are staff-only (`platform:manage`, `PATCH /api/admin/clients/[id]`),
  and its images must be uploads to the public blob store, never a third
  party's address (`lib/client-branding.ts`).
- **Waiving Run As One's admin fee is `promo:waive-fee`** (`OWNER` and, since
  2026-10-30, `ADMIN`; `PACER_DISCOUNT_PLAN.md`). A pacer's free entry is the
  organizer's own money and `promo:manage` covers it; the admin fee on top is
  **Run As One's commission** (`settlement.ts`), so it keeps a verb of its own
  even now that the same two roles hold both. It gates the pacer switch and
  **creating or editing a `FREE_ENTRY` promotion** on `/admin/marketing` (the
  kind is only offered to holders, and both promo routes answer 403 on
  `discountType` otherwise; pausing or deleting one stays `promo:manage`). The
  pacer screen shows the
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
  member, whatever their event roles, and a client viewer are refused. **`can()`
  also pins it to Run As One's row** (`RUN_AS_ONE_ORGANIZER_ID`): those tables
  are global, so the usual `reach.organizerId === actor.orgId` check protects
  nothing, and an OWNER or ADMIN membership on a leftover self-serve Organizer
  row that is still `APPROVED` would otherwise reach every client, all feedback
  and the site settings. Owner sessions were already pinned in `getActor()`;
  staff sessions are only status-checked, which is what this closes (Strix
  vuln-0001, 2026-09-29).
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
- **Admin API routes answer a refusal with the same 404 as a miss.** A route
  under `/api/admin/**/[id]` that loads a record and then asks `can()` returns
  the record's own *not found* (status and body) when `can()` says no, never a
  401/403 — otherwise "exists but not yours" and "does not exist" differ, and a
  signed-in client viewer or event-scoped staff member can confirm another
  client's or race's ids by probing (Strix vuln-0001, 2026-10-15: event
  PATCH/DELETE, registration status / email / follow-up / payment-check, proof,
  runner PATCH/DELETE). 401 stays for a request with no session at all, and a
  403 is fine *after* the actor has passed a view check on the record (e.g. the
  pacer fee waiver), since they can already see it exists. Scoping the lookup
  by `organizerId` alone is not enough: the boundary that matters is inside the
  organizer, per client and per race.
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
  lives in `GET`/`PUT /api/admin/events/[id]`, the results uploader's in
  `POST /api/admin/events/[id]/results/upload`, and the results workspace's
  certificate save in `PUT /api/admin/events/[id]/certificate` (`event:edit`).
  **Never read an event by id
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
- **A client viewer reaches registrant counts, the payout summary and the
  race-kit runner list of its own client's events, and nothing else**, enforced on the server rather than
  by hidden links. Its
  screens are the Overview (`client-summary.ts`, which asks `event:view-summary`
  with each event's `clientId`), each race's own page `/admin/your-events/[id]`
  (`client-race-report.ts`, the same read narrowed to one race, so another
  client's race reads as not found — still counts only: sizes and kits are
  counts of runners) with, since `CLIENT_RACE_PAGE_PLAN.md` Batch 3, **its
  race's settlement** (`client-payout.ts`, asking `event:view-payout` with the
  race's `clientId`): collected, Run As One's fees, paid out, still owed, and
  each recorded payout's day, method and amount. The query's `select` is the
  whitelist — **no reference number, note, receipt, voided row or who
  recorded it** leaves it — and the section is never in the printed copy,
  which a client hands to its shirt supplier. Since Batch 4, **its race's
  runners** (`client-runners.ts`, asking `event:view-runners` with the race's
  `clientId`): each paid or awaiting-verification runner's name, runner
  reference, category, shirt size, *Paid* / *Awaiting verification*, pickup
  or delivery, and — because the client releases and ships the kits (the
  owner's call, 2026-10-08, reversing the first "no contact details" ruling)
  — phone, email, home address with province, and a delivered kit's area and
  ship-to address. The `select` is the whitelist: **no birthdate, gender,
  emergency contact, medical note, guardian, club, payment method, proof,
  amount or remark** leaves it. The client can filter, mark and **export to
  CSV**; every export is recorded in the activity trail through the staff
  export route (`api/admin/events/[id]/registrants/export`, which accepts
  `event:view-runners` with the race's `clientId` beside `registration:view`,
  and words the entry as the client runner list). The list is never in the
  printed copy. The Privacy page says so (*Who sees your data*). Plus its own Settings and the
  **E-Certificate Guide** (`/admin/certificate-guide`). The guide is the one
  team-side page a viewer may open, and it gates on `requireActor()` alone
  because it holds no data: the same static text for every reader, with no
  query behind it, so there is nothing for a viewer to see that another
  client could not. **Every other dashboard
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
  Mismatches are rejected. Before any of that, **every runner's `categoryId`
  must be one of this event's own options** (`participantCategoryError` in
  `registration-gate.ts`, 400): pricing and slot counting look the option up in
  `event.categories`, and a miss priced the runner at ₱0 and skipped the caps,
  so a public option id from another event bought a near-free entry (Strix
  vuln-0002). The request carries the promo *code*, never what it
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
- **Checkout builds its own return URLs.** `POST /api/checkout` used to take
  `successUrl` and `cancelUrl` from the body and hand them to PayMongo — and a
  free order got `successUrl` straight back as its `checkout_url`, which the
  wizard opens. A scripted checkout could therefore send a runner from a real
  Run As One order to any site (an open redirect). The route now builds both
  from the request origin and the event's slug, as `/api/pay/[token]` already
  did: `/events/[slug]/register?success=true&orderRef=…` and
  `/events/[slug]/register?orderRef=…&cancel=true`. The wizard no longer sends
  them, and the route ignores them if an old tab does. The origin is the
  **event's own site** (`eventOrigin(event, request.url)`, `lib/site-host.ts`,
  `CLIENT_SUBDOMAIN_PLAN.md` Batch 3), never the Host header as sent: the
  request only picks the root outside production, and in production it is
  `SITE_URL` or a subdomain of it, so a forged Host cannot pick the return
  site either. `/api/pay/[token]` and the staff payment link
  (`lib/payment-link.ts`) build theirs the same way.
- **Server-side gates, not just UI ones.** Consent (`consentGiven !== true`),
  the finished-race check (`hasFinished`), the organizer's registration hold,
  the per-category slot limits and **every promo condition** are all enforced in
  the API, because a tab left open yesterday will still POST — a code that has
  expired or filled up since the page loaded is refused with the same sentence
  the wizard would have shown. The slot check runs *inside* the write
  transaction and locks the capped category rows first (`reserveSlots`), since a
  count taken before the write is a count two simultaneous orders both pass. A
  code's usage cap is spent the same way, by `redeemPromoCode`.
- **Placing an order is throttled, and the throttle is a speed bump, not a
  cap.** An unpaid order holds its slots and promo uses until it is paid or
  the daily sweep expires it (`lib/pending-expiry.ts`, a day or more), so an
  unthrottled `POST /api/checkout` let a script make a race look sold out
  without paying (Strix vuln-0002). Both checkout routes now share
  `CHECKOUT_RULE` in `lib/rate-limit.ts` — 10 orders a minute per address,
  checked before the body is read, answered 429 with a sentence the wizard
  shows. **That limiter lives in one instance's memory.** Vercel's instances
  share nothing, so it stops a loop from one address and does not stop a
  distributed one; the size of each order is the next bullet. The
  caller is keyed on the first hop of `x-forwarded-for`, which Vercel
  overwrites with the address it saw, so a client cannot rotate it in
  production (only under `next dev`, or behind a proxy Vercel is told to
  trust). An over-full map forgets the callers seen longest ago rather than
  everyone, so a flood of addresses cannot reset a throttled one. A real cap needs a shared counter (Redis) or a
  shorter hold on unpaid online orders — neither exists yet.
- **One order carries at most 20 runners.** Each runner reserves a category
  slot when the order is written (`reserveSlots`), so before the cap a single
  throttled request could still post hundreds of runners and hold a whole
  category until the sweep. Both checkout routes refuse a longer
  `participants` list with a 400 and a plain `error` the wizard alerts
  (`participantCountError`, `MAX_RUNNERS_PER_ORDER` in `lib/order-size.ts`),
  and both wizards stop the *Add Another Runner* button at the same number
  with a note saying why. Twenty fits a family, a barkada or a club entering
  together, and every group promotion; a bigger club splits into two orders.
  Together with `CHECKOUT_RULE` that bounds one address to 200 held slots a
  minute — still per instance, so the shared counter above is the real fix.
- **An unverified bank transfer holds its slots for seven days, not
  forever.** `/api/checkout/manual` takes any image under 4 MB as a slip, and
  bank transfers used to be exempt from the sweep, so junk slips could hold a
  capped race shut until an organizer cancelled them by hand (Strix vuln-0003,
  run a8b3). `BANK_TRANSFER_EXPIRY_DAYS` in `lib/pending-expiry.ts` bounds
  that to a week; validating an expired transfer re-checks capacity.
- **A failed bank-transfer order leaves no slip behind** (Strix vuln-0001, run
  fca9). The slip is uploaded before the order transaction, so a failure there
  used to leave a private blob nothing pointed at. The route now deletes the
  one it just uploaded, but **only when `VERCEL` is set**: the private store is
  shared with production, and nothing run locally deletes from it.
- **Only PayMongo can mark an online order PAID through the webhook.**
  `/api/webhooks/paymongo` fails closed: with `PAYMONGO_WEBHOOK_SECRET` unset
  it logs an error and answers 500 without reading the event, and a missing or
  malformed `paymongo-signature` header is refused 401. The HMAC-SHA256 of
  `${t}.${rawBody}` is compared with `crypto.timingSafeEqual` against the slot
  the event's own `livemode` names — `li=` for live, `te=` for test — never
  whichever slot happens to be filled (hardened 2026-10-15); a missing slot or
  a mismatch is 401. The body is parsed before that check only to read
  `livemode`, which the signature covers. Each Vercel environment needs its
  own secret: Production the live webhook's `whsk_`, Preview the test one's.
- **A captured PayMongo webhook cannot be replayed later.** The signature
  covers `t=` and the body, so a copy of a real delivery used to stay valid
  forever (Strix vuln-0001, 2026-10-07). After the HMAC check the route refuses
  an event signed more than 3 hours ago or more than 5 minutes ahead. The
  window is wide on purpose: PayMongo does not say whether a retry is
  re-signed, its 12 retries run about 136.5 minutes, and three events that fail
  every retry disable the webhook. Replay did little harm even before — only a
  `PENDING` order is ever flipped — so the window is about shutting the door,
  not a live exploit. A genuine late event (a dashboard *Resend*) is settled
  with "Check payment" instead.
- **The resume-payment link is a key to one order, and is built as one**
  (`UNPAID_FOLLOWUP_PLAN.md` Batch 3, `lib/resume-payment.ts`). Handed out
  only with `registration:email`, every copy on the trail. A signed token
  with `purpose: 'resume-payment'` and the order id, expiring with the order;
  it cannot pass for a session and a session cannot pass for it. Opening it
  re-checks the order (`payableState`), which is its revocation: paid,
  cancelled or expired, it only says so. `/pay/[token]` is `noindex` and
  throttled, and shows the race, runner count, amount, method and
  reference — **never a name, email, phone or birthdate**, because the link
  is pasted into chats and forwarded. Pay now bills the stored order, never
  the request, and closes the order's earlier PayMongo page first, so one
  order can never be paid twice.
- **A category change's payment link is the same kind of key, to one change**
  (`CATEGORY_CHANGE_PLAN.md` Session 3). A second purpose,
  `'category-change-payment'`, with the change id, expiring with its seat
  hold — an order's token opens no change and a change's opens no order.
  Handed out only with `registration:email`, every copy on the trail, and
  re-checked on every open (`changePayableState`). `/pay/change/[token]` is
  `noindex` and throttled and shows the race, the two categories, the
  reference and the money, never the runner's name, email or phone; its
  checkout (`/api/category-change/checkout`) charges the stored `amount` plus
  the fee, never a figure from the request, and closes an earlier page first.
  A payment that lands for a change no longer waiting is never applied.
- **A price lock is a signed time, never a price** (`lib/price-lock.ts`,
  `PROMO_PRICE_LOCK_PLAN.md`). Anyone may take one from `/api/price-lock`
  (no database read), throttled in its own `price-lock` bucket
  (`PRICE_LOCK_RULE`, 20 a minute per address, 429 — the same per-instance
  speed bump as `CHECKOUT_RULE`, since minting one costs a signature and
  nothing else): a JWT under the app's secret with
  `purpose: 'price-lock'`, the event id as subject, `iat` = the moment it was
  taken, expiring 55 minutes later. The moment is the server's clock at
  issue; the request names only the event, so no caller can choose the time
  it is locked at. **It carries a time, never a price**, because a time can
  only point back at promotions that were really running, while an amount in
  the token would be a figure the checkout had to trust. `readPriceLock` refuses a forged or
  expired token, another purpose's token, and one for a different event, and
  every refusal is simply no lock. What a lock can buy is bounded: the
  checkout still prices every amount from the database, the lock moves only
  the promotions' date windows back to a moment we signed ourselves, paused
  and usage stay live, and the order gets the better of that moment and now —
  so a replayed or hoarded token is worth at most 55 minutes of a promotion
  that was really running. Both checkouts take it as an optional `priceLock`
  and never fail on it: a bad token is the order priced at now. The
  "Prices have changed" 409 hands back the server's own figures
  (`lib/price-changed.ts`), which are what the runner would be charged anyway,
  never anything the request could steer.
- Payment proofs are **private** blobs, served only through
  `/api/admin/proof/[id]` — and a category change's through
  `/api/admin/category-changes/[id]/proof` — with a roughly five-minute signed
  URL.
- Passwords are bcrypt-hashed; the session cookie is httpOnly, `sameSite=lax`,
  `secure` in production, with a one-day expiry — or **30 days when the person
  ticks "Keep me signed in"** (`LOGIN_UX_PLAN.md` Batch 4, D8; opt-in, off by
  default, on both the password form and the Google button, which carries it
  through the pending cookie). The token's `exp` and the cookie's `maxAge` both
  come from `SESSION_SECONDS` (`lib/jwt.ts`), and a reissued cookie (profile
  edit, password change, *Sign out other devices*) keeps the length chosen at
  sign-in (`reissueAuthCookie`, `lib/auth.ts`). **A long session is the reason
  `getActor()` re-checks `sessionsValidFrom`, suspension and the membership on
  every request** rather than trusting the token: a kept session is still
  ended at once by any of them. The `auth.signed_in` row records
  `keepSignedIn: true` when it was ticked. Two-step sign-in is optional and
  asked once per sign-in, not per request (see below), so on a shared race-day
  laptop the box should stay off, as the page says.
- **Sign-in is throttled, timed evenly, and only ever returns inside `/admin`**
  (`LOGIN_UX_PLAN.md` Batch 1). `POST /api/auth/login` checks `LOGIN_RULE`
  (10 a minute per address) before the body is read and `LOGIN_ACCOUNT_RULE`
  (5 a minute per normalized email, from anywhere) once it is, so one account
  cannot be guessed from many addresses either; both answer 429 with one
  sentence that does not say whether the address exists. They are the same
  per-instance limiter as `CHECKOUT_RULE` above — a speed bump, not a cap.
  **Every "Invalid credentials" costs one bcrypt compare**: when there is no
  password to check (no account, an Organizer row that is not Run As One's,
  an invitation not yet accepted) the route compares against a dummy hash
  (`verifyNoPassword`, `lib/auth.ts`), so a known address no longer answers
  ~100 ms slower than an unknown one. What still differs is a DB read or two
  and an audit write for a known account — milliseconds, not bcrypt's cost.
  **`next`** is written by the proxy but readable from any link, so the
  sign-in page passes it through `safeNextPath` (`lib/next-path.ts`): only a
  path starting `/admin`, never `//` or `/\`, no control characters or
  backslashes, never a public admin page; anything else becomes `/admin`. A
  person already signed in who opens `/admin/login` is sent on by the page
  itself through `getActor()`, **not by the proxy** — the proxy only checks
  the signature, so a revoked session would loop between the two. The form's
  boxes carry no `name`, so a press of Sign In before hydration (a native
  GET) cannot put the password in the address bar.
- **A forgotten password is reset by an emailed link, and the link is the
  weak point, so it is narrow** (`LOGIN_UX_PLAN.md` Batch 2,
  `lib/password-reset.ts`). Only the token's sha256 is stored; a link works
  **once, for 60 minutes**, and a newer request kills the older one. Only an
  account that could sign in gets one (the owner's row, or staff / a client
  viewer with a password, not suspended, with an active membership), and that
  is checked again when the link is used. `POST /api/auth/forgot-password`
  answers **every** address with the same 200 body, sends the email in
  `after()` so Resend's time is not on the clock, and holds the answer to a
  1-second floor so a real account's DB writes do not show either; it is
  throttled per address and per email (`PASSWORD_RESET_RULE`). A reset
  **ends every session** (`sessionsValidFrom`), writes `auth.password_reset`,
  sends a "password changed" email, and **does not sign the person in** — they
  sign in on `/admin/login?reset=1`, so there stays one way in for 2FA to sit
  on later. Both pages are public and `noindex`; the reset page also sets
  `referrer: no-referrer`, since its token is in the address.
- **Google signs in to an existing staff or client-viewer account, never
  creates one, and never signs in the owner** (`LOGIN_UX_PLAN.md` Batch 3,
  `lib/google-oauth.ts`). An account is found by the Google `sub` linked to it
  or, the first time, by an email Google marks `email_verified`; an account
  already linked to a different `sub` is refused, and so is an invitation not
  yet accepted (it has no password to fall back on). The owner's address is
  answered like an address with no account (D5). The flow carries `state`
  (matched against an httpOnly cookie scoped to the callback, 10 minutes,
  deleted on first use), PKCE S256 and a `nonce` checked inside the ID token,
  which is verified against Google's keys for issuer, audience and expiry.
  After the proof, `checkSignIn` (`lib/sign-in.ts`) applies the password
  route's own rules — suspension, active membership, archived client — so
  Google cannot let in anybody a password would not. The callback is
  throttled like sign-in, refusals reach the page only as a code from
  `lib/sign-in-errors.ts`, and the trail rows say `method: 'google'`. The link
  is written only after a sign-in passes (`auth.google_linked`); unlinking
  from Settings needs the current password (`auth.google_unlinked`).
- **Two-step sign-in is optional, per account, and turned on only by proving
  the app holds the secret** (`TWO_FACTOR_PLAN.md` Batch 2, D1;
  `lib/two-factor.ts`). The secret is sealed at rest with AES-256-GCM under
  `TOTP_ENCRYPTION_KEY` (`lib/secret-box.ts`) and is written **unconfirmed**
  by *Turn On*; it counts only once the first code is accepted, so a setup
  abandoned halfway changes nothing. Recovery codes exist in plain text once,
  in the confirm (or renew) answer; only bcrypt hashes are stored. **Turning it
  on or off ends every other session** (D9: `sessionsValidFrom`, this session
  reissued), so a session stolen earlier does not outlive the change. **Off
  takes the current password and a current code** (D6; a recovery code
  counts), and emails the person (D10). Every route that takes a code is
  throttled per account (`TWO_FACTOR_RULE`, 5 in 5 minutes, one window across
  them) and a wrong code writes `auth.two_factor_failed`; an accepted code's
  30-second step is stored (`totpLastStep`), so a code works once.
- **An account with two-step sign-in on is asked the code at both doors**
  (`TWO_FACTOR_PLAN.md` Batch 3, D2 — otherwise Google would be a way
  around it). Once the password or Google passes `checkSignIn`, the door sets
  no session: it sets `two_factor_pending` (`lib/two-factor-pending.ts`), a
  JWT under the app's secret with `purpose: 'two-factor'` and the account as
  `sub`/`account` — never a session's `kind` or `id`, so `verifyToken`
  refuses it, and a session has no `purpose`, so it is refused as one. It is
  httpOnly, `sameSite=lax`, path `/`, five minutes, and carries `method`,
  `keep`, `next` and a first Google sign-in's `sub` to link. **The code route
  checks the account again** (`signInSubject` + `checkSignIn`) before the
  code, so a suspension in those minutes holds; the session and the Google
  link are written only after the code is right. Throttled per address
  (`LOGIN_RULE`) and per account (`TWO_FACTOR_RULE`, the same window as
  Settings › Security); five wrong codes on one pending cookie end it, and
  every wrong code writes `auth.two_factor_failed`. A password reset still
  signs nobody in, and leaves two-step on, so it is no way around the code.
- **An admin may reset somebody else's two-step sign-in, never the owner's**
  (`TWO_FACTOR_PLAN.md` D4; `resetTwoFactor` in `lib/two-factor.ts`). From the
  Team page under `loadManagedMember`'s rules (`team:manage`, not one's own
  row, an admin not another admin), and from a client's Sign-ins under
  `platform:manage` (a VIEWER of that client, not one's own account) — the
  same OWNER and ADMIN either way. A reset clears the four columns, ends every
  session the person has (`sessionsValidFrom`), writes
  `auth.two_factor_reset` naming the admin, and emails the person (D10). The
  owner is an `Organizer` row with nobody above it: a lost phone without
  recovery codes is a hand-run database step, done only after proving who is
  asking (`ON_HOLD.md` §2).
- **An account is found by a lowercased email, and written as one.** `login`,
  `register` and `admin/profile` all run the address through
  `normalizeAccountEmail` (§5). The failure this prevents is quiet and reads
  as a wrong password rather than as a bug, so the invariant matters more
  than it looks: the stored value and every lookup have to agree by
  construction. The profile route in particular used to argue the opposite
  in its own comment — correctly, while login matched exactly — which is why
  changing one of the three means changing all three.

