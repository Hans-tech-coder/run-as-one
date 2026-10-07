# On hold

Everything that was planned and **not** built, gathered from the finished plan
documents. Those plans were deleted on 2026-10-01; each item below names its
source, which can still be read with
`git show 3126357:docs/archive/<NAME>_PLAN.md`. Every item here is on hold by
the owner's choice. Start one only when the owner asks, and read its source plan
before writing any code. When an item is picked up, give it its own plan file in
`docs/plans/`, and delete it from this list once it has landed.

The release steps come first because they block production, not a feature.

**Pending for the next release (2026-10-05):** migrations
`20261005090000_registration_hold_until` (one nullable column,
`Registration.holdUntil`, `UNPAID_FOLLOWUP_PLAN.md` Batch 3) and
`20261006090000_pacer_bib_number` (one nullable column, `PromoCode.bibNumber`,
the pacer's bib that keeps them off the results podium; applied to the dev
database) and `20261007090000_pacer_pace_group` (one nullable column,
`PromoCode.paceGroup`, the group a pacer leads, printed on their e-certificate;
applied to the dev database). Run
`npx prisma migrate deploy` with `DIRECT_URL` on the production endpoint
**before** the new code goes live: the code reads the column, and the old code
ignores it, so migrating first is safe in both directions.

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

*Source: `STAFF_ACCESS_PLAN.md`, Batch 4. `SETTINGS_PLAN.md` also
put it on hold with "owner's call, revisit only when asked".*

- A security panel under Settings. The user enrols by scanning a QR code,
  confirms with a code, and sees ten single-use recovery codes once.
- **Required** for any membership that holds `registration:validate`,
  `registration:delete` or `event:delete`. Optional for `VIEWER` and `ENCODER`.
- Enforced at sign-in (`api/auth/login`), not only in the UI.
- 2FA uses TOTP, not SMS. That is settled.
- The settings page has one page of panels and no sub-routes, so this goes on
  that page as a panel, not on its own route. See the standing decisions in
  `SETTINGS_PLAN.md` (from git history).
- Needs a migration for the TOTP secret and the recovery codes. Keep it small,
  because the database is on Neon's free 0.5 GB tier.

## 3. Google sign-in and the sign-in retention sweep (optional)

*Source: `STAFF_ACCESS_PLAN.md`, Batch 5.*

- **Google sign-in**, bound to an invited account's verified email. Nobody signs
  up through Google. It only signs in an account that already exists.
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
