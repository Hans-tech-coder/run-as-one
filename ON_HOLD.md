# On hold

Everything that was planned and **not** built, gathered from the finished plan
documents. Those plans were deleted on 2026-10-01; each item below names its
source, which can still be read with
`git show 3126357:docs/archive/<NAME>_PLAN.md`. Plans written later in the
gitignored `docs/plans/` were never committed and are gone once deleted;
`docs/current-state.md` keeps what each one built and the decisions it
settled. Every item here is on hold by
the owner's choice. Start one only when the owner asks, and read its source plan
before writing any code. When an item is picked up, give it its own plan file in
`docs/plans/`, and delete it from this list once it has landed.

**Pending for the next release: one migration.**
`20261028031230_event_add_ons` (`ADD_ONS_PLAN.md` Batch 1, 2026-10-28): two
new tables, `EventAddOn` (an event's optional items) and `RunnerAddOn` (one
runner's purchased line), and two Int columns on `Registration`,
`addOnTotal` and `addOnRunAsOneTotal`, both defaulting to 0. Applied to the
local-dev database. Additive: the old code ignores it, so run
`npx prisma migrate deploy` with `DIRECT_URL` on the production endpoint
before (or with) the deploy. Rollback is in the migration's header comment.

Before that, every migration through
`20261023031425_past_event_photo_albums` was applied in production
(2026-10-23). Event publishing, virtual runs (Phase A), category changes,
delivery switches, the promo price lock and the Past Events tab are all live
(`docs/current-state.md`, top). Still to watch on production: the first
online upgrade and the first online delivery switch settled by a real PayMongo
webhook (only a signed script and the `?paid=1` return path have settled one),
and the daily sweep expiring an unpaid upgrade or switch.

**Delivery switches: a Run As One switch fee (future, same source).** v1 has
none (L7): the delivery fee is the whole price and all the organizer's (L8). A
configurable fee would be set per event like `categoryChangeFee`, counted with
platform fees in `settlement.ts` as the change fee is.

**Delivery switches: runner self-service (future, same source, L1/L14).** Today
only staff switch a receipt, after the runner asks by chat. Runner
self-service would sit with the category change's *Manage my registration*
link (Phase 2 below). Also out of scope for v1 (L14): switching some runners of
a group order, changing only the address of an order already on delivery,
refunds on a reverse switch, and kit release or shipment tracking.

**Category changes: downgrades (on hold, owner 2026-10-18).** The app does not
take a runner to a cheaper category for now: `DOWNGRADES_ON_HOLD` in
`src/lib/category-change-settings.ts` disables those options in the modal ("Downgrade
not offered yet"), `createCategoryChange` refuses them, and the event form
hides the *Moving to a Cheaper Category* refund setting. Upgrades and
same-price moves go ahead. The downgrade flow itself (D5 refund policy,
`REFUND_DUE` → *Record refund* → `REFUNDED`, the settlement line's refund
rows) is built and was tested on local-dev; turning it on is setting the flag
to `false`, then walking one NO_REFUND and one REFUND_DIFFERENCE downgrade
on staging.

**Category changes, Phase 2: runner self-service (on hold).** A *Manage my
registration* link in the runner's email, so a runner can ask for (or make)
a category change without chatting staff. Left out on purpose
(`CATEGORY_CHANGE_PLAN.md` D2, recorded in `docs/current-state.md`): runners
have no accounts, so it needs a signed per-runner link, the same eligibility
and quote (`category-change.ts`), and a decision on whether a runner's own
downgrade may apply without staff. Also out of scope there and still not
built: changes on PENDING orders (D9), moving a runner to another event, and
refunds paid back through PayMongo automatically (refunds are paid by hand and
recorded). A PayMongo payment that arrives for an expired or cancelled upgrade
is flagged in the activity trail (`category_change.payment_late`) and is
**not** in remittances until a person refunds it or reopens the change.

**Event publishing leftovers (on hold).** From `EVENT_PUBLISH_PLAN.md`
(decisions D1–D9 recorded in `docs/current-state.md`): (1) the edit form only
*shows* whether an event is public — changing it is the events list's
**Publish Event** item; publishing from the edit form itself was not built.
(2) The server checks "publish no later than sign-ups open" (D8) on create and
on `admin/events/[id]/publish` only; the edit PUT and the opening PATCH from
**Schedule Sign-Ups** rely on the browser check. (3) Hiding drafts from
client viewers (D7, `reachableEvents`) was never exercised with a viewer
session signed in.

**Client subdomains: released 2026-10-14, setup still pending.** Steps 1–2
are done: both migrations (`20261013090000_client_site_branding`,
`20261014014104_client_site_icon`) are on production and `main` is at
`763171e`. Still to do, in this order:

1. ~~Migrations~~ (done 2026-10-14).
2. ~~Promote `dev` to `main`~~ (done 2026-10-14).
3. At the outside registrar (GoDaddy: `ns67`/`ns68.domaincontrol.com`), a
   CNAME per client to `cname.vercel-dns.com`
   (`crc`, `racecore`); then add `crc.runasone.ph` and
   `racecore.runasone.ph` to the Vercel project `run-as-one` (Production).
   Vercel issues the certificates. Wait until `https://crc.runasone.ph`
   answers. **CRC is done** (`crc.runasone.ph` answers with its branding,
   2026-10-15); **RaceCore is not** (`racecore.runasone.ph` does not resolve).
4. Only then, on `/admin/clients` › Site & branding, set each subdomain and
   upload the logo and the square site icon (CRC's is the "CRC" letters
   cropped from its logo). A subdomain whose address does not answer yet is
   refused on save.
5. Link every RaceCore and CRC event to its client; a null `clientId` stays
   on the main site.

A **new client later** needs steps 3 and 4 only. Moving `runasone.ph` to
Vercel's nameservers with one `*.runasone.ph` would skip step 3 for good, but
it touches the Resend DNS records: optional, and done carefully if ever.

**Combinable promotions: released 2026-10-15.** Migration
`20261015090000_combinable_promos` is on production and `main` is at
`ae513ac`. A combined order, its stored row and its receipt email were walked
in pre-deploy QA (`docs/current-state.md`, top). **Still to see:** the first
real QR Ph payment turning `PAID`, since the webhook signature check changed
in this release and cannot be exercised from localhost.

The list below went out in the 2026-10-13 release (`docs/current-state.md`).

**Pending for the next release (2026-10-05):** migrations
`20261005090000_registration_hold_until` (one nullable column,
`Registration.holdUntil`, `UNPAID_FOLLOWUP_PLAN.md` Batch 3) and
`20261006090000_pacer_bib_number` (one nullable column, `PromoCode.bibNumber`,
the pacer's bib that keeps them off the results podium; applied to the dev
database) and `20261007090000_pacer_pace_group` (one nullable column,
`PromoCode.paceGroup`, the group a pacer leads, printed on their e-certificate;
applied to the dev database) and `20261008090000_registration_closed` (one
nullable column, `Event.registrationClosedAt`, the organizer's Close Sign-Ups;
applied to the dev database) and `20261008120000_event_results_only` (one
boolean column, `Event.resultsOnly` defaulting to false,
`RESULTS_ONLY_EVENT_PLAN.md` Batch 1; applied to the dev database; that plan
and `RESULTS_NAV_PLAN.md`, which needs no migration of its own, have both
landed) and `20261011062955_result_pacer` (one new table, `ResultPacer`, a
results-only race's pacer tags, `RESULTS_ROW_ACTIONS_PLAN.md` Batch 2; applied
to the local-dev database; additive, so the old code ignores it) and
`20261011064837_result_edited_at` (one nullable column, `RaceResult.editedAt`,
a result corrected by hand, `RESULTS_ROW_ACTIONS_PLAN.md` Batch 3; applied to
the local-dev database; additive) and `20261011083751_password_reset` (one new
table, `PasswordReset`, the forgot-password links, `LOGIN_UX_PLAN.md` Batch 2;
applied to the local-dev database; additive) and
`20261011120000_staff_google_sub` (one nullable unique column,
`StaffAccount.googleSub`, Google sign-in, `LOGIN_UX_PLAN.md` Batch 3; applied
to the local-dev database; additive) and `20261012025827_two_factor` (four
nullable or defaulted columns on `Organizer` — `totpSecret`, `totpConfirmedAt`,
`recoveryCodes`, `totpLastStep` — and `totpLastStep` on `StaffAccount`,
two-step sign-in, `TWO_FACTOR_PLAN.md` Batch 1; applied to the local-dev
database; additive). **Also set `TOTP_ENCRYPTION_KEY`** in Vercel (Production
and Preview) before two-step sign-in ships (`TWO_FACTOR_PLAN.md` Batch 2 on);
keep a copy in the password manager. Run
`npx prisma migrate deploy` with `DIRECT_URL` on the production endpoint
**before** the new code goes live: the code reads the column, and the old code
ignores it, so migrating first is safe in both directions.

**After that release goes live:** on `https://runasone.ph/admin/login`,
check that **Continue with Google** shows and completes one sign-in (the
Google client's redirect URIs must list
`https://runasone.ph/api/auth/google/callback`). ~~Move the 3 existing
results-only races to Results~~ (done before the 2026-10-15 release, which
removed the switch: PHM 2026, BizRun V2.0 and CIM 2026 are under Results). A
race made in the wrong place from now on is recreated in the right one.

---

## 1. After the 2026-09-30 release: retired test accounts

The release this section used to hold **is live** (2026-09-30): all 15
migrations are on production, `main` is at `974adf5`, and the owner finished
the in-app steps (Run As One's account on `runasoneph@gmail.com`, the
Cresendo Running Community client, its events linked, the invite sent) and the
spot-checks. `retire_super_admin` was run **after** the new code went live
(recorded with `migrate resolve --applied`, then its SQL through
`prisma db execute`), because it drops columns the old code still read — the
pattern is in `.claude/skills/pre-deploy-qa/deploy-commands.md`.

Still the owner's call: whether to remove what is left of the retired test
accounts. That migration deleted the "System Owner" and "Super Admin Test"
Organizer rows only if they owned nothing, so check what remains of them and
of the test client "Test" before deleting anything. Confirm the exact rows
first.

---

## 2. Two-factor sign-in (TOTP)

**Built:** `TWO_FACTOR_PLAN.md` Batches 1–4 landed on `dev` 2026-10-12; the
plan is deleted (its decisions are in `docs/current-state.md`). Two-step
sign-in is **optional per account**. Left on hold:

- **Making it required** for roles holding `registration:validate`,
  `registration:delete` or `event:delete` (the rule this item used to carry,
  from `STAFF_ACCESS_PLAN.md` Batch 4; the plan's D7). Wait until a race season
  has run with it optional, so nobody is locked out on race day. The Team
  page's "Two-step on" marker shows who has not turned it on yet.
- **Not proven live before promoting** (every route was proven on localhost,
  with codes computed from the stored secret):
  - one Google sign-in on an account with two-step on;
  - one owner sign-in with it on;
  - scanning the Settings › Security QR with a real authenticator app once;
  - the **Reset Two-Step Sign-in** button on a viewer's line in the client
    panel (`/admin/clients`), clicked in a browser. Its route is proven; the
    Team page's button was clicked;
  - the "turned off" and "reset" emails arriving. On localhost every email
    then failed with Resend's `Invalid reply_to`, from a bad saved contact
    address. `f29e7a6` fixed that, but neither email has been sent since.
- Not planned: SMS codes, passkeys, "remember this device" (the plan's D5).

### Runbook: the owner lost their phone and their recovery codes

Nobody can reset the owner's two-step sign-in in the app (the plan's D4): the
owner is Run As One's `Organizer` row, and there is no admin above it. An admin
or a staff member's reset is on the Team page; a client viewer's is in the
client's Sign-ins.

> **Do this only after proving who is asking** — in person, or on a call to a
> number already known, never on the strength of an email or a chat message.
> Clearing it leaves the owner's account behind the password alone, and the
> owner's account can do everything.

On the database the owner signs in to (production: endpoint
`ep-still-pine-b3n210bs`), in the Neon SQL editor:

```sql
UPDATE "Organizer"
SET "totpSecret" = NULL,
    "totpConfirmedAt" = NULL,
    "recoveryCodes" = ARRAY[]::TEXT[],
    "totpLastStep" = NULL,
    "sessionsValidFrom" = date_trunc('second', now() AT TIME ZONE 'UTC')
WHERE id = 'seed-crc-organizer';
```

It must update exactly one row. Moving `sessionsValidFrom` signs out every
owner session, including any on the lost phone. Then the owner signs in with
the password alone, turns two-step sign-in on again in Settings › Security
with the new phone, and keeps the new recovery codes in the password manager.
Nothing writes a trail row for a hand-run step, so note it somewhere the owner
will see.

## 3. The sign-in retention sweep (optional)

*Source: `STAFF_ACCESS_PLAN.md`, Batch 5. Its Google sign-in part landed in
`LOGIN_UX_PLAN.md` Batch 3.*

- **Retention sweep**: a scheduled job, like the ones in `vercel.json`, that
  trims old sign-in and audit rows. **The audit log is append-only**, so decide
  with the owner what may be swept before building this.
- The *sign out every other device* part of this batch has **already shipped**
  (Settings Batch 3, `api/admin/profile/sessions`). Do not build it again.

## 4. Organizer's logo on printed documents

*Source: `GUARDIAN_CONSENT_PLAN.md`, "Where it stands".*

The printed guardian consent sheet
(`admin/events/[id]/registrants/[runnerId]/consent`) shows the Run As One logo.
The owner wants the client's or the event's own logo there once the dashboard has
a setting for it. Run As One stays the default and the fallback.

## 5. Revoking a single client viewer (check first)

*Source: `ADMIN_MERGE_PLAN.md`, the deferred notes in Batches 3–4.*

When those batches landed, the only way to cut off one client viewer's sign-in
was to archive the whole client. Check `/admin/clients` before you start,
because a later change may already have added a suspend option.

## 6. Leftovers from the 2026-09-23 security fixes

*Source: `SECURITY_FIX_PLAN.md`, closed 2026-10-01 after the owner's verification
scan (`run-as-one-scan_97fc`) completed with no findings. Read it with
`git show 3126357:SECURITY_FIX_PLAN.md`.*

- **The Strix test order in the dev database.** The scan's proof of concept
  placed an order as `attacker@example.com` in the **dev** database (not
  production). It is left alone until the owner decides what to do with it.
  Confirm the exact rows before touching them.
- **Two transitive advisories still open:** `deepmerge-ts` < 8 and `mysql2`
  ≤ 3.23.0. Fixing them needs `npm audit fix --force` (a breaking major), so
  leave them unless a later scan shows they can be reached.

## 7. Leftovers from the unpaid-orders plan

*Source: `UNPAID_ORDERS_PLAN.md` (gitignored, never committed), closed
2026-10-05. What it built is in `docs/current-state.md`. The resume-payment
link, the unpaid tab's row menu and the hold length moved to
`UNPAID_FOLLOWUP_PLAN.md`, now finished (§9).*

Checked on staging (`run-as-one.vercel.app`, the `dev` branch on `local-dev`)
on 2026-10-05 and passed: VIEWER/ENCODER see the tab and Copy contact but not
Check payment; a QRPh test payment was marked PAID by the webhook alone, with
its receipt and no trail row; the PAID-order delete warning, the order staying
PAID; the sweep moving an order to "Expired" and every screen dropping it from
the count together. The owner accepted the rest as is (the Registrants tab's
count is noted in `docs/routes.md`). One thing waits on a business change:

- **Test the webhook's GCash/Maya path when those methods are switched on.**
  Production takes QRPh only until the owner has a business TIN, so only
  QRPh's `checkout_session.payment.paid` has run end to end. GCash and Maya
  store a `pi_` id and are settled by `payment.paid`; run one test payment of
  each on staging before enabling them in production.

---

## 8. Our own QR Ph payment page (instead of PayMongo's hosted checkout)

*Source: owner's question on 2026-10-05, during `UNPAID_FOLLOWUP_PLAN.md`
Batch 3. Not planned; the owner chose to keep PayMongo's hosted checkout.*

PayMongo's hosted page shows QR Ph as a choice, and the QR only after the
runner presses **Continue**. The owner suspects some runners abandon there.
If it is picked up, in this order:

1. **Check the suspicion first**, with the live key: for abandoned orders, a
   checkout session whose payment intent is still `awaiting_payment_method`
   never reached the QR; `awaiting_next_action` saw it and did not pay.
2. A cheap step either way: a line in the wizard before the redirect telling
   the runner to choose QR Ph and press Continue.
3. Only if the data agrees: render the QR ourselves through PayMongo's
   [QR Ph API](https://developers.paymongo.com/docs/payment-acceptance-qr-ph-api)
   (Payment Intent → attach → `next_action.code.image_url`, single-use,
   30-minute expiry), on `/pay/[token]` so the first checkout and the
   resume link share one page. QR Ph only; other methods keep the hosted page,
   and cards stay there regardless (PCI). Needs a countdown and a new-QR
   button, a prominent "save the QR" for phones (a runner cannot scan their
   own screen), status polling, and the webhook's `payment.paid` path for the
   QR intent.

---

## 9. Leftovers from the unpaid follow-up plan

*Source: `UNPAID_FOLLOWUP_PLAN.md` (gitignored, never committed), closed
2026-10-06. What it built — the Unpaid checkouts row menu, the follow-up log,
Cancel order…, the resume-payment link and sending it — is in
`docs/current-state.md` and `docs/routes.md`. Its migration is in the release
steps at the top of this file.*

Left out by the owner's decisions (2026-10-05), to start only when asked:

- **Reinstating an EXPIRED order** (decision D5). Its slot and promo are
  already released, so reopening it means re-checking capacity and
  re-spending the promo, which may be gone or full. Today an expired row
  offers *Copy registration link* and the runner registers fresh.
- **Reminder emails on a timer** before a hold ends. Each one spends Resend
  quota (free tier: 100 a day) without a person deciding to.
- **SMS sent from the app.** Needs a paid SMS provider; staff use the row's
  *Text (SMS)* link from their own phone instead.
- **Running the sweep more often than daily.** Vercel Hobby allows one cron a
  day.

Not walked, and why:

- **A GCash or Maya resume payment.** Only QRPh is offered
  (`OFFERED_PAYMONGO_METHODS`), so no such order can be placed. The
  resume path's GCash/Maya branch is the old checkout code moved unchanged
  into `lib/paymongo-session.ts`; test one on staging alongside §7's webhook
  check before enabling either method.
- **A VIEWER-role staff member logging a follow-up.** Every role holds
  `registration:view`, so the route lets them; it was walked as the owner
  only. Worth one try on staging with a VIEWER account.
- **The registration wizard's own checkout after the PayMongo code moved
  out of `api/checkout`.** Typechecked, and the resume path drives the same
  `openPaymongoPage`; run one wizard checkout on staging before release.

Test data left in `local-dev` (the `br-dry-grass-b3ubrfhy` branch, never
production): `RM-B2TEST1` (CANCELLED), `RM-B4TEST1` (PAID), `RM-B4TEST2`
(PENDING, email deliberately invalid, so PayMongo refuses to bill it).

## 10. E-certificate on a template: phase 2

*Source: `ECERT_TEMPLATE_PLAN.md`; phase 1 (the designed layout) shipped.*

- **Embedded fonts.** Outfit for the sans, and a serif "Classic" preset, via
  `@pdf-lib/fontkit`. Also lets names outside WinAnsi print (pdf-lib's standard
  fonts throw on them).
- **Readability backdrop.** None / soft / solid panel behind the content block,
  for templates too busy for the text to sit on directly.
- **Upload checks.** Warn on a wrong ratio or under 2480px wide; move template
  uploads direct-to-Blob so a PDF over 4 MB can go through.
- **PDF templates.** A thumbnail in the panel and `auto` ink sampling; today a
  PDF template gets dark ink unless the admin picks light.

## 11. Leftover from the results row actions plan

*Source: `RESULTS_ROW_ACTIONS_PLAN.md`; all five batches shipped (pacer tags,
Edit details, Add runner, delete one or many).*

- **A Pacer column in the upload**, for a timer's sheet that marks its pacers
  itself, so a results-only race's pacers are tagged on upload rather than
  one by one with *Mark as pacer*. Worth building only once the owner sees
  such sheets.

## 12. Leftovers from the login convenience plan

*Source: `LOGIN_UX_PLAN.md` (gitignored, never committed), all four batches
landed on `dev` 2026-10-11 and 2026-10-12, deleted 2026-10-12. What it built
(show password, `?next=`, forgot password, Google sign-in, "Keep me signed
in") and its decisions are in `docs/current-state.md`.*

- **"Continue with Google" on the invite page** (the plan's D6), so a new
  person accepts an invitation without choosing a password. Left out on
  purpose; revisit after Google sign-in has run in production.

Not walked in a browser, worth one try before or after release:

- **Chrome's save-password prompt and autofill** on `/admin/login` (the
  in-app browser has no password manager).
- **A sign-in with "Keep me signed in" ticked.** The tokens were proven to
  last 30 days; tick it, sign in, and check in DevTools that the
  `admin_token` cookie expires in 30 days.
- **Google refusing the owner's address and a suspended account.** Proven in
  the matching test and the password matrix, not by a click-through. Optional.

## 13. Leftovers from the client subdomain plan

*Source: `CLIENT_SUBDOMAIN_PLAN.md` (gitignored, never committed), all five
batches landed on `dev` 2026-10-13 and 2026-10-14, deleted 2026-10-14. What
it built and its decisions D1–D11 are in `docs/current-state.md`.*

Left out on purpose (the plan's out-of-scope list):

- A designed home page per subdomain (D1 says the subdomain's `/` is its
  `/events`).
- Per-client brand colours and themes.
- Client-branded emails and e-certificates (sender and design stay Run As
  One's, D10).
- Client viewers editing their own branding (D7: staff only).
- Custom domains a client owns outright (`crcrunning.com`).
- A sitemap or `robots` per host. The app has neither; the canonical URLs
  on event pages are enough until one is added.

Known and not done:

- **A no-client event opened on a subdomain going to the main site** was
  never walked: every `local-dev` event has a client. `eventOrigin` returns
  the main origin for it (checked in code); try it once after release.
- **Every page renders per request.** The root layout reads the host for
  the client's branding, so pages that used to be prerendered (`/privacy`,
  `/terms`) no longer are. Avoiding it means routing each host to its own
  segment, which is a restructure.
- **The theme-following tab icon on the main site may not win.** The static
  `/icon.svg` link can land after the one `ThemedFavicon` adds, so the
  browser may keep the static file (which carries its own light/dark rule).
  Believed to date from Batch 2's move to `generateMetadata`; not proven.

## 14. Leftovers from the promo price lock plan

*Source: `PROMO_PRICE_LOCK_PLAN.md` (gitignored, never committed), Batches 1–4
landed on `dev` 2026-10-22 (`fb90815`, `24f30b6`, `39c5759`, `a5ac5da`), not
released. What it built and its decisions D1–D3 and R1–R6 are in
`docs/current-state.md`.*

Left out on purpose:

- **Reserving promo seats or usage during the lock** (R1). The lock freezes
  only the date window; an early bird whose seats fill mid-form is still lost,
  and the 409 `PRICE_CHANGED` notice says so with the new total.
- **Saving a draft of the form.** The 409 notice's *Reload page* button
  reloads, which clears every field the runner typed; a saved draft would let
  them reload without starting over.
- **Category-change and logistics-change checkouts.** They do not take or read
  a lock: staff start them and they are priced at the moment of the change.
- **The Oct 18–19 order itself.** Staff reconcile it in the admin; nothing in
  the app re-prices an old order.

Not walked in a browser, worth one look after release:

- **A full 45 + 10 minute expiry.** Covered by `scripts/check-price-lock.ts`;
  the browser runs shortened it with a shifted clock.
- **A renewal that moves the total** was seen only with a rewritten
  `/api/price-lock` response (Batch 3), not a real promotion ending mid-lock.

## 15. Leftovers from the event add-ons plan

*Source: `ADD_ONS_PLAN.md` (gitignored, never committed), Batches 0–4,
2026-10-28; Batches 0–3 on `dev` (`fa76dd5`, `54c8871`, `bfddc29`,
`6d41c01`), Batch 4 in the working tree; not released. What it built and the
owner's decisions D1–D9 are in `docs/current-state.md`.*

Phase 2, left out on purpose:

- **Buying an add-on after registering** (D4), from Track My Registration,
  through the resume-payment flow the category change uses. Phase 1 sells
  add-ons only inside the registration wizard.
- **Removing or refunding one add-on line** from a paid order. Cancel and
  refund stay whole-order.
- **Add-on-only purchases**: merch bought with no race entry.
- **A per-size price or an upcharge on add-ons** (D7 says one price for every
  size; the race shirt's `shirtSizeUpcharge` does not apply).

Not walked in a browser, worth one look after release:

- **The whole flow on one fresh order**: the plan's "Done when" group of two
  (one runner with a shirt in M, one without) paid on the PayMongo test page
  was checked in parts across Batches 2–4 on `local-dev`'s PRICE LOCK TEST,
  with Batch 3's script marking the orders paid, not by one webhook-settled
  order end to end.
- **A sent receipt in a real inbox.** Batch 4 rendered both registration
  emails from the stored orders and checked their lines sum to the total; it
  sent none.
- **The stock count coming back when an unpaid checkout with a shirt
  expires** through the daily sweep.
