# On hold

Everything that was planned and **not** built, gathered from the finished plan
documents. Those plans were deleted on 2026-10-01; each item below names its
source, which can still be read with
`git show 3126357:docs/archive/<NAME>_PLAN.md`. Every item here is on hold by
the owner's choice. Start one only when the owner asks, and read its source plan
before writing any code. When an item is picked up, give it its own plan file in
`docs/plans/`, and delete it from this list once it has landed.

The release steps come first because they block production, not a feature.

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
`docs/plans/UNPAID_FOLLOWUP_PLAN.md`.*

Checked on staging (`run-as-one.vercel.app`, the `dev` branch on `local-dev`)
on 2026-10-05 and passed: VIEWER/ENCODER see the tab and Copy contact but not
Check payment; a QRPh test payment was marked PAID by the webhook alone, with
its receipt and no trail row; the PAID-order delete warning, the order staying
PAID; the sweep moving an order to "Expired" and every screen dropping it from
the count together. What is left:

- **The overview's all-time "Total Registrants" tile** still counts PAID
  runners only, not PAID plus awaiting verification like every other count.
  The owner's call.
- **The "Registrants (n)" tab counts every listed row**, so a CANCELLED or
  REFUNDED order that kept its runner adds to it while the overview and the
  events table do not (Pink Run on `local-dev`: 185 against 184). None on
  production yet. The owner's call.
- **The delete confirmation says the runner is "permanently removed from the
  database"**, but removal is soft (`deletedAt`). Copy only.
- **At 1024px the Unpaid checkouts table is wider than its frame** (986px in
  663px); Status and Check payment are off-screen until the table is scrolled
  sideways.
- **Not checked:** the webhook's GCash/Maya path (`pi_`, `payment.paid`); only
  QRPh's `checkout_session.payment.paid` ran. The client viewer's counts
  after the sweep (no client login was used).
