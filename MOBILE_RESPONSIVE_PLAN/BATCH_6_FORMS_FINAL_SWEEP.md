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

## Noticed during Batch 5

- **Communities toolbar at 1440.** The Add-a-club `<form>` is
  `.toolbar-actions`, which wraps, and its `.form-input` is `width: 100%`.
  The box fills the form's row, so **Add drops under it** on the desktop too.
  This predates Batch 5, which only styles the form below `sm`
  (`.toolbar-form`). Check it in the sweep. Keeping the box and Add on one row
  from `sm` up is a desktop change, so it is the owner's call.
- **Organizers' Filter chip does nothing.** `superadmin/organizers/page.tsx`
  renders a Filter button with no handler and no menu, at every width. A dead
  control goes against §8's no-dead-links rule. Either give it a status filter
  (the chips the feedback inbox uses) or remove it; ask the owner which.

## Acceptance

- Every route in scope passes the overflow check at 360, 390, 767 and 820.
- Every route matches its desktop before-screenshot at 1440.
- `npm run lint` and `npx tsc --noEmit` are clean.

## What landed

Uncommitted, in the main checkout. The owner decided three open items at the
start of the session: the organizers list gets status chips, `<body>` switches
to `overflow-x: clip`, and Add a club keeps one row from `sm` up.

**Files:** `globals.css`; `admin/Admin.css`, `Auth.css`, `AdminSelect.tsx`,
`OrganizerSwitcher.tsx`, `AdminRouteLoading.tsx`, `AdminNotFound.tsx`,
`loading.tsx`; new `admin/route-loading-shape.ts`, `admin/FilterChip.tsx`,
`admin/events/event-not-found.ts`; `admin/events/loading.tsx`, `new/page.tsx`,
`[id]/edit/page.tsx`, `[id]/results/page.tsx`, `[id]/registrants/page.tsx` and
`RegistrantsTable.tsx`; `EventOptionsPanel`, `BankAccountsPanel`,
`RegistrationFormPicker`, `RegistrationOpeningPicker`, `ConsentWaiverField`;
`superadmin/loading.tsx`, `organizers`, `communities` and `feedback`; plus
`PROJECT_GUIDE.md` (§3, §6, §7, §8, §9, §10) and this folder's README.

1. **Create and Edit Event.**
   - **Save stays in reach below `sm`.** `.admin-form > .form-actions` sticks
     to the foot of the screen, edge to edge on a blurred ground. Cancel keeps
     its width and Save takes the rest; two equal halves wrapped
     "Update Event" at 360.
   - **Grid and targets.** A `.form-grid` cell has `min-width: 0`. Below `lg`
     the row remove button, the add link and a checkbox row are 44px.
   - **Uploads.** Below `lg` an uploaded image's Remove is an always-visible
     bar under the image, where it used to appear on hover only. Below `sm` the
     drop zone tightens.
   - **Pickers and inputs.** The radio cards and option rows step their inset
     to 16px below `sm`. Money boxes are `inputMode="decimal"` and the slot
     limit is `numeric`. The waiver's two buttons are 44px below `lg`.
   - **Certificate.** Below `lg` the preview comes first at full width, with
     the sliders under it at 44px tall.
   - **Dialogs.** The success and failure dialogs wear `.admin-modal-panel`,
     `.admin-modal-body` and `.admin-modal-footer`, and their message wraps.
2. **Settings.** Below `sm` both buttons span the width. `PasswordField`'s
   toggle was already 44×44, and nothing overflowed.
3. **Sign-in pages** (`Auth.css`, shared by login, register and the
   invitation).
   - **Phone layout.** Below `sm` the card keeps a 16px margin and a 24px
     inset, and the title steps down to 1.5rem and wraps anywhere.
   - **Keyboard.** The card is centred by auto margins, so a tall card or an
     open keyboard starts it at the top rather than pushing its head out of
     reach.
   - **Container.** It clips instead of hiding and is `dvh` tall.
   - **Hover and glows.** The hover lift needs a real pointer. Below `lg` the
     glows are sized to the screen, and they stop under reduced motion.
4. **Shared controls.**
   - **`AdminSelect`** measures when it opens: below its trigger if the list
     fits, above if there is more room there, and capped at the room either
     way. It re-measures on scroll and resize.
   - **`OrganizerSwitcher`** is clamped inside the screen's sides, capped to
     the room above its trigger with its own scroll, and its items are 44px
     below `lg`.
5. **Skeletons.** Every route's fallback now draws its phone layout below
   `lg`. `admin/loading.tsx`, `events/loading.tsx` and `superadmin/loading.tsx`
   look the path up in `route-loading-shape.ts` and pass the shape to
   `AdminRouteLoading`:
   - metric tiles;
   - a toolbar at its measured height, then the card list in its frame;
   - form panels drawn field by field.

   The edit form's fetch wait uses the same shape. Organizers and Communities
   show `AdminCardListSkeleton` while their client fetch runs. Each shape was
   measured against its real page at 390 through a temporary preview route,
   since deleted. Where the first card or panel lands:

   | Page | Skeleton | Real page |
   | --- | --- | --- |
   | `/admin` | tiles 76 / 366, panel 466 | same |
   | Events | first card 252 | 252 |
   | Marketing, Team | first card 642 | 642 |
   | Registrants | first card 404 | 404 |
   | Settings | panels 76 / 461 tall, 569 / 572 tall | same |
   | Create Event | panel 1 is 1318 tall, panel 2 starts at 1426 | same |
   | `/superadmin` | tiles 76 / 492, panel 600 / 350 tall | same |
   | Organizers | first card 278 | 278 |
   | Communities | first card 292 | 292 |
   | Feedback | first card 660 | 660 |

   Two limits: a title long enough to wrap onto two lines (the Results
   header) is taller than the skeleton's one-line title bar, and on a tablet
   the forms' two-column grid is shorter than the skeleton's single column.
