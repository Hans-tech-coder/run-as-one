# On hold

Everything that was planned and **not** built, gathered from the plan documents
now kept in `docs/archive/`. Every item here is on hold by the owner's choice.
Start one only when the owner asks, and read the archived plan named with it
before writing any code. When an item is picked up, give it its own plan file at
the root, and delete it from this list once it has landed.

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

*Source: `docs/archive/STAFF_ACCESS_PLAN.md`, Batch 4. `SETTINGS_PLAN.md` also
put it on hold with "owner's call, revisit only when asked".*

- A security panel under Settings. The user enrols by scanning a QR code,
  confirms with a code, and sees ten single-use recovery codes once.
- **Required** for any membership that holds `registration:validate`,
  `registration:delete` or `event:delete`. Optional for `VIEWER` and `ENCODER`.
- Enforced at sign-in (`api/auth/login`), not only in the UI.
- 2FA uses TOTP, not SMS. That is settled.
- The settings page has one page of panels and no sub-routes, so this goes on
  that page as a panel, not on its own route. See the standing decisions in
  `docs/archive/SETTINGS_PLAN.md`.
- Needs a migration for the TOTP secret and the recovery codes. Keep it small,
  because the database is on Neon's free 0.5 GB tier.

## 3. Google sign-in and the sign-in retention sweep (optional)

*Source: `docs/archive/STAFF_ACCESS_PLAN.md`, Batch 5.*

- **Google sign-in**, bound to an invited account's verified email. Nobody signs
  up through Google. It only signs in an account that already exists.
- **Retention sweep**: a scheduled job, like the ones in `vercel.json`, that
  trims old sign-in and audit rows. **The audit log is append-only**, so decide
  with the owner what may be swept before building this.
- The *sign out every other device* part of this batch has **already shipped**
  (Settings Batch 3, `api/admin/profile/sessions`). Do not build it again.

## 4. Organizer's logo on printed documents

*Source: `docs/archive/GUARDIAN_CONSENT_PLAN.md`, "Where it stands".*

The printed guardian consent sheet
(`admin/events/[id]/registrants/[runnerId]/consent`) shows the Run As One logo.
The owner wants the client's or the event's own logo there once the dashboard has
a setting for it. Run As One stays the default and the fallback.

## 5. Revoking a single client viewer (check first)

*Source: `docs/archive/ADMIN_MERGE_PLAN.md`, the deferred notes in Batches 3–4.*

When those batches landed, the only way to cut off one client viewer's sign-in
was to archive the whole client. Check `/admin/clients` before you start,
because a later change may already have added a suspend option.
