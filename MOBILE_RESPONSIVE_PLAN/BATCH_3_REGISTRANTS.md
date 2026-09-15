# Batch 3 — Registrants

Read `README.md` in this folder first. Batches 1 and 2 must have landed.

This is the screen organizers most need on a phone: the validation queue at the
pickup table. It is also the largest file in the admin (2,095 lines), so this
batch does nothing else.

**Live data.** These are real orders; see the pinned note on PENDING
registrations. Verify by opening and cancelling only. Never validate, save a
remark, send an email, edit or delete while checking layout.

## Files

- `src/app/admin/events/[id]/registrants/RegistrantsTable.tsx`
- `RegistrantActionsMenu.tsx`, `ProofLightbox.tsx` (455 lines) and `page.tsx`
  (header only)

## Tasks

1. **Header.** The back arrow gets a 44px target, and "Registrants:
   {event.title}" clamps to 2 lines. This uses Batch 1's header rules; only
   confirm them here.

2. **Toolbar.**
   - The search takes a full row. `?search=` prefill must still work.
   - Keep the **Needs Validation** and **Unsent Email** chips visible on every
     width. They are the work queues and keep their amber and red tones.
   - Below 640px, put the three dropdown filters (around lines 1016, 1046 and
     1076) behind one **Filters** chip that opens a `.toolbar-popover` sheet
     holding all three.
     - They keep the same state; this is grouping, not new behaviour.
     - The chip shows a count of active filters.
   - The View chip goes inside `.dash-desktop-only`. Add `MobileSortMenu`.
   - Export to CSV spans the full width on a phone. Its audit call must still
     fire first.

3. **Bulk actions.**
   - Below 1024px, while rows are selected, show a sticky bottom bar reading
     "N selected · Export · Delete · Clear", with a safe-area inset.
   - It replaces the red delete chip in the toolbar for that width. Desktop
     keeps the chip.

4. **Registrant cards.**
   - Leading: the checkbox and No. (`regNo`, the server's number, never the
     position).
   - Title: Name, with `min-w-0` and truncation per the runner-name
     convention.
   - Subtitle: Reference, with the **eye** button at 44px, which opens the
     detail modal.
   - Badges: the Status badge, and an **Email Unsent** badge when it applies.
     They wrap; each chip is `nowrap`.
   - Fields: Category, Size, Logistics, Payment.
   - Actions: the Remarks and Email icon buttons **with visible text labels**
     on mobile, under the same conditions and `aria-label`s as today, plus
     `RegistrantActionsMenu`.
   - Group orders must read in order (`-1` above `-2`). The list order never
     changes because of an action.
   - Adopt `AdminTablePager` (around line 1253). The filter menus at around
     lines 1022, 1052, 1082 and 1152 become popovers.

5. **Detail modal** (around line 1310, `bg-black/80`, frame
   `overflow-hidden`).
   - Below 640px it is a full-height sheet whose sections stack.
   - The proof thumbnail, 300px today, goes full width.
   - The PDF proof card fits.
   - *View fullscreen*, Remarks, Send email and **Validate Payment** stay
     reachable in a sticky footer.
   - A clipping panel that holds form fields is `overflow-clip`, per the
     guide.

6. **Edit modal** (around line 1620, `max-w-2xl`).
   - Apply `.admin-modal-panel`, with fields in a single column below 640px
     and 16px inputs.
   - The size field's native `<select>` (around line 1690) moves onto
     `AdminSelect`; the guide says to move it when touched.

7. **The other modals.**
   - Delete (around line 1786) and Bulk Delete (around line 1822): apply
     `.admin-modal-panel`.
   - Remarks (around line 1870): a 16px textarea, with the keyboard not
     covering the Save button.
   - Manual Email (around line 1967): the email preview must wrap long URLs
     and never widen the modal.

