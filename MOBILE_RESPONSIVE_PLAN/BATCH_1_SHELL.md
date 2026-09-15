# Batch 1 — Shared shell, shared furniture, first cards

Read `README.md` in this folder first. This batch builds the pieces every later
batch reuses, so get their APIs right: a later batch should only *use* them.

## Goal

Both `/admin` and `/superadmin`, on the public site's breakpoints (README →
Decisions):
- below `md` (768px), a proper top bar and an accessible drawer, switching at
  the same line as the public `Navbar`;
- below `lg` (1024px), a page header, content padding, metric tiles and toolbar
  that fit the screen.

The Dashboard's Recent Registrations appears as cards. Desktop (1024px and up)
is pixel-identical to before.

## Files

- `src/app/admin/AdminShell.tsx` and `src/app/superadmin/SuperAdminShell.tsx`
  become thin wrappers.
- New `src/app/admin/DashboardShell.tsx`, the shared frame.
- New `src/app/admin/AdminCardList.tsx`, the shared card list.
- `src/app/admin/Admin.css`: shell, header, content, metrics, toolbar,
  responsive helpers, the card, the modal and the popover.
- `src/app/admin/page.tsx`: Recent Registrations.
- `src/app/superadmin/page.tsx`: verify only.

## What is wrong today

- `.mobile-menu-toggle` is a floating button at `top:16px; right:16px`, over
  the sticky 80px `.admin-header`. It has no backdrop, no Esc, no scroll lock
  and no focus handling. The superadmin's copy has no `aria-label` at all.
- The sidebar is `height: 100vh`, so on a phone the user block and logout can
  sit under the browser's bottom bar.
- The breakpoint is `max-width: 1024px`, a number of its own. It overlaps
  Tailwind's `lg:` at exactly 1024px, and it does not match the public
  `Navbar`, which switches at `md`.
- `.admin-header` is a fixed 80px with `--space-xl` padding. Long titles such
  as "Registrants: {event.title}" overflow.
- `.admin-content` has `--space-xl` padding everywhere, and `.admin-main` has
  no `min-width: 0`.
- `.toolbar-actions` does not wrap. `.search-wrapper` is capped at 400px, and
  `.search-input` is 0.875rem, so iOS zooms into it.
- Recent Registrations is a hand-rolled `<table>` inside `.data-table-wrapper`
  (`overflow-x: auto`).

## Tasks

1. **Extract `DashboardShell`.**
   - Props: `navItems`, `userBlock` (name, initial, role line, avatar style),
     `beforeUser` (the organizer switcher slot) and `onLogout`.
   - `AdminShell` keeps `BARE_PATHS`, the permission-driven nav and the role
     line. `SuperAdminShell` keeps its four links.
   - Behaviour and markup from `lg` up are unchanged, except that the sidebar
     now also shows at exactly 1024px.

2. **Mobile top bar**, below `md` (768px) only — the line where the public
   `Navbar` shows its hamburger.
   - Sticky, 56px, with safe-area top padding.
   - Holds the hamburger (44×44, `aria-expanded`, `aria-controls`, a label
     that says open or close) and the `RunAsOneLogo`.
   - Remove `.mobile-menu-toggle`.

3. **Drawer**, below `md`. From `md` up the sidebar is in place as on desktop,
   and `.admin-main` keeps its 280px margin.
   - Width `min(280px, 85vw)`, height `100dvh`. The nav scrolls if it
     overflows. The user block keeps a safe-area bottom inset.
   - A backdrop button closes it on tap. Esc closes it.
   - The body does not scroll while it is open. `<main>` is `inert` while it
     is open.
   - Focus moves into the drawer on open and returns to the hamburger on close.
   - It closes when `pathname` changes, not only on link click, so browser
     back closes it too.
   - Nav items are at least 44px tall.
   - Use `transitions-dev` for the slide and the backdrop fade: exit faster
     than enter, and no motion under `prefers-reduced-motion`.

