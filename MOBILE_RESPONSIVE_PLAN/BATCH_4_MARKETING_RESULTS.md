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

## What landed

_Fill in when the batch is done._