8. **`ProofLightbox`.**
   - Below 640px the toolbar (zoom, rotate, open in new tab, close) becomes a
     bottom bar of 44px buttons that does not wrap off-screen.
   - Pinch zoom and pan still work.
   - The Order Total, Transaction No. and status block under the image stays
     readable. *Validate Payment* stays visible.
   - The PDF frame goes full width, with the "Open in a new tab" text link
     kept.

9. **`PROJECT_GUIDE.md`.**
   - §6 `/admin/events/[id]/registrants`: one short line on the mobile
     arrangement (the Filters sheet, the bulk bar, the sheet-style detail
     modal).
   - §9: the native-select note no longer lists the registrants size field.
   - §10: Batch 3 landed.

## Acceptance

- The overflow check passes at 360, 390, 767 and 820 on the list, and with each
  modal, sheet, menu and the lightbox open.
- The Needs Validation and Unsent Email filters, search, selection, export and
  paging behave identically in cards and table.
- A PENDING bank transfer can be taken from card → detail → fullscreen proof →
  the Validate button **being visible**, all at 360×780. Do not press it.
- At 1440 the registrants screen matches its before-screenshot.

## Noticed during Batch 2

- `RegistrantActionsMenu` still places itself at `rect.right - 210,
  rect.bottom + 8`. That throws it off a phone screen's edge, and below the
  fold for the last card. Move it onto `placeRowMenu` in
  `admin/row-menu-position.ts`, as `EventActionsMenu` and `TeamActionsMenu`
  now do: the `useLayoutEffect` re-measure after open, and `data-origin`
  taken from the placement.
- `AdminCardList` has a per-card checkbox but **no select-all**. Events and
  Team had no bulk action to need one. The registrants bulk bar does, so the
  card list needs a select-all control for the page's rows, reading
  `table.getIsAllPageRowsSelected()` like the table header does.

## What landed

Uncommitted, in the main checkout.

**Files:** `RegistrantsTable.tsx`, `RegistrantActionsMenu.tsx`,
`ProofLightbox.tsx`, `admin/AdminCardList.tsx`, `admin/Admin.css`, plus
`PROJECT_GUIDE.md` (§6, §9, §10) and this folder's README and Batch 5 and 6
notes. `page.tsx` needed nothing: its back arrow already wore
`.admin-back-link`, and the title clamps to two lines under Batch 1's rules.

1. **Toolbar.** The search takes its own row, and `?search=` still prefills
   it. Below `sm` the Category, Logistics and Payment chips fold into a
   **Filters** chip. Its sheet holds all three lists and counts every chosen
   value. The lists are one `FilterOptions` component, used by the chips and
   the sheet alike, so both write the same column filters. Needs Validation
   and Unsent Email stay at every width. View is desktop-only, and
   `MobileSortMenu` joins below `lg`. Export spans the phone's width, and its
   audit call is unchanged.
2. **The queue chips' tones were never showing.** `Admin.css` is unlayered,
   so `.btn-filter` beat `text-orange-400` and friends. The active Needs
   Validation chip, the active Unsent Email chip and Delete Selected all drew
   grey on desktop. They now use the new `.btn-filter.is-pending` /
   `.is-danger` / `.is-primary` classes, so the amber and red are real. This
   is the one visible desktop change, and it only shows while a chip is
   active or rows are selected.
3. **Bulk bar.** Below `lg`, "N selected · Export · Delete · Clear" rises on
   `.t-toast`. It is two rows below `sm` and one row up to `lg`, and desktop
   keeps the red chip. It is `position: fixed` and lined up with the content
   column, not sticky: `<body>` clips `overflow-x`, so a sticky box never
   engaged (see the Batch 6 note). A spacer at the end of the list lets the
   pager scroll clear of it. `AdminCardList` gained `selectAll`.
