# Batch 4 — Marketing and race results

Read `README.md` in this folder first. Batches 1–3 must have landed.

## Files

- `src/app/admin/marketing/PromoCodesClient.tsx` (1,766 lines),
  `PromoActionsMenu.tsx` and `page.tsx`
- `src/app/admin/events/EventPromotionsPanel.tsx`, the read-only panel on the
  edit screen
- `src/app/admin/events/[id]/results/ResultsTableClient.tsx` (490 lines),
  `ResultsUploaderClient.tsx` (508 lines) and `page.tsx`

## Marketing tasks

1. **Metric cards** (Running Now, Times Redeemed, Given Away). Confirm the
   Batch 1 metric rules hold.

2. **Toolbar.**
   - Search on a full row, plus `MobileSortMenu`.
   - The filter menu at around line 947 becomes a `.toolbar-popover`.
   - The create button spans the full width on a phone.
   - Adopt `AdminTablePager` (around line 1086).

3. **Promotion cards.**
   - Leading: No.
   - Title: Code, or the name for an automatic promotion, with a chip for
     *Automatic* or the batch label.
   - Badges: Status, with the *Ends in 3 days* `.status-note`.
   - Fields: Discount, Applies To, Conditions (full width), Used, Given.
   - Actions: `PromoActionsMenu` (view redemptions, edit, duplicate, pause,
     delete).

4. **Voucher batch rows.** On desktop they are a second `TableRow`. On a card
   they become a **"Show N codes"** disclosure inside the card, using the
   `AdminCardList` `expanded` slot.
   - Animate it with `transitions-dev` (accordion), and respect reduced
     motion.
   - The expanded state lives in the parent, so it is shared with the table
     row.
   - Copy buttons are 44px.

5. **Create / Edit / Duplicate modal** (around line 1159, `max-w-2xl`).
   - Apply `.admin-modal-panel`, with 16px inputs.
   - The kind picker, event scope and date window stack below 640px.
   - The `CATEGORY_PRICE` price rows (category, price, per-category cap)
     become one stacked block per category. Check the `min-w-[6rem]` span at
     around line 1401.
   - Every refusal stays under its own field.

6. **Redemptions panel, and the older `showModal` dialog** (around line 1280).
   - Confirm which one is still live before touching it.
   - Both fit 360px and scroll inside.
   - Each redemption links through to the registrants screen by `?search=`.

7. **`EventPromotionsPanel`.** It is read-only; make it stack cleanly on the
   edit screen at 360px.

## Results tasks

8. **Header.** "Race Results for {event.title}" and its actions use
   `justify-between`, so let the actions wrap under the title.

9. **Results table.**
   - The three filter menus (around lines 280, 315 and 344) become
     `.toolbar-popover`s.
   - Adopt `AdminTablePager` (around line 432) and `MobileSortMenu`.

10. **Result cards.**
    - Leading: No.
    - Title: Name, truncating.
    - Badge: a Bib chip.
    - Fields: Category, Gender, Category Rank, Gender Rank, Chip Time, Gun
      Time.
    - Times keep going through the existing whole-second formatting; do not
      re-derive it.

11. **Uploader.**
    - The drop zone fits at 360px.
    - The header-row detection preview must not scroll sideways: show it as a
      stacked list of the detected columns, or a card per sample row.
    - The seven native `<select>`s for column mapping (around lines 404–468)
      move onto `AdminSelect`, with the label stacked above each on a phone.

12. **`PROJECT_GUIDE.md`.**
    - §6: short mobile notes for `/admin/marketing` (the voucher disclosure)
      and `/admin/events/[id]/results` (the uploader mapping).
    - §9: remove the results uploader from the remaining-native-selects note.
    - §10: Batch 4 landed.

## Acceptance

- `/admin/marketing` and `/admin/events/[id]/results` pass the overflow check
  at 360, 390, 767 and 820, including with the create modal, the redemptions panel
  and the menus open.
- The uploader flow can be walked to the mapping step at 360px. Do not import
  over a live event's results; stop before confirming.
- At 1440, Marketing, Results and the edit screen's Promotions panel match
  their before-screenshots.