6. **404s.** The admin and superadmin 404s fit at every width.
   `/admin/events/[id]/results` answered a missing event with a bare
   `<div>Event not found</div>`. It and the registrants screen now render
   `AdminNotFound` from one constant (`events/event-not-found.ts`), so a
   missing event and one this person may not open read identically.
7. **Batch 3–5 items.**
   - **`<body>` clips `overflow-x`** (globals.css). Sticky boxes stick now: the
     phone save bar, the desktop `.admin-header` (measured pinned at `top: 0`
     at 1440), the wizard summary (120px) and the event page sidebar (128px),
     each as its own CSS intended. The public site showed no sideways scroll
     at 390 on `/`, `/events`, `/events/pink-run-2026`, its wizard and
     `/results`. `.bulk-bar` stays fixed on purpose.
   - **Organizers' dead Filter chip** is now Pending / Approved / Suspended
     `FilterChip`s, with Pending carrying its count and an empty result saying
     so. The chip moved out of the feedback page into `admin/FilterChip.tsx`,
     44px below `lg`.
   - **Add a club** stays on one row from `sm` up, with the box at 40px beside
     Add; from `sm` to `lg` it takes its own full row.
8. **Found in the sweep and fixed.**
   - The registrants Filters sheet, on an event with no registrants, opened
     as an empty strip. It now says "Nothing to filter yet…".
   - The sign-in glows' boxes reached past the right edge at 767 and 820.
     They are now sized to the screen below `lg`.

**Sweep.** Each route was loaded in hidden same-origin iframes at every width,
with the overflow script run inside. At 1024 and up the script also flags any
table that scrolls sideways. Owner routes ran as the owner, superadmin routes
as the super admin. Everything was opened and cancelled only; nothing was
saved, validated, sent or deleted.

| Route | 360 | 390 | 767 | 820 | 1024 | 1280 | 1440 | Opened while checking (360) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/admin` | ok | ok | ok | ok | ok | ok | ok | Menu opened: 256px, `ok` |
| `/admin/events` | ok | ok | ok | ok | ok | ok | ok | Last card's ⋯ menu, inside 360×780 |
| `/admin/events/new` | ok | ok | ok | ok | ok | ok | ok | Failure dialog: 336px, 44px button, `ok`. Sticky bar on the bottom edge, 48px buttons |
| `/admin/events/[id]/edit` | ok | ok | ok | ok | ok | ok | ok | Remove Image bar 212×44 |
| `/admin/events/[id]/registrants` (2 events) | ok | ok | ok | ok | ok | ok | ok | Filters sheet, inside the screen, filled and empty |
| `/admin/events/[id]/results` (2 events) | ok | ok | ok | ok | ok | ok | ok | Upload dialog, inside the screen |
| `/admin/marketing` | ok | ok | ok | ok | ok | ok | ok | New Promotion dialog, footer on screen |
| `/admin/team` | ok | ok | ok | ok | ok | ok | ok | Invite dialog; its last picker flipped **up** and stayed on screen |
| `/admin/settings` | ok | ok | ok | ok | ok | ok | ok | Buttons full width at 48px, toggle 44×44 |
| `/admin/login`, `/register` | ok | ok | ok | ok | ok | ok | ok | Card 16px from each edge, fields 16px |
| `/admin/invite/[token]` (expired-link page) | ok | ok | ok | ok | ok | ok | ok | — |
| Admin 404 | ok | ok | ok | ok | ok | ok | ok | — |
| Results / registrants, unknown event | ok | ok | ok | ok | ok | ok | ok | — |
| `/superadmin` | ok | ok | ok | ok | ok | ok | ok | — |
| `/superadmin/organizers` | ok | ok | ok | ok | **table scrolls** (743 in 678) | ok | ok | Chips 44px; filtered and cleared. Edit Fee opened: 204×44 at 16px, then cancelled |
| `/superadmin/communities` | ok | ok | ok | ok | ok | ok | ok | Add a club stacked at 360, one row at 820 and 1440 |
| `/superadmin/feedback` | ok | ok | ok | ok | ok | ok | ok | — |
| Superadmin 404 | ok | ok | ok | ok | ok | ok | ok | — |

`npx tsc --noEmit` is clean. ESLint shows no new problems on the touched
files. The remaining errors predate the batch:
- `any` in the event forms' and registrants' old catches and maps;
- `setState` in the three superadmin fetch effects;
- an unused `ResultsUploaderClient` import in `results/page.tsx`.

**For the owner to decide.**
- **The organizers table scrolls sideways at 1024**, by 65px, beside the
  280px sidebar. It fits at 1280. The plan's rule is not to hide a column, so
  this is left as found. Ways out: collapse the sidebar to its rail at that
  width, let the table wrap its Organizer Details cell, or accept it.

**Not exercised.**
- **The organizer switcher.** Neither account used has more than one
  organizer, so it never renders. The clamping is arithmetic on the trigger's
  rectangle.
- **The certificate block.** Pink Run 2026 has no template, so the preview
  above the sliders was not seen live.
- **The invitation's accept form** needs a real token. Only the expired-link
  page, which wears the same `Auth.css`, was swept.
- **A voucher batch on a marketing card** (Batch 4's note). The live data
  still has none.
- **A real keyboard on a real phone.** The keyboard-safe centring was
  reasoned from the CSS and checked with a short viewport, not on a device.
