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

## Noticed during Batch 3

- **Chip colour utilities never apply.** `Admin.css` is unlayered, so its
  `.btn-filter` rule beats Tailwind's layered utilities. `organizers/page.tsx`
  (around lines 217 and 228) and `communities/page.tsx` (around lines 250 and
  271) put `hover:text-green-500` / `hover:text-red-500` on `.btn-filter`, and
  those hovers draw grey. Batch 3 added tone classes for this: `.is-danger`
  (red) and `.is-pending` (amber). An approve button wants a green tone, which
  does not exist yet; add `.btn-filter.is-success` beside the others in
  `Admin.css` rather than a utility.

## Acceptance

- All four `/superadmin` routes pass the overflow check at 360, 390, 767 and 820,
  including with an inline edit open and a feedback message expanded.
- At 1440, all four pages match their before-screenshots.

## What landed

Uncommitted, in the main checkout.

**Files:** `superadmin/page.tsx`, `superadmin/organizers/page.tsx`,
`superadmin/communities/page.tsx`, `superadmin/feedback/page.tsx`, the new
`admin/AdminCardEdit.tsx`, `admin/Admin.css`, plus `PROJECT_GUIDE.md` (§3, §6,
§9, §10) and this folder's README.

1. **Dashboard.** Each tile's icon now sits inside a `.metric-icon` `<div>`,
   as on `/admin`: a 36px box holding a full 20px icon. The System Overview
   panel already had Batch 1's 16px phone inset, so it needed nothing.
2. **Organizers.** Below `lg` the table becomes cards:
   - title: the name; subtitle: the email;
   - badge: Status; fields: Events and Admin Fee;
   - footer: labelled **Edit Fee**, **Approve** and **Suspend**.

   Status and the approve/suspend pair are single components shared by the
   table and the cards. The data has no contact column, so the subtitle is the
   email alone. The table's Filter chip stays as it was (see Batch 6).
3. **Inline edits on a card: `AdminCardEdit`.** Edit Fee opens a block under
   the fields, in the `expanded` slot:
   - a labelled full-width ₱ box, 16px, 44px tall, with `inputmode="decimal"`
     and focus placed in it;
   - Save and Cancel under it at 44px; Enter saves and Escape cancels.

   It edits the same `editingId` / draft pair as the table's cell, so an edit
   stays open across a resize past `lg`. Pesos go in and the route still
   stores centavos. The component has no state and no `id`.
4. **Communities.** Below `lg` the table becomes cards:
   - title: the club; badge: Status; field: Runners;
   - footer: labelled **Approve**, **Rename** and **Remove**. Remove keeps its
     `AlertProvider` confirm.

   Rename opens the same `AdminCardEdit`, with an uppercase sample placeholder
   (`TEAM ARMY`). Below `sm` the Add-a-club form is `.toolbar-form`: the box and
   Add each take the full width, stacked, and Add is 44px.
5. **Feedback.** Below `lg` the table becomes cards:
   - title: the message, clamped to 3 lines, in the dimmer weight once reviewed;
   - badges: Type (icon and tone) and Status; fields: Received, and From at
     full width with the email wrapping;
   - footer: labelled **Mark Reviewed / Move to New** and **Delete**.

   The message opens only from a **Read message / Hide message** button in the
   `expanded` slot. It uses transitions.dev's accordion (`.t-acc`, as the
   voucher disclosure does), `inert` while closed, no `id` or
   `aria-controls`. It reads the table's `openId`. What an open message shows
   is one `MessageDetail` component for the table's second row and the card.
   On a phone the loading skeleton is `AdminCardListSkeleton`, and the search's
   clear button is 44px.
6. **Chip tones.** The dead `hover:text-green-500` / `hover:text-red-500`
   utilities are gone:
   - Approve wears the new `.btn-filter.is-success`, which is green on hover
     only, as the utility intended;
   - Suspend and Remove wear `.is-danger`.

   The feedback table's own Delete chip is unchanged.

**Verified** in the Browser pane as the super admin, opening and cancelling
only. Nothing was approved, suspended, renamed, added, marked or deleted.

| Check | Result |
| --- | --- |
| Overflow, `/superadmin`, at 360 / 390 / 767 / 820 | `ok`, no offenders |
| Overflow, `/superadmin/organizers`, at 360 / 390 / 767 / 820 with the fee edit open | `ok`; card buttons 44px, edit box 204×44 at 16px, decimal keypad, focused |
| Overflow, `/superadmin/communities` (53 clubs), at 360 / 390 / 767 / 820 with a rename open | `ok`; Add box 222px wide and Add button 222×44 stacked at 360; rename box 44px at 16px |
| Overflow, `/superadmin/feedback`, at 360 / 390 / 767 / 820 with the message open | `ok`; closed panel `inert` at 0px; open `aria-expanded="true"` |
| Edit / open state across `lg` | The fee edit, the rename and the opened message all showed in the table at 1440 |
| 1440 | Tables, toolbars and metrics as before, with three intended differences: the dashboard's icon boxes, the red-tinted border on Suspend / Remove, and the green hover on Approve |
| `npx tsc --noEmit` | Clean |
| ESLint on the touched files, against their committed versions | No new problems. Organizers went from 1 error and 1 warning to 1 error. What remains predates the batch: `setState` in the three fetch effects, and the dashboard's unused `totalEvents` |

**Not exercised:**
- A pending organizer or club: the live data has none, so no card showed
  Approve. The button is the same component the table renders.
- Before-screenshots: none were taken. The 1440 comparison was made against
  the diff, which leaves the table markup unchanged apart from the wrapper's
  `.dash-desktop-only`.

The session drove the `localhost:3000` server that another chat had started
from this same checkout.
