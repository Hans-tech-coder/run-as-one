<!-- Part of the Run As One project guide. This file is §4, the data model; the index is PROJECT_GUIDE.md at the repo root.
     Section references like "§5" point to the other parts listed in the guide's routing table. -->

## 4. Data model (`prisma/schema.prisma`)

The schema's own doc comments explain *why* each column exists — read them. The
shape:

- **Organizer** — **Run As One itself, the one tenant** (`ADMIN_MERGE_PLAN.md`).
  Every event, promotion, staff membership and audit row belongs to its row,
  `seed-crc-organizer`, and **it is the only Organizer that signs in**
  (`RUN_AS_ONE_ORGANIZER_ID`, `lib/organizer-status.ts`) — as the owner, shown
  as Super Admin, with `email` / `password` / `name` as its login. `status` is
  plain text and only `APPROVED` may be signed in to (an allowlist, which
  staff sessions also check). `role` reads `ORGANIZER` on every row and nothing
  reads it (kept by the owner's call when Batch 5 dropped the rest).
  **`adminFee` is the default platform fee** (`SETTINGS_PLAN.md` Batch 4,
  `lib/platform-fee.ts`): the centavos a new event's Admin Fee box starts at,
  set by the Super Admin on `/admin/settings`. It is **never charged itself** —
  every order's fee comes from its event's own `Event.adminFee`, so changing
  the default reprices nothing that exists. **Batch 5 (migration `20260917180000_retire_super_admin`)
  deletes** the "System Owner" `SUPER_ADMIN` test row and the "Super Admin
  Test" row (with its `Client` copy), each by id and only while it owns
  nothing, and **drops** the fifteen application columns (`orgType` …
  `applicationNote`, which live on `Client`) and the approval-only
  `statusNote` / `statusChangedAt`. Owns `Event[]`, `PromoCode[]` and `staff`
  (`StaffMembership[]`).
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
  *that* pickup existed), certificate template + coordinates, and **`clientId`** — which client the race
  is run for (null = not linked yet; staff link a race through the event form's Client
  picker, and a null is invisible to every client viewer). Owns `Category[]`, `BankAccount[]`, `Registration[]`,
  `RaceResult[]` and `Remittance[]` — **an event with any remittance cannot be
  deleted** (the DELETE route answers 409 naming the count).
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
  defaults to `"INDEPENDENT RUNNER"`), and **guardian consent** for a runner 12
  or under on race day (`GUARDIAN_CONSENT_PLAN.md`): `guardianName` (uppercase),
  `guardianRelationship` (`PARENT` | `LEGAL_GUARDIAN`, a plain string guarded by
  `asGuardianRelationship`) and `guardianConsentAt` (stamped by the checkout
  route, never taken from the client). All three nullable: null for every
  runner who did not need consent, and for rows written before it existed (not
  backfilled). Staff may correct `guardianName` / `guardianRelationship` through
  the runner edit; `guardianConsentAt` is only ever the checkout's stamp.
  Indexed on `categoryId`, which is how
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
  on a "register 5, get 1" is six on one receipt and one on another),
  **`PERCENTAGE`** or **`FIXED`** (the per-runner kinds, brought back
  2026-09-19 by `MARKETING_DISCOUNTS_PLAN.md`: `discountValue` is the whole
  percent 1–100 or the centavos off, taken off **each discounted runner's entry
  line** — category price plus shirt upcharge — and never off a fee; a fixed
  amount is capped at that runner's entry), or **`PACER`** (a free entry for one
  named pacer, `PACER_DISCOUNT_PLAN.md`, migration
  `20260922100000_pacer_codes`). `discountValue` is 0 for the two
  older kinds and for `PACER`, whose discount is always the whole entry line. The per-runner kinds are claimed by one shared code or
  single-use vouchers, **never automatically** (owner's decision; the early
  bird is `CATEGORY_PRICE`). `eventId` scopes it to one event; null means every
  event that organizer runs, which a `CATEGORY_PRICE` promotion may never be,
  since categories belong to an event. A promotion's window is
  `validFrom`/`validUntil`, both optional. **`usageLimit` counts runners for
  `PERCENTAGE` and `FIXED` and orders for the older kinds**
  (`limitCountsRunners` in `discount.ts`): a shared per-runner code may carry a
  runner limit (blank = none, never set below the runners already counted), and
  a group of five uses five. The older kinds set none from the form. **A
  single-use voucher is just a limit of 1**, so there is no separate flag — and a
  per-runner voucher covers exactly one runner, so one runner and one order mean
  the same thing there. `batchLabel` is what makes two
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
- **PromoCode, the three pacer columns** (`PACER_DISCOUNT_PLAN.md`, Batch 1).
  **`waiveAdminFee`** — whether this pacer's free entry also waives Run As One's
  admin fee, which is what makes the whole order ₱0 and skips the payment step.
  It is the **one deliberate exception** to "fees are never discounted", and
  **only `promo:waive-fee` (OWNER) may set it**, because the admin fee is Run As
  One's own money (`settlement.ts`) rather than the organizer's to give away.
  **`assigneeName`** — the pacer's name, uppercase like every other stored name,
  shown only in the dashboard: a pacer code is given to a person, so the screen
  has to be able to say whose it is. **`codeSentAt`** — when staff marked the
  code as sent, null until they do. The app **emails no pacer** (staff copy the
  code and send it by hand, the owner's decision), so this column is the only
  evidence the dashboard has that somebody was actually told, and it is what the
  amber *Code not sent* reminder counts. **Copying the code does not set it**:
  copying is not sending, and a guessed mark would hide exactly the pacer the
  reminder exists for. All three are defaulted or nullable, so no existing
  promotion needed a backfill. A pacer code is `usageLimit` 1, `automatic` false,
  a required `eventId` and **exactly one `PromoCategory` row**.
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
- **PromoCategory** — one category a `PERCENTAGE`, `FIXED` or `PACER` discount
  is restricted to: `promoCodeId`, `categoryId`, unique per pair, cascading on
  both sides (migration `20260919180000_promo_category`). **No rows means every
  category**, the default. Only offered when the promotion names one event, and
  every id is checked against that event. Runners outside the chosen
  categories pay full price; an order with none of them is refused by name. The
  rows carry no count, so an edit **replaces** them (for every voucher of a
  batch at once), unlike `PromoCategoryPrice`. A voucher batch writes them for
  every voucher in the create transaction — 500 vouchers × 2 categories is
  1,000 two-id rows. A **pacer code has exactly one row**, written in the same
  statement as the code and never editable afterwards: it is the slot the
  organizer set aside and it is in the code's own text
  (`PACER-21KM-7KQ4`), so moving it would silently move a held place from one
  distance to another.
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
  (`inviteTokenHash`); the token itself exists only in the email. **A membership
  may also be a client viewer**: `role = 'VIEWER'` with **`clientId`** set, on
  Run As One's own organizer row — the organization's own sign-in, which sees
  registrant counts of its client's events and nothing else (§5 `actor.ts`). A
  `VIEWER` without a client reaches nothing. Viewers are **not team members**:
  the team screen, its routes and its matrix read `TEAM_ROLES` and never list,
  offer or manage one.
- **Remittance** — money Run As One paid a race's organizer (`kind` `PAYOUT`),
  or the organizer handed back (`RETURN`) (`ADMIN_MERGE_PLAN.md` Batch 6,
  migration `20260917200000_remittances`). **Per event** (`eventId`, RESTRICT),
  `amount` in positive centavos, `paidOn` (`YYYY-MM-DD` Manila — the day the
  money moved), `method` (`BANK_TRANSFER` / `GCASH` / `MAYA` / `CASH` /
  `CHECK` / `OTHER`), optional `reference`, `note` and `proof` (a **private**
  blob pathname under `remittances/`, served by signed URL), `recordedById` +
  snapshotted `recordedByName`, and `status` `RECORDED` / `VOIDED` with
  `voidedAt` / `voidedById` / `voidedByName` / `voidReason`. **Never edited,
  never deleted** — a mistake is voided with a reason and the right one
  recorded, so the list keeps every line. **What is owed is not stored**: it is
  summed from PAID registrations on every read (§5 `settlement.ts`), so a
  refund after a payout lowers it by itself. A handful of short rows per race.
- **Client** — an organization Run As One runs races for (`ADMIN_MERGE_PLAN.md`).
  `name`, `email` (unique, lowercased), `status` (`NEW` / `INVITED` / `ACTIVE` /
  `ARCHIVED`, plain text — `lib/client.ts`), `invitedAt`, and the application
  columns the form collects (`orgType` … `applicationNote`, all nullable —
  `Organizer` carried them until Batch 5 dropped its copies). Owns `Event[]` (through `Event.clientId`) and `viewers`
  (`StaffMembership[]`). Migration `20260917120000_clients_and_viewer_role`
  **copied every applicant `Organizer` row into a `Client` with the same id** —
  an applicant being an `ORGANIZER`-role row that owns no event, promotion or
  membership, so Run As One's row and the super admin were left out by what they
  held rather than by id; rejected and suspended applicants became `ARCHIVED`,
  the rest `NEW`. Batch 5 dropped the Organizer copies. **Since Batch 3
  every application writes one of these and nothing else** (`auth/register`):
  no Organizer row, no password. `invitedAt` is stamped by each Send invite.
  Tens of rows of short text; not a storage decision.
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
- **SiteSettings** — site-wide settings staff edit at `/admin/settings`, **one
  row keyed `"site"`**. `contactEmail`, the admin email the whole app shows and
  mails from, and the footer's social links **`facebookUrl`, `instagramUrl`,
  `tiktokUrl`, `youtubeUrl`** (nullable, stored with their `https://` scheme;
  **null hides that channel's icon**). No row means the defaults in
  `site-contact.ts`, so it works before anybody saves. Read only through
  `site-settings.ts` (§5). Migrations `20260918090000_site_settings` and
  `20260918110000_site_social_links`, both additive; a few dozen bytes.
- **`lastLoginAt`** and **`sessionsValidFrom`** on **Organizer** — the owner's
  last sign-in (written by `auth/login`, shown under Sign-in Activity and on the
  Team table) and the instant before which every owner session is dead (read by
  `getActor()`, moved by *Sign out other devices* and by a password change).
  StaffAccount has had both since staff accounts existed. **Both nullable** —
  unlike StaffAccount's `sessionsValidFrom`, which defaults to now — so adding
  them signed nobody out: null means no owner session was ever ended.
  Migration `20260918120000_organizer_sessions`, additive (two timestamps on
  one row; `SETTINGS_PLAN.md` Batch 3).
- **`avatarUrl`** on **Organizer** and **StaffAccount** — the person's optional
  profile photo, a public blob URL (`avatars/`), set from `/admin/settings`
  and drawn in the account menu; null draws the name's initial. Migration
  `20260918100000_account_avatar`, additive (one nullable text column each);
  the photo itself is a ~20 KB JPEG in the blob store, not in Postgres.

