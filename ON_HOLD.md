# On hold

Everything that was planned and **not** built, gathered from the plan documents
now kept in `docs/archive/`. Every item here is on hold by the owner's choice.
Start one only when the owner asks, and read the archived plan named with it
before writing any code. When an item is picked up, give it its own plan file at
the root, and delete it from this list once it has landed.

The release steps come first because they block production, not a feature.

---

## 1. Release to production (pending, on the owner's word)

`dev` holds work that production does not have yet, including **12 Prisma
migrations**. These do not reach production on their own: production and
development are separate Neon branches.

Migrations waiting for production (`npx prisma migrate deploy` applies them all,
in order):

```
20260916063805_organizer_application_details
20260916120000_organizer_status_decision
20260917120000_clients_and_viewer_role
20260917180000_retire_super_admin
20260917200000_remittances
20260918090000_site_settings
20260918100000_account_avatar
20260918110000_site_social_links
20260918120000_organizer_sessions
20260919120000_runner_guardian_consent
20260919180000_promo_category
20260922100000_pacer_codes
```

Do the release **in this order**. It is copied from the Batch 5 notes in
`docs/archive/ADMIN_MERGE_PLAN.md`, which has the full reasoning:

1. **Re-audit production, read-only.** Check the Organizer rows and the PENDING
   registrations. The PENDING orders on Pink Run 2026 are real customers. Stop
   if anything new owns data.
2. **Run `npx prisma migrate deploy`** with `DIRECT_URL` pointed at the
   production branch (`ep-still-pine-b3n210bs`). The live code keeps working
   after this, because every change is a new table or a nullable column.
3. **Fast-forward `main` onto `dev` and push.** Vercel deploys it.
4. **On the live site, signed in as the owner:**
   - Settings: change the email to `runasoneph@gmail.com` and the name to
     "Run As One".
   - Create the Cresendo Running Community client
     (`cresendorunningcommunity@gmail.com`) through `/admin/register`.
   - Link the four events to that client, one at a time, through each event's
     edit form.
   - Press **Send invite** on `/admin/clients`, so the invite link points at
     the live site.
   - Do not touch any registration row.
5. **Spot-check production:**
   - The viewer's *Your Events* counts are right.
   - Staff Pik and Kyla still sign in as before.
   - `admin@stridesync.com` is refused.

After the release, the owner decides whether to remove the retired test
accounts: "System Owner", and the test clients "Super Admin Test" and "Test".
Confirm the exact rows first.

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