4. **Breakpoints** (README → Decisions).
   - Replace `@media (max-width: 1024px)` with the public site's scale: the
     shell switches at `(width < 48rem)`, and everything else uses range
     queries at `40rem` / `64rem`.
   - Add the helpers `.dash-desktop-only` (hidden below `lg`) and
     `.dash-mobile-only` (hidden from `lg` up). This is the only place the
     table/card switch is decided.

5. **Page header.**
   - Below `md` it is not sticky, because the top bar is.
   - Below `lg`: auto height, minimum 60px, 16px padding.
   - `.admin-header-title` clamps to 2 lines with `overflow-wrap: anywhere`.
   - The back links on the edit, registrants, results and new pages get a
     44px hit area.
   - Header actions wrap onto their own line.

6. **Content.**
   - `.admin-main { min-width: 0 }`.
   - `.admin-content` padding: 16px below 640px, 24px below 1024px, and the
     current value from 1024px up.

7. **Metrics.**
   - `grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr))`.
   - Tighter gap on a phone, and `.metric-value` steps down to about 1.5rem
     below 640px.

8. **Toolbar.**
   - `.toolbar-actions` wraps.
   - Below 1024px, `.search-wrapper` takes a full row (`flex-basis: 100%`,
     `max-width: none`).
   - `.search-input` is 16px below 640px.
   - Below 640px, a toolbar's `.btn-light` spans the full width.
   - Several screens set inline `style={{ flex: 1 }}` on the toolbar; make
     sure the CSS still wins where it must.

9. **`.toolbar-popover`**, defined here and adopted by later batches.
   - From 640px up it stays anchored to its chip, with
     `max-width: calc(100vw - 32px)`.
   - Below 640px it becomes a bottom sheet:
     `position: fixed; inset: auto 12px 12px; max-height: 60dvh; overflow-y: auto`,
     with 44px options.

10. **Modal frame helpers**, defined here and adopted per batch.
    - `.admin-modal-panel` below 640px: `width: 100%`,
      `max-height: calc(100dvh - 24px)`, a scrollable body, and a sticky
      footer for the action buttons.
    - Do not restyle `components/ui/AlertModal` unless it is proven to
      overflow, because the public site uses it.

11. **`AdminCardList`**, the shared card.
    - It is data-agnostic, so the superadmin's plain arrays and TanStack
      rows both fit:
      ```ts
      items: T[]; getKey(item): string;
      title(item): ReactNode; subtitle?(item): ReactNode; badges?(item): ReactNode;
      fields(item): { label: string; value: ReactNode; full?: boolean }[];
      actions?(item): ReactNode;
      selection?: { isSelected(item): boolean; toggle(item): void; label(item): string };
      leading?(item): ReactNode; // e.g. the No. column
      expanded?(item): ReactNode; // a row that opens (voucher batches, feedback)
      empty?: ReactNode;
      ```
    - A TanStack screen passes `rows` and reads `row.original`, with selection
      through `row.getIsSelected()` and `row.toggleSelected()`.
    - The list is a grid of
      `repeat(auto-fill, minmax(min(100%, 20rem), 1fr))`, so a portrait tablet
      gets two columns only when there is room.
    - The card wears the `.admin-panel` tokens and follows the admin rule of
      outline buttons, never the gradient.
    - Fields are a `<dl>` in two columns; `full` spans both. Labels are small,
      uppercase and in the secondary colour. Values get `min-w-0` and
      `overflow-wrap: anywhere`. Badges sit in a `flex flex-wrap` row, each
      `whitespace-nowrap`.
    - The actions sit in a footer row with 44px targets. A row menu stays
      portalled, per the existing convention.
    - Write a header comment explaining the *why* (the shared row model, the
      CSS switch), in the codebase's voice.

12. **Dashboard.** Recent Registrations renders the existing table inside
    `.dash-desktop-only` and an `AdminCardList` inside `.dash-mobile-only`.
    - Title: Customer Name.
    - Subtitle: Ref.
    - Fields: Event (full width), Amount, Runners, Date.
    - Same values and the same formatting (`formatPesos`,
      `toLocaleDateString`).

