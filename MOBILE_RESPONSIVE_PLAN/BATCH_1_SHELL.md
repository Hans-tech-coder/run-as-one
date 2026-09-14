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

_Fill in when the batch is done: the decisions made and anything deferred._
