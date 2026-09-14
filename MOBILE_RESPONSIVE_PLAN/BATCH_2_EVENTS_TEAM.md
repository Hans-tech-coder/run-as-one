# Batch 2 — Shared pager and sort, Events list, Team

Read `README.md` in this folder first. Batch 1 must have landed. Use
`DashboardShell`, `AdminCardList`, `.dash-*-only`, `.toolbar-popover` and
`.admin-modal-panel` rather than re-inventing any of them.

## Goal

`/admin/events` and `/admin/team` are fully usable at 360px. The pager and the
mobile sort become shared components that Batches 3 and 4 adopt.

## Files

- New `src/app/admin/AdminTablePager.tsx` and
  `src/app/admin/MobileSortMenu.tsx`.
- `src/app/admin/events/EventsTableClient.tsx` (656 lines),
  `EventActionsMenu.tsx`, `RegistrationScheduleModal.tsx` and
  `RegistrationOpeningPicker.tsx`.
- `src/app/admin/team/TeamClient.tsx` (1011 lines), `TeamActionsMenu.tsx` and
  `RolesPanel.tsx`.
- `src/app/admin/events/loading.tsx`: a card skeleton below 1024px, so there
  is no layout jump.

## Tasks

1. **`AdminTablePager`.**
   - Extract the rows-per-page menu (5/10/25/50) and the
     "1–25 of N" + prev/next pager that each TanStack client builds inline.
   - Below 640px: the range text on one side, 44px prev/next on the other, and
     the rows-per-page menu opening upward inside the viewport.
   - Adopt it in Events and Team only. Registrants, Results and Marketing
     adopt it in their own batches.
   - Desktop output stays identical.

2. **`MobileSortMenu`.** A Sort chip shown only below 1024px.
   - It lists `table.getAllLeafColumns().filter(c => c.getCanSort())` by
     header label, with ascending and descending.
   - It shows the active sort on the chip.
   - It opens as a `.toolbar-popover`.

3. **Events toolbar.**
   - The search takes a full row.
   - The View (column visibility) chip goes inside `.dash-desktop-only`,
     because it means nothing for cards.
   - Add the Sort chip. Create Event (only when `event:create`) spans the full
     width on a phone.
   - The filter menu at around line 469 becomes a `.toolbar-popover`.

4. **Event cards.**
   - Leading: the select checkbox and No.
   - Title: Event Name, clamped to 2 lines.
   - Badges: the Registration badge (Open, Paused, Scheduled…) with its
     `.status-note` under it, such as the scheduled opening date.
   - Fields: Date, Location (full width), Categories (full width, chips
     wrapping).
   - Actions: `EventActionsMenu`, with a 44px trigger.
   - The row actions stay permission-driven per row, exactly as the table.

5. **`EventActionsMenu`.** At 360px the 210px portalled menu must clamp inside
   the right edge and flip above the trigger near the bottom. Check that it
   still repositions on scroll.

6. **Modals.** Apply `.admin-modal-panel` to:
   - the delete-event confirm (around line 641);
   - `RegistrationScheduleModal` (`max-w-2xl`).

   Inside the schedule modal, `RegistrationOpeningPicker`'s date and time
   controls must fit 360px, with 16px inputs.

7. **Team toolbar and pager.**
   - The filter menu at around line 729 becomes a popover.
   - The pager at around line 829 becomes `AdminTablePager`.
   - Add the Sort chip.

8. **Team cards.**
   - Leading: No.
   - Title: Member name with the *You* chip.
   - Subtitle: email, wrapping.
   - Badges: Status, with *Link expires Sep 20* as a `.status-note`.
   - Fields: Role, Last Sign-In, and Events (full width; each race with its
     role on its own line).
   - Actions: `TeamActionsMenu`.
   - A row the viewer may not manage shows its "why" as visible text, not a
     hover tooltip.
   - The owner stays the first card, with no menu.

9. **Invite / Edit Access modal** (around lines 879–892, `max-w-xl`).
   - Apply `.admin-modal-panel`.
   - The event + role rows (`sm:grid-cols-2`) stack below 640px, with the
     row's remove button at 44px.
   - The `AdminSelect` menus inside the modal must stay in the viewport.
   - Field errors stay under their fields.

10. **`RolesPanel` permission matrix.**
    - Below 1024px, replace the grid with a role picker: a segmented control,
      animated with `transitions-dev`.
    - Under it, a list of that role's permissions as allowed / not allowed
      rows, still drawn from `permissions.ts`.
    - No horizontal scroll.

11. **`PROJECT_GUIDE.md`.**
    - §9: add `AdminTablePager` and `MobileSortMenu` to the responsive
      convention, plus the rule that hover-only info becomes visible text on
      touch.
    - §10: Batch 2 landed.

## Acceptance

- `/admin/events` and `/admin/team` pass the overflow check at 360, 390, 767
  and 820.
- The same check passes with each popover, each row menu and each modal open.
- Search, filter, sort, select-all and pagination give the same rows in cards
  as in the table. Test by resizing across 1024px mid-session: the state holds.
- At 1440, Events and Team match their before-screenshots.

## What landed

_Fill in when the batch is done._
