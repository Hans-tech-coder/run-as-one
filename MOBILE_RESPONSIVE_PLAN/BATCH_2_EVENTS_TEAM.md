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

**Shared pieces, for Batches 3 and 4 to adopt:**
- **`AdminTablePager`.** Takes the table instance, with optional `pageSizes`.
  - From `sm` up it measures box for box like the old inline pager.
  - Below `sm` it shows the range plus 44px Previous / Next. First and Last
    step out, because four 44px buttons plus the range are wider than a
    360px screen beside the rail.
  - The page-size options are now real `menuitemradio` buttons, and every
    control has an accessible name. The old events copy had none.
- **`MobileSortMenu`.** Takes the table instance, plus optional `labels` for
  JSX headers.
  - `.dash-mobile-only` sits on its own wrapper.
  - Each sortable column gets Asc / Desc, with a Clear sort button below.
  - The chip names the active sort and its direction.
  - It is a `.toolbar-popover`: anchored at 820, a bottom sheet at 360.
- **`row-menu-position.ts`** (`placeRowMenu`) clamps a row menu inside the
  viewport and flips it above a trigger with no room below. Each menu
  re-measures in a `useLayoutEffect` once it has rendered, and sets
  `data-origin` from the result, so the grow animation starts at the trigger.
- **`AdminCardList` additions:**
  - a `className` prop; `.is-flush` drops the list's own inset, for a list
    standing between a toolbar and a pager;
  - `AdminCardListSkeleton`;
  - a 44px `.action-dropdown-btn` inside a card footer.

**Events.**
- View is desktop-only; its menu wears `.toolbar-popover`. Sort is added.
- The cards match the task list. Categories show as chips, each keeping its
  distance unless the name already contains it.
- `RegistrationStatus` and the row menu are each drawn once, for both the
  cell and the card.
- The No. column now counts by row id, per the guide.
- `EventRow` is a real type, so the file lints clean.
- `EventActionsMenu` changes:
  - it takes a `label`, used for its `aria-label`;
  - it lost its `mounted` flag, as TeamActionsMenu had;
  - `closeMenu` is declared before the effect that uses it, which clears two
    lint errors that were already in the file.
- Modals:
  - The delete confirm and the schedule modal wear `.admin-modal-panel` /
    `-body` / `-footer`.
  - The delete confirm is an `alertdialog`.
  - The close buttons are 44px with a -12px margin.
  - The opening picker's date and time fields get `min-w-0`. `.form-input`
    was already 16px.
- `events/loading.tsx` is now a client component. On `/admin/events` itself,
  below `lg`, it draws a search bar and three card skeletons; anywhere else
  it is the old fallback. It reads `usePathname()`, because one boundary
  covers the list and every page under it.

**Team.**
- Status, Events, Last Sign-In, the You chip and `manageReason` are each one
  helper, shared by the cell and the card.
- The cards follow the task list. A row the viewer cannot manage says why in
  its footer.
- The invite / edit form wears the modal frame. The remove button is 44px
  below `sm`.
- `RolesPanel` renders the table in `.dash-desktop-only` and `RolePicker` in
  `.dash-mobile-only`. RolePicker is:
  - a `t-tabs` grid (transitions.dev 16, on dark tokens), whose pill travels
    in both axes and measures after resize;
  - a keyboard tablist;
  - the role's hint as text;
  - "Allowed n of 17";
  - allowed / not-allowed rows, said in words as well as icons.

**Two shared fixes, found while verifying:**
- **The phone rail sat above every page modal.** It rested at z-index 70
  while page overlays are z-50, so the rail was drawn over each modal's left
  edge. It now rests at 50, like the desktop sidebar, and only `.is-open`
  rises to 70. On close, the drop waits for the width transition, so the
  closing menu is never dimmed by its own backdrop.
- **`.admin-panel-header` / `-content` are 16px below `sm`** (they were 32px).
  At 32px the role picker had about 200px: one tab to a row.

**Verified** (as owner):
- **1440, before and after, box by box.** On `/admin/events` and
  `/admin/team`, every box measures the same:
  - toolbar, search (400×40), View and the primary button;
  - every column header and row height;
  - the pager and its 32px buttons.

  The Sort chip is hidden. The Team role matrix is unchanged.
- **Overflow check at 360, 390, 767 and 820**, all `ok: true` with no
  offenders:
  - on `/admin/events` and `/admin/team`;
  - on a throwaway page rendering `TeamClient` with five fake members (a
    long name, a 76-character email, four assignments, Invited / Suspended /
    Invite Expired, and an unmanageable Admin). It was deleted afterwards.
- **Open-state checks at 360**, with the overflow check passing each time:
  - **Sort sheet:** 44px Asc / Desc.
  - **Last card's menu:** it flips above the trigger and follows it on
    scroll.
  - **Schedule modal**, including the date and time reveal: 328×756, a
    sticky footer, 16px fields.
  - **Delete confirm.**
  - **Invite form** with two assignment rows and an event picker open: the
    list stayed inside the modal body.
  - **Phone menu:** it opens over the page at z 70, and Esc folds it and
    returns focus to the chevron.

  Every modal was only opened and cancelled. The four events are unchanged.
- **Sort matches.** "Event Name, descending" gave the same order in the cards
  and in the (hidden) table.
- **State holds across `lg`.** At 820 I set search "2026", Date descending,
  5 rows and a selected Pink Run. At 1440 the table showed the same order,
  the same checked row, the Date chevron and page size 5, and 820 again
  matched.
- **1024:** the tables return and the cards, Sort chip and picker hide.
- `npx tsc --noEmit` passes. eslint shows 0 errors on every touched file; the
  only warnings are TanStack's `incompatible-library` notice, which every
  `useReactTable` screen gets.

**After the batch: a shortcut in the card footer** (the owner's decision).
- **The problem.** An event card's footer held only ⋯, so it read as empty
  space.
- **Rejected: an "Actions" label.** It would not be tappable, and on a phone
  it looks like a button.
- **What the footer holds now.** A quiet `.btn-filter` shortcut to the row's
  most-used destination sits on the left, with ⋯ on the right:
  - Events: **Registrants**, with `LinkPending` dots.
  - Team: **Edit Access**, on manageable rows only.
- **Unchanged.** Both stay in the menu. Batches 3 and 4 follow the same
  footer (§9).

**Not verified:**
- The events card skeleton was never seen live, because a local navigation is
  too fast to catch it. It type-checks, and it falls back to the old loader
  on any other path.
- `/admin/team` was only seen with its one real row. The multi-member cards
  were checked on the fake-row page.
