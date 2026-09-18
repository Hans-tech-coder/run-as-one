# Settings Plan — `/admin/settings`

The tracker for the settings page work: what is done, what is left, and what
each remaining batch needs. **One batch per session.** When a batch lands, tick
its box here and update `PROJECT_GUIDE.md` in the same change.

## Standing decisions (do not relitigate)

- **One page of panels, no section tabs.** A tabbed version (separate routes and
  a section menu) was built and removed at the owner's request. New panels are
  added to the single page, never as sub-routes.
- **A panel someone may not use is left out**, not shown locked. Visibility
  follows `can()` (`lib/permissions.ts`), never a role string.
- **A client viewer cannot change its own sign-in email.** It is read-only and
  points at the admin email; only Run As One's staff change it.
- **Admins may edit the social links**, not only the Super Admin
  (`platform:manage`, the same as the admin email).
- **Two-factor sign-in (2FA) is on hold.** Do not build it until the owner
  reopens it. The StaffAccount TOTP columns stay unused.
- **A photo, a form or a panel saves on its own.** One panel's Save never
  carries another panel's changes.

## Who sees what

| Panel | Super Admin | Admin | Staff | Client |
|---|:-:|:-:|:-:|:-:|
| Profile (photo, name, email, phone) | ✓ | ✓ | ✓ (with phone) | ✓ (email read-only) |
| Password | ✓ | ✓ | ✓ | ✓ |
| Sign-in Activity + Sign out other devices | ✓ | ✓ | ✓ | ✓ |
| Admin Email + Social Links | ✓ | ✓ | — | — |
| Default Platform Fee | ✓ | — | — | — |
| Your Role / What You Can Do / Your Events | ✓ | ✓ | ✓ | ✓ |

---

## ✅ Batch 1 — One page, profile, access panels *(done, 2026-09-18)*

- [x] Profile: name, sign-in email, mobile number (staff only).
- [x] Email change asks for the current password (form and route).
- [x] Client viewer's email is read-only, with the admin email to write to.
- [x] Optional **profile photo**: cropped to a 256px JPEG in the browser, saved
      at once (`api/admin/profile/avatar`), shown in the account menu.
- [x] Sign-in Activity (staff's `lastLoginAt`).
- [x] Your Role, What You Can Do, and a staff member's assigned events.
- [x] Shared `phoneNumberError` in `lib/phone.ts`.
- [x] Loading skeleton for the page.

**Release note:** this batch carries migration
`20260918100000_account_avatar`. When it goes to `main`, run
`npx prisma migrate deploy` against production (see `PROJECT_GUIDE.md` §2), or
every dashboard page fails on the unknown `avatarUrl` field.

---

## ✅ Batch 2 — Social links *(done, 2026-09-18)*

**Who:** `platform:manage` (Super Admin and Admin).

- [x] Add nullable columns to `SiteSettings` for Facebook, Instagram, TikTok
      and YouTube URLs (migration; a few bytes).
- [x] Read them through `lib/site-settings.ts`, the same cached path as the
      admin email, and expire the cache on save.
- [x] A **Social Links** panel beside Admin Email: one field per channel, with a
      specific message for a link that does not look like one (reuse
      `looksLikeLink` from `lib/organizer-application.ts`).
- [x] `PATCH /api/admin/site-settings` accepts the links, audited like the
      admin email.
- [x] The footer uses the saved link. **A channel with no link hides its icon**
      rather than pointing at `/coming-soon`. Check every place that draws
      `SOCIAL_CHANNELS` (`lib/site-contact.ts`) — fix all of them, not one.
- [x] Update `PROJECT_GUIDE.md` (§4 SiteSettings, §5 site-settings.ts, §6
      settings, "Known open threads").

Also: a link must be on its own channel's site (an Instagram link in the
Facebook box is refused by name), and `/coming-soon?channel=…` now redirects to
the saved link, since the footer no longer links there.

**Release:** carries migration `20260918110000_site_social_links` →
`npx prisma migrate deploy` on production.

---

## ✅ Batch 3 — Sign out every other device *(done, 2026-09-18)*

**Who:** everyone.

- [x] Add `sessionsValidFrom` (and `lastLoginAt`, so the owner gets Sign-in
      Activity too) to **Organizer** (migration). StaffAccount already has both.
- [x] Make `getActor()` (`lib/actor.ts`) check the owner's token `iat` against
      `sessionsValidFrom`, the way it already does for staff.
- [x] Record the owner's `lastLoginAt` in the login route.
- [x] A **Sign out other devices** button in Sign-in Activity: bump
      `sessionsValidFrom`, reissue this session's cookie so the person pressing
      it stays signed in, audit it.
- [x] A password change ends the owner's other sessions too (staff already do).
- [x] Show Sign-in Activity to the owner.
- [x] Update `PROJECT_GUIDE.md` (§4, §5 actor.ts, §6, §7 security model).

Also: both new Organizer columns are **nullable** (null = never ended), so the
deploy signs nobody out; the button asks first and lives at
`POST /api/admin/profile/sessions` (audited `profile.sessions.ended`); the Team
table shows the owner's last sign-in too.

**Release:** carries migration `20260918120000_organizer_sessions` →
`npx prisma migrate deploy` on production **before** `dev` goes to `main`, or
every owner request fails on the unknown column and Run As One is locked out of
its own dashboard. A running `next dev` needs a restart after
`prisma generate`, for the same reason.

---

## ⬜ Batch 4 — Default platform fee

**Who:** Super Admin only (`org:settings`, which nothing uses yet).

- [ ] Decide the home for the value: `Organizer.adminFee` already exists
      (centavos, default 6000, currently a dead column), so no migration
      should be needed.
- [ ] A **Default Platform Fee** panel, peso input, shown only with
      `org:settings`.
- [ ] A route to save it (`org:settings`, audited).
- [ ] The create-event form (`admin/events/new/page.tsx`, today hardcoded to
      `adminFee: 60`) starts from the saved default.
- [ ] Say plainly in the panel that it **only affects new events** — existing
      events keep their own `Event.adminFee`.
- [ ] Update `PROJECT_GUIDE.md` (§4 Organizer.adminFee is no longer dead, §6).

**Release:** no migration expected.

---

## ⏸ On hold

- **Two-factor sign-in (2FA)** — owner's call. Revisit only when asked.
