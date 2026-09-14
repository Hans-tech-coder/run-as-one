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

## What landed

_Fill in when the batch is done._