4. **Cards.** Leading is `regNo`. The title is the name with the email under
   it, both truncating. The subtitle is the reference. Badges
   are Status and Email Unsent, and what their hover titles say is written
   out under them. Fields are Category, Size, Logistics and Payment. The
   footer is **Remarks · Email · ⋯**. **The card has no eye button**: the
   owner had it removed after the batch landed, so on a card the ⋯ menu's
   View Details is the way into the detail modal. The table keeps its eye. The labels are one word each, so the
   footer fits 238px beside a 360px screen's rail (`.btn-filter.is-compact`
   below `sm`). The accessible names are unchanged. The pager is
   `AdminTablePager`, and the filter menus are `.toolbar-popover`.
5. **Detail modal.** It is `.admin-modal-panel` plus the new
   `.admin-modal-sheet`: edge to edge below `sm`, with `overflow-clip` and a
   44px close. The proof thumbnail is full width. The sticky footer carries
   Validate, then phone-only **Proof · Remarks · Email**
   (`.dash-phone-only`, since `sm:hidden` loses to `.btn-filter` too). At
   1440 the footer is Validate and Close as before. The panel's cap is now
   `.admin-modal-panel`'s `100dvh − 32px`, not `90vh`, as the team modal's
   became in Batch 2.
6. **Edit modal.** Every field is `.form-group` / `.form-label` /
   `.form-input` (16px), in one column below `sm`. **Gender** moved from its
   native `<select>` onto `AdminSelect`. The task named "the size field's
   native select", but Gender was the only native select; Shirt Size is a
   free-text box with a `<datalist>`, left as it is because it may be blank.
   The labels now point at their inputs, and the community placeholder is an
   uppercase sample.
7. **Other modals.** Delete and Bulk Delete use `.admin-modal-panel`, as
   alertdialogs. Remarks has a 16px textarea and is top-aligned on a phone:
   its footer ends at 467px of 780, above where the keyboard rises. Manual
   Email gets `[overflow-wrap:anywhere]` on the subject, name and error; a
   preview-only stylesheet goes into the iframe's head so a long link wraps;
   the copy buttons are full width on a phone. **Mark As Sent** moved off the
   orange gradient onto `.btn-light` (no gradient buttons in the admin).
8. **`RegistrantActionsMenu`** now places itself with `placeRowMenu`, with the
   `useLayoutEffect` re-measure, `data-origin`, Escape and an
   `Actions for {name}` label. That also cleared the two lint errors the
   committed file had.
9. **`ProofLightbox`.** Below `sm` it is full screen. The header goes
   `display: contents`, so the tools are ordered into a 44px bar under the
   image without rendering anything twice. Status now shows on a phone,
   Validate is full width, and the PDF's "Open it in a new tab" line shows on
   a phone. Pinch and pan are untouched.

**Verified** in the Browser pane against live data, opening and cancelling
only. Nothing was validated, saved, sent or deleted.

| Check | Result |
| --- | --- |
| Overflow, list, at 360 / 390 / 767 / 820 | `ok`, no offenders. Two card columns at 820 |
| Overflow with the Filters sheet (360), the Category menu (767), the bulk bar, the row menu, the detail sheet, the lightbox, Edit, Remarks, Email, Delete and Bulk Delete open (360) | `ok` for each |
| Last card's menu at 360 | Flips above its trigger, inside the viewport |
| Card → detail → Proof → Validate at 360×780 | Validate visible in the sheet footer and in the lightbox; not pressed |
| 1440 geometry against the before-measurement | Header, toolbar, search, table, all ten column widths, chip positions and first row identical |
| Card footer at 360 and 390 | One line |
| `npx tsc --noEmit` | Clean |
| ESLint on the touched files | No new problems. The 13 `no-explicit-any` errors in `RegistrantsTable.tsx` predate this batch (the committed file has the same 13) |

Screenshots in the pane were unreliable (it stopped painting when not in
front, which also froze CSS transitions mid-way). Geometry was therefore read
from the DOM, with transitions disabled by a debug-only style that was removed
afterwards.