## Noticed during Batch 2

- `PromoActionsMenu` still places itself at `rect.right - 210,
  rect.bottom + 8`. That throws it off a phone screen's edge, and below the
  fold for the last card. Move it onto `placeRowMenu` in
  `admin/row-menu-position.ts`, as `EventActionsMenu` and `TeamActionsMenu`
  now do.

## What landed

Uncommitted, in the main checkout.

**Files:** `marketing/PromoCodesClient.tsx`, `marketing/PromoActionsMenu.tsx`,
`events/EventPromotionsPanel.tsx`, `results/ResultsTableClient.tsx`,
`results/ResultsUploaderClient.tsx`, `admin/AdminSelect.tsx` (its `label` is now
a node, so a required field carries its asterisk), `admin/Admin.css`,
`app/globals.css`, plus `PROJECT_GUIDE.md` (§6, §9, §10) and this folder's
README. `marketing/page.tsx` and `results/page.tsx` needed nothing: the metric
cards already stack under Batch 1's rules, and the results header holds only
the back arrow and a title that clamps to two lines.

1. **Marketing toolbar.** The search has its own row. View is desktop-only on a
   `.toolbar-popover`, `MobileSortMenu` joins below `lg`, New Promotion spans a
   phone's width, and the pager is `AdminTablePager`.
2. **Promotion cards.** The leading slot is No. The title is the code or name,
   with the table's own "Automatic · no code to give out" or "N single-use
   vouchers" as the subtitle. The badge is Status with its *Ends in N days*
   note. The fields are Discount, Applies To, Conditions (full), Used and
   Given. Status, Used and the voucher list are single components, shared by
   the cell and the card. The footer follows the Batch 2 convention:
   **Redemptions** as the shortcut, then ⋯.
3. **Voucher batches.** On a card, a batch shows a **"Show N codes" / "Hide
   codes"** disclosure in the `expanded` slot, on transitions.dev's accordion
   (21). It was pasted verbatim as `.t-acc` in `globals.css`, with its
   `--acc-*` tokens and reduced-motion guard. It reads the parent's `expanded`
   state, the same one the table's second row reads. The closed list is
   `inert`, and it has no id or aria-controls, because the table renders
   beside it. *Copy all codes* is 44px below `lg`.
4. **Promotion form.** The form is `.admin-modal-panel`, with a 44px close and
   a scrolling body. Save sits in the footer through `form="promo-form"`, so it
   stays in reach. Below `sm`, these stack:
   - the claim picker, into three 44px rows
   - Register / Get free, prefix / count, and Starts / Ends
   - each `CATEGORY_PRICE` row, into one block: name, "List price ₱…", then
     the two boxes side by side with visible captions. The `min-w-[6rem]` span
     drops its floor there.

   The screen-reader labels and every per-field refusal are unchanged.
5. **Redemptions panel.** It is `.admin-modal-panel`, with a 44px close, a
   16px inset on a phone and a sticky footer. On a phone each order's meta
   line wraps instead of truncating, and the reference wraps anywhere. The two
   dialogs are both live: `showModal` is the promotion form, and the
   redemptions panel is its own.
6. **`PromoActionsMenu`.** It is on `placeRowMenu`, as the Batch 2 note asked,
   with the layout-effect re-measure, `data-origin`, Escape returning focus to
   the trigger, and no `mounted` flag. The `Admin.css` comment that said three
   components repeat `rect.right - 210` now names `ROW_MENU_WIDTH`.
7. **`EventPromotionsPanel`.** Below `sm`, the badge drops under the
   description, the name wraps anywhere, and Marketing Tools is 44px. Every
   `.admin-panel-header` may now wrap below `sm`, with a 12px gap, so a
   header's action drops under its title rather than past the panel's edge.
8. **Results table.** The Category and Gender menus are `.toolbar-popover`s,
   holding buttons (`menuitemcheckbox`), not clickable divs. Escape closes
   them. View is desktop-only, `MobileSortMenu` joins below `lg`, and the
   pager is `AdminTablePager`. No. now counts by row id (`rowPosition`).
