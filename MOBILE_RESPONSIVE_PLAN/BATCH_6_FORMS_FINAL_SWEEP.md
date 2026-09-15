# Batch 6 — Forms, sign-in pages, skeletons, and the final sweep

Read `README.md` in this folder first. Batches 1–5 must have landed. This batch
closes the plan: it fixes what is left and then proves every route in scope.

## Files

- `src/app/admin/events/new/page.tsx` (551 lines) and
  `src/app/admin/events/[id]/edit/page.tsx` (906 lines)
- `src/app/admin/events/EventOptionsPanel.tsx`, `BankAccountsPanel.tsx`,
  `PosterField.tsx`, `InclusionsField.tsx`, `ConsentWaiverField.tsx`,
  `RegistrationFormPicker.tsx` and `RegistrationOpeningPicker.tsx`
- `src/app/admin/settings/AccountSettingsClient.tsx` and `PasswordField.tsx`
- `src/app/admin/login/page.tsx`, `register/page.tsx`,
  `invite/[token]/InviteAcceptClient.tsx` and `Auth.css` (which has no media
  queries today)
- `src/app/admin/AdminSelect.tsx` and `OrganizerSwitcher.tsx`
- `src/app/admin/AdminNotFound.tsx`, `AdminRouteLoading.tsx`, `loading.tsx`
  and `src/app/superadmin/loading.tsx`

## Tasks

1. **Create and Edit Event.**
   - Every section is a single column below 640px, and every input is 16px.
   - `EventOptionsPanel` category rows (`md:grid-cols-2`) stack, with 44px
     add and remove buttons.
   - `BankAccountsPanel` and `PosterField` uploads fit, with thumbnails full
     width.
   - `RegistrationFormPicker` radio cards stack.
   - **Certificate coordinates** (the labels at around lines 781–805 with
     `flex justify-between`): the template preview scales to the width, and
     the coordinate inputs stack under it.
   - A sticky save footer below 640px, so Save is never a long scroll away.
   - The success and error modals (around lines 200–238 and 314–352) get
     `.admin-modal-panel`.

2. **Settings.** Profile and password forms fit at 360px. `PasswordField`'s
   show/hide toggle is 44px.

3. **Sign-in pages.** Login, register and the invite accept page fit at 360px:
   - no overflow, and inputs at 16px;
   - the card has side margin and is not flush to the screen edge;
   - it holds with the keyboard open.

4. **Shared controls.**
   - `AdminSelect` menus stay inside the viewport and flip up near the bottom.
   - `OrganizerSwitcher` opens upward from the phone's opened menu, and from
     the collapsed rail, without being clipped.

5. **Skeletons.** Every route's loading state mirrors its mobile layout below
   1024px (cards, not table rows), so there is no layout shift when the page
   streams in.

6. **404s.** The admin and superadmin not-found pages fit at 360px.

7. **Final sweep.**
   - Every route listed in `README.md` → Routes in scope, at 360, 390, 767,
     820, 1024, 1280 and 1440, with the overflow check at 360, 390, 767 and
     820.
   - At 1024 and 1280, note any wide table that still scrolls, for the owner
     to decide (README → Decisions). Do not hide its columns.
   - At least one menu or modal per screen checked while open.
   - Record the results in "What landed" below as a table of route × width.
   - Fix what the sweep finds, as long as it is small. Anything larger is
     written up for the owner rather than started.

8. **Close the plan.**
   - Status table: all batches landed.
   - `PROJECT_GUIDE.md` §10: `MOBILE_RESPONSIVE_PLAN/` is finished and kept
     only for its reasoning.
   - §9: the responsive convention is complete and self-sufficient, so future
     screens can follow it without reading the plan.

## Noticed during Batch 3

- **Nothing sticks to the viewport inside the dashboard.** `<body>` computes
  `overflow-x: hidden` (so `overflow-y: auto`), which makes it a scroll
  container that never scrolls itself: the page scrolls on `<html>`. A
  `position: sticky` box inside the page therefore stays where the page put
  it. The desktop `.admin-header` is `sticky; top: 0` and scrolls away with
  the page (measured at 1440 on the registrants screen). Batch 3's bulk bar
  worked around it with `position: fixed`. The fix is one declaration,
  `overflow-x: clip` on `body` instead of `hidden`, but it touches every page
  on the public site too, so it is for the owner to approve and for the sweep
  to verify, not a quiet change.

## Noticed during Batch 4

- **The marketing card's "Show N codes" disclosure has not been tried on a
  real batch.** The live data holds no voucher batch, and Batch 4 did not
  create a promotion to get one. When one exists (or on a seeded local
  branch), open and close it at 360, check reduced motion, and confirm that a
  batch opened on a card is still open in the table after widening past
  1024px.
- **`/admin/events/[id]/results` answers a missing or unreachable event with
  a bare `<div>Event not found</div>`**, outside the header and content frame.
  The sweep should check it at 360 beside the admin 404, and decide whether it
  should wear `AdminNotFound`.

## Acceptance

- Every route in scope passes the overflow check at 360, 390, 767 and 820.
- Every route matches its desktop before-screenshot at 1440.
- `npm run lint` and `npx tsc --noEmit` are clean.

## What landed

_Fill in when the batch is done, including the sweep table._
