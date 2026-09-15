# Batch 5 — Superadmin

Read `README.md` in this folder first. Batch 1 must have landed. The shell and
menu already came with `DashboardShell`, so this batch is the four pages.

**Sign-in:** needs a super admin session in the Browser pane. Ask the owner.
The organizers and communities are live records, so open and cancel only.

## Files

- `src/app/superadmin/page.tsx` (dashboard, 86 lines)
- `src/app/superadmin/organizers/page.tsx` (247 lines, client)
- `src/app/superadmin/communities/page.tsx` (289 lines, client)
- `src/app/superadmin/feedback/page.tsx` (493 lines, client)

These tables are plain `<table className="data-table">`, not TanStack. **Do
not convert them to TanStack in this batch.** `AdminCardList` is data-agnostic
precisely so plain arrays fit.

## Tasks

1. **Dashboard.** Confirm the metric tiles and anything under them at 360px.

2. **Organizers** (columns: Organizer Details, Events, Status, Admin Fee,
   Actions).
   - Toolbar: the search input (around line 123) takes a full row at 16px, and
     the filter button sits next to it.
   - Cards:
     - Title: organizer name.
     - Subtitle: email and contact, wrapping.
     - Badge: Status.
     - Fields: Events, and Admin Fee.
     - Actions: approve and suspend as labelled 44px outline buttons.
   - **Admin Fee inline edit** (the input around line 182 with Save and
     Cancel). On a card, edit mode is a full-width 16px input (numeric
     `inputmode`) with Save and Cancel under it at 44px. The value is still
     shown in pesos and stored in centavos, exactly as today.

3. **Communities** (columns: Club, Runners, Status, Actions).
   - Toolbar: search, and the add-club form (the input and button at around
     lines 167–176). Both span the full width and stack below 640px.
   - Cards:
     - Title: club name.
     - Badge: Status (Pending / Approved).
     - Field: Runners.
     - Actions: approve, rename and reject, as labelled buttons. Reject keeps
       its `AlertProvider` confirm.
   - The **inline rename** (around line 211) becomes a full-width edit mode on
     the card, the same pattern as the admin fee.
   - The text stays UPPERCASE, and the placeholder stays an uppercase sample.

4. **Feedback** (columns: Received, Type, Message, From, Status, Actions; a row
   opens into the whole message).
   - The metrics and triage chips wrap. The chips *find* unread messages and
     never sort them.
   - Cards:
     - Title: the message, clamped to 3 lines.
     - Badges: Type (Issue / Suggestion / Feature) and Status (New /
       Reviewed).
     - Fields: Received, and From (name and email, wrapping).
     - Actions: mark reviewed, and the rest as they are today.
   - The opened row (around lines 395–430) goes into the `expanded` slot: the
     whole message, page path and user agent, wrapping. It opens by tapping
     the card's "Read message" button, not the whole card, so the action
     buttons stay separate.

5. **`PROJECT_GUIDE.md`.**
   - §6 Super admin: one line saying the three lists are cards below 1024px,
     with inline edits becoming full-width edit modes.
   - §10: Batch 5 landed.

## Noticed during Batch 1

Left for this batch, measured once the shell had landed:
- **Organizers at 360px:** the page itself does not scroll, but the table
  runs past the right edge inside `.admin-panel` (`overflow: hidden`), so
  Events, Status, Admin Fee and Actions are cut off. The overflow script lists
  `table.data-table` and its cells as offenders. The cards fix this.
- **Dashboard tiles:** `page.tsx` puts `className="metric-icon"` on the lucide
  `<svg>` itself, not on a wrapping `<div>` as `/admin` does. The 8px padding
  then squeezes the icon, which is visible at every width and worst on a phone.
  Wrap it the way `/admin/page.tsx` does.
- **System Overview panel:** `.admin-panel-content` keeps its 32px padding on a
  phone, which leaves a narrow column of text at 360px.

## Acceptance

- All four `/superadmin` routes pass the overflow check at 360, 390, 767 and 820,
  including with an inline edit open and a feedback message expanded.
- At 1440, all four pages match their before-screenshots.

## What landed

_Fill in when the batch is done._