9. **Result cards.** The leading slot is No. The title is the name,
   truncating. The badge is a Bib chip. The fields are Category, Gender,
   Category Rank, Gender Rank, Chip Time and Gun Time, through `toWholeSeconds`.
10. **Uploader.** The `.modal-container` also wears `.admin-modal-panel` and
    `.admin-modal-body`. The phone rules for the old frame are scoped under
    `.admin-modal-panel`, because the public site's dialogs share
    `.modal-header` / `.modal-close`. They give a 16px inset, a `dvh` cap, a
    44px close and a narrower drop-zone inset.
    - The file name wraps.
    - **All seven native selects are `AdminSelect`**: Target Category, Header
      Row, and the five column pickers.
    - A missing required column now also gets its own sentence under the
      field, beside the red border and the summary.
    - The header-row preview no longer stretches a native select. Each row's
      first labels are the option's small print, and the chosen row's columns
      are spelled out under the field.
    - The sheet panel's overflow is visible, so the last picker's list is not
      cut off.
    - *Process & Upload Results* sits in a sticky `.admin-modal-footer`.

**Verified** in the Browser pane against live data, opening and cancelling
only. Nothing was saved, paused, deleted, duplicated or imported. The uploader
was walked to the mapping step with an in-memory CSV and closed by reloading.

| Check | Result |
| --- | --- |
| Overflow, `/admin/marketing` list, at 360 / 390 / 767 / 820 | `ok`, no offenders. Two card columns at 767 |
| Overflow, marketing, at 360 with the last card's menu, the Redemptions sheet, and the create form (race picked, price rows shown, then Buy X Get Y) open | `ok` for each |
| Marketing at 767 with the Sort sheet open | `ok`, View hidden |
| Last card's menu at 360 | Flips above its trigger (`bottom-right`), inside the viewport; Escape closes and refocuses the trigger |
| Promotion form at 360 | 336×756 panel; claim options 44px rows; price boxes 16px; Save stays at the foot after scrolling the body |
| Overflow, `/admin/events/[id]/results` (BizRun V2.0, 1,271 rows), at 360 / 390 / 767 / 820 | `ok`, no offenders |
| Results at 360 with the Category sheet, Sort, and the uploader at the mapping step (and its last picker's list) open | `ok` for each; sheet options 44px |
| Edit screen Promotions panel at 360 | `ok`; link wraps under the title at 44px |
| 1440 geometry, Marketing and Results, against the before-measurement | Header, metric cards, toolbar, search, chips, table, every column width, rows and pager identical |
| 1440 geometry, the edit screen's Promotions panel | Panel, header, link, item and badge identical |
| Desktop row menu at 1440 | Opens under its trigger with all five items; Escape closes |
| `npx tsc --noEmit` | Clean |
| ESLint on the touched files, against their committed versions | No new problems. `PromoActionsMenu` went from 2 errors to 0 and `ResultsTableClient` from 5 warnings to 1. What remains predates the batch: `any`s and the uploader's `setMounted` effect |

**Not exercised: the voucher disclosure.** The live data has no voucher batch,
and no promotion was created to make one. The markup, `.t-acc` CSS and shared
`expanded` state are in place; see the Batch 6 note.

The owner's `localhost:3000` server was not running during verification, so
the session started it from `.claude/launch.json` ("run-as-one dev").

**Follow-up (the owner's report).** On a phone, the Redemptions panel's Close
footer spilled square corners past the panel's rounded bottom. The cause was
shared: on a phone `.admin-modal-footer` paints its own background, and the
panel did not clip its children. So `.admin-modal-panel` in `Admin.css` is now
`overflow: clip` at every width. `clip`, not `hidden`, so the panel does not
become a scroll container.
- **Fixed for:** the marketing Redemptions panel, the registrants Edit /
  Remarks / Email / Delete modals, the team invite form, the events Schedule
  and Delete modals, and the results uploader.
- **Checked at 360:** Redemptions and Remarks have round corners with the
  footer inside the edge. The team invite form's role list still opens in
  full, with no overflow.