13. **`PROJECT_GUIDE.md`.**
    - §3: add the two new components.
    - §9: a new "One responsive dashboard" convention covering the breakpoint
      scale shared with the public site (`sm` / `md` / `lg`), the CSS switch classes, `AdminCardList`, `.toolbar-popover`,
      `.admin-modal-panel` and the drawer behaviour.
    - §10: mark Batch 1 landed.

## Acceptance

- `/admin` and `/superadmin` pass the overflow check at 360, 390, 767 and 820.
- At 767 the drawer is in use; at 820 the sidebar is visible and Recent
  Registrations is cards; at 1024 it is the table.
- The drawer opens and closes by button, backdrop, Esc and a route change;
  focus returns to the hamburger; the page does not scroll behind it.
- Checked as owner and as staff: the nav items match the role, the organizer
  switcher works inside the drawer, and logout is reachable at 360×780.
- At 1440, the Dashboard, the Events list and the superadmin Organizers screen
  match the before-screenshots.

## What landed

**The shell.** `DashboardShell.tsx` is the frame both dashboards share.
`AdminShell` keeps `BARE_PATHS`, the permission-driven links, the role line and
the organizer switcher (passed as `beforeUser`). `SuperAdminShell` keeps its four
links and the blue avatar. `.mobile-menu-toggle` is gone. The superadmin's
logout also gained the `aria-label` that only the admin copy had.

Decisions made while building it:
- **The drawer remembers the pathname it was opened on**, not a boolean, so
  any route change closes it with no effect racing the navigation. A tap on a
  link to *another* page leaves the drawer open until the route changes, so the
  link's pending marker stays visible on a slow connection. A tap on the page
  already showing closes it on the spot.
- **A close button sits inside the drawer**, in the brand row, below `md` only.
  The hamburger lies under the backdrop while the drawer is open, so it cannot
  be the way out; focus goes to the close button on open and back to the
  hamburger on close. The top bar and `<main>` are both `inert`, which makes
  the drawer the only reachable thing without a hand-written focus trap.
- **A `matchMedia` listener closes the drawer when the window crosses `md`.**
  It is an event listener, not a render switch, so the "CSS picks the layout"
  decision stands. Without it, a drawer left open while rotating a tablet
  would keep the page locked and inert.
- **Motion** uses the modal open/close tokens: enter at `--duration-fast`,
  leave at `--duration-quick`, both `--ease-smooth-out`. Visibility follows the
  same timing, so a closed drawer's links leave the tab order only once it has
  slid away. No motion under `prefers-reduced-motion`.
- **Header padding below `lg`:** 12px top and bottom. Left and right follow
  `.admin-content` (24px, then 16px below `sm`) rather than a flat 16px, so the
  title and the page under it share one left edge.
- **The back link's 44px target** uses a -12px margin and applies at every
  width, which changes no pixel of the layout. It also gained
  `aria-label="Back to Events"`.
- **Logout is 44×44 below `lg` only.** On the desktop it stays 34px, so the
  sidebar measures as before.
- **`.toolbar-popover` and `.admin-modal-panel`** (with `.admin-modal-body` and
  `.admin-modal-footer`) are defined but not yet used anywhere; Batches 3–4
  adopt them. The phone-width popover and modal rules use `!important` on
  position and width, with the reason written beside them.
- **`AdminCardList` has no `"use client"`.** It holds no state, so the server
  Dashboard renders it directly.
- The Dashboard's `any[]` for recent registrations is now a real type, so its
  file lints clean.

**Verified** (as super admin):
- At 1440, `/superadmin` and `/superadmin/organizers` measure identically to
  their before-baseline, box by box: sidebar, brand, nav items, user block,
  header, title, panel, toolbar, search and table.
- `/superadmin` passes the overflow check at 360, 390, 767 and 820. At 767 the
  top bar and drawer are in use; at 820 the sidebar stands in place and the
  header is sticky; at 1024 the desktop padding is back.
- At 360×780 the drawer:
  - opens with focus on its close button, the body locked, and the top bar
    and main content inert;
  - closes by Esc, by the backdrop and by a route change, returning focus to
    the hamburger;
  - keeps logout on screen, at 44×44.
- `npx tsc --noEmit` passes, and eslint is clean on every touched `.tsx`.

**Verified** (as owner):
- At 1440, `/admin` has the same frame boxes as the superadmin baseline: brand
  89px, nav items 56px, user block 89px, logout 34px, header 80px, and content
  inset 32px. `/admin/events` keeps its toolbar: search 400×40 at 14px, the
  View chip, and Create Event on the right.
- `/admin` passes the overflow check at 360, 390, 767 and 820. The owner's
  drawer lists Dashboard, Events, Marketing Tools, Team and Settings, reads
  "Owner", and keeps logout on screen at 44×44.
- At 360 on `/admin/events`, the search takes its own row at 16px, View wraps
  beneath it, and Create Event spans the width. The table under it still
  clips inside its panel; that is Batch 2.
- **Cards with data.** This organizer has no PAID orders, so the Dashboard
  only shows its empty state. The cards were checked on a throwaway page
  rendering the Dashboard's exact `AdminCardList` config with fake rows,
  including a very long name, reference and event title; the page was deleted
  afterwards. Results:
  - 360: one column, everything wraps, no overflow, and the header clamps to
    2 lines.
  - 767: two columns.
  - 820: one column beside the sidebar.
  - 1024 and 1280: the table is back and the cards are hidden.
- **Not yet checked:** a staff account (role-limited links, and the
  organizer switcher inside the drawer). It needs a staff session.

**After the batch: the menu redesign** (the owner's request, from a
reference design). Later batches use this API, not the one described above:
- `DashboardShell` now takes `secondaryNavItems` (drawn below a divider,
  before Log Out) and `initialCollapsed`.
- Log Out is a menu row; the user block has no logout button and no
  `.admin-logout`.
- `AdminShell` passes Settings as a secondary item. `SuperAdminShell` has
  none.
- From `md` up the sidebar collapses to an 80px icon rail. The choice is kept
  in the `dash_sidebar` cookie (`dashboard-sidebar.ts`), read by both
  layouts.
- `OrganizerSwitcher` becomes an icon on the rail, and its menu keeps a
  240px minimum width.
- The Dark Mode switch in the reference was left out, because the dashboards
  have no light theme.

**Then: one menu on phones too** (the owner's decision). The phone's top bar,
hamburger, drawer and drawer close button were removed. The owner did not want
a phone menu that looks different from the desktop's, so the task list above
(tasks 2 and 3, and the drawer lines of the acceptance and verification notes)
is history:
- **Below `md` the sidebar is the same menu, smaller.** It rests as a 56px
  rail: 44px rows, a 26px mark, a 32px avatar. The same chevron opens it over
  the page at `min(256px, 85vw)`, with a backdrop. The page keeps a 56px left
  margin and is never pushed.
- **On a phone, open is temporary.** `.is-collapsed` and the cookie are
  ignored there, and `.is-open` alone decides. The open state remembers its
  pathname, so a route change folds it. Esc and the backdrop fold it and
  return focus to the chevron, and while open the body is locked and `<main>`
  is inert.
- **The chevron's meaning depends on the width.** A `useSyncExternalStore` on
  `(width >= 48rem)` tells it whether a press toggles the remembered collapse
  or the phone's temporary open, and words its label. The layout itself is
  still decided in CSS, so there is no flash.
- **Tooltips stay desktop-only.**

**Deferred:** see "Noticed during Batch 1" in `BATCH_5_SUPERADMIN.md` (the
Organizers table clipped at 360px, and two older dashboard-tile defects).
