# Light Theme Plan: the dashboard's Dark Mode switch

This file tracks the dashboard's light theme. It records the audit of
`src/app/admin` done on 2026-09-18 and the batches that follow from it.
**One batch per session.** When a batch lands, tick its box here and update
`PROJECT_GUIDE.md` in the same change.

## Where it stands

- **The switch has landed** (2026-09-18, on `dev`, uncommitted). *Dark Mode*
  sits in the account menu between the settings pages and Log Out. It is kept
  in the `dash_theme` cookie (`admin/dashboard-theme.ts`), drawn as
  `data-theme` on `.admin-layout` on the server's first paint, and mirrored
  onto `<html>` while the dashboard is mounted.
- **Batch 1 has landed** (2026-09-18, on `dev`, uncommitted). The palette is
  tokens, the frame, sidebar, header, account menu, dropdowns, modals, badges,
  buttons and form controls in `Admin.css` follow the switch, and the dark
  theme computes to the values it had before (bar three near-identical shades:
  the proof box, the viewer poster's placeholder and an unread notification's
  sentence now sit on the nearest token). What is still dark on a
  light setting is TSX: Tailwind `white/…`, `gray-…` and `black/…` classes and
  the `bg-[#111]` / `bg-[#050505]` panels (FiltersMenu's sheet, the table
  pager, the bell's ring). That is Batches 2 and 3.
- **Batch 2 has landed** (2026-09-18, on `dev`, uncommitted). The shared
  table primitives, the toolbar popovers, the notification bell and centre,
  `AlertModal`, `Toast`, the loader and shimmer tokens, and every `bg-[#111]`
  modal panel and `bg-[#050505]` toolbar popover in the dashboard now read
  tokens. What is still dark on a light setting is the pages' own TSX (their
  headings, table cells, form rows and modal bodies): Batch 3.
- **Batch 3 has landed** (2026-09-18, on `dev`, uncommitted). **The plan is
  finished.** Every dashboard page's TSX reads tokens; a sweep of
  `src/app/admin` (sign-in, register and invite excepted) finds no
  `text-white`, `white/…`, `black/…` or `gray-…` class left beyond the
  exceptions listed under Batch 3.

### How the tokens work (read before Batch 2)

- **Names, in `globals.css`.** `:root` holds the dark values and
  `[data-theme="light"]` the light ones: `--bg-dark` (page ground), `--ink`
  (what hairlines and hovers are made of), `--dash-surface`, `--dash-sunken`,
  `--dash-field`, `--dash-field-focus`, `--dash-chrome` (sidebar),
  `--dash-header`, `--dash-panel`, `--dash-panel-solid`, `--dash-scrim`,
  `--dash-shadow`, `--dash-inverse-bg/-fg/-hover` (`.btn-light` and the rail
  tooltip), `--text-primary/-secondary/-muted`, `--status-success/-warning/-danger`,
  `--accent-blue-text`, `--accent-orange-text` and `--color-scheme`.
- **The ink ramp** `--ink-02` … `--ink-85` replaces every
  `rgba(255,255,255,a)`: it is `color-mix(var(--ink) a%, transparent)`, declared
  on `:root, [data-theme]` so it re-resolves inside a themed frame (a custom
  property resolves `var()` where it is declared). `--dash-hairline`,
  `--dash-border` and `--dash-hover` are named steps on it; the light theme
  bumps the first two one step, since 5% black reads fainter than 5% white.
- **For TSX in Batches 2 and 3:** `text-white` → `text-primary`,
  `text-gray-400` → `text-secondary`, `border-white/10` →
  `border-[var(--dash-border)]`, `bg-white/5` → `bg-[var(--ink-05)]`,
  `bg-[#111]` → `bg-[var(--dash-panel-solid)]`, and a `bg-black/60` scrim →
  `bg-[var(--dash-scrim)]`. `text-primary`, `text-secondary` and `bg-dark` now
  follow the theme on their own (`@theme inline`).
- **Added in Batch 2:** `--dash-popover` (a toolbar's small menus — Columns,
  Filters, Sort, page size; `#050505` dark, white light, so the dark theme
  keeps its exact near-black rather than moving to the panel's `#111114`),
  `--ink-20`, and `--tone-amber/-green/-red/-violet` for words on a tinted chip
  (Tailwind's 300 step on dark, its 700 step on light). Also `text-gray-300`
  → `text-[var(--ink-85)]`, `text-gray-500` → `text-[var(--text-muted)]`, a
  checked box → `bg-[var(--ink)]` with a `--dash-inverse-fg` tick, and
  `text-[#4da3ff]` → `text-[var(--accent-blue-text)]`.
- **A token built from another token resolves where it is declared**, so one
  derived in `:root` (`--runner-far`, `--shimmer-*`) must be declared again
  in the `[data-theme="light"]` block, the same way the ink ramp is.
- **Left as literals on purpose:** text on a coloured fill (the orange avatar,
  the blue knob), the black overlays laid over photos (file preview), and the
  short drop shadows under small controls.

## Standing decisions (do not relitigate)

- **Dark is the default.** Only a stored `light` changes it. The switch is on/off,
  with no "follow system" third state.
- **The choice is scoped to the dashboard.** The public site stays dark and
  never reads `dash_theme`. The sign-in pages under `/admin` (`bare-paths.ts`,
  `Auth.css`) are not themed either.
- **Theme through tokens, never per-component `dark:` branches.** A surface
  reads a variable, and `[data-theme="light"]` redefines the variable. That is
  how the logo already works, and it is the only way 86 files stay in step.

## Audit findings: why light mode cannot work today

Counts are from `src/app/admin` unless a line says otherwise.

1. **The base tokens have no light values.** `--bg-primary`, `--text-primary`,
   `--text-secondary`, `--glass-*` and `--bg-secondary` are defined once in
   `globals.css` `:root`, and nothing redefines them under
   `[data-theme="light"]`.
2. **Tailwind's theme colours are literals, not variables.** The `@theme`
   block sets `--color-primary: #ffffff`, `--color-secondary: #a1a1aa` and
   `--color-dark: #050505` as fixed hexes, so `text-primary`, `text-secondary`
   (145 uses) and `bg-dark` can never follow a token. They need `@theme inline`
   pointing at the CSS variables.
3. **Tailwind white and black classes in 86 TSX files.** The main ones are
   `text-white` (163), `border-white/10` (116), `text-gray-500` (75),
   `text-gray-400` (71), `bg-white/5` (36), `border-white/5` (25),
   `text-gray-300` (24), `bg-white/10` (21), `border-white/20` (18) and the
   `bg-black/*` scrims (~45). The heaviest files are
   `RegistrantsTable.tsx` (98), `PromoCodesClient.tsx` (40),
   `TeamClient.tsx` (25), `EventsTableClient.tsx` (22) and
   `ActivityClient.tsx` (19).
4. **Hard-coded panel hexes in TSX.** `bg-[#111]` appears on 17 modal panels,
   `bg-[#050505]` on 9 sticky or table surfaces (AdminDataTable,
   AdminTablePager, FiltersMenu, MobileSortMenu, EventsTable, Registrants,
   Results, Promo codes, Team), and there are one-offs: `#0d0d0f` in
   AdminSelect, `#0b0b0b` in ProofLightbox, `#4da3ff` in NotificationsCenter,
   `#faad14` in RecordRemittanceDialog, and an inline `#ff4d4f` in
   ResultsUploader.
5. **`Admin.css` is dark by construction.** It has 77 `rgba(255,255,255,…)`
   surfaces and hairlines, 36 `rgba(0,0,0,…)` shadows and scrims, and panel
   literals such as `rgba(15,15,20,0.95)` (every dropdown), `#111114` and
   `#0f0f14`. **`.btn-light` is a light pill (`#e4e4e7` / `#09090b`)** that
   needs its own inversion on a light ground, or every page's primary action
   turns into a grey chip on grey.
6. **Status colours are tuned for black.** `#52c41a` (13 uses), `#faad14` (8)
   and `#ff4d4f` (7) are light tints that fall below 4.5:1 on white. They need
   deeper light-theme values, the same way the logo's accents were deepened.
7. **The browser's own controls are forced dark.** `color-scheme: dark` is set
   globally on every date and time input and on `.input-group input[type=date]`
   in `globals.css`, and inline as `colorScheme: 'dark'` in PromoCodesClient
   (×2) and RecordRemittanceDialog. The select chevron and the date and time
   picker icons are SVG data URIs with a baked-in `rgba(255,255,255,0.55)`
   stroke (`globals.css` ×3, `Admin.css` ×1).
8. **Shared components that the dashboard renders are dark-only.**
   `NotificationBell.tsx` (11 literals; its comment says "the admin is dark at
   every setting"), `AlertModal.tsx` (11) and `Toast.tsx` (4). Loader and
   shimmer tokens are literal too: `--shimmer-base: #a1a1aa`,
   `--shimmer-highlight: #fff`, and `--runner-far` mixes toward `#050505`.
   The body's `text-white` in the root `layout.tsx` is a fixed class.
9. **An existing bug the audit found: `--bg-dark` is never defined.**
   `.admin-layout { background-color: var(--bg-dark) }` and the collapse
   knob's `box-shadow: 0 0 0 3px var(--bg-dark), …` both read an undefined
   variable. The frame is therefore transparent (it shows the body's
   `#050505` by luck), and the knob's 3px ring is silently dropped.
   `RegistrationWizard.css` reads the same undefined name. Fix it while
   defining the tokens.
10. **Duplicated rules make the tokens harder to apply.**
    `.action-dropdown-item` and its `:hover`, `.success` and `.danger` variants
    are declared twice in `Admin.css`, around lines 2768 and 2835. The second
    set, with `transition: all 0.2s`, overrides the first set's motion tokens.
    Collapse them into one set when tokenising.

**No blockers were found outside colour.** There are no charts, canvases or
images whose colours are baked in, and `table.tsx`, `Skeleton.tsx`,
`RunnerLoader.tsx` and `FieldError.tsx` already read tokens. The e-mail
previews render their own dark document on purpose and should stay dark.

---

## ☑ Batch 1: Tokens, and making the switch safe

- [x] Define the dashboard palette as variables (surface, raised surface, panel,
      hairline, hover, text primary, secondary and muted, scrim) with dark
      values in `:root` and light values under `[data-theme="light"]`.
- [x] Define `--bg-dark`, which fixes finding 9.
- [x] Change the `@theme` colours to `@theme inline` so they point at the
      variables (finding 2).
- [x] Tokenise `Admin.css` (finding 5): the frame, the sidebar, the header,
      dropdowns, modals, `.btn-filter`, `.btn-light` and `.btn-secondary`.
      Merge the duplicate dropdown rules (finding 10).
- [x] Add light-theme status colours (finding 6).
- [x] Make `color-scheme` and the SVG icons follow the theme (finding 7).
- [x] Verify the frame, the menu and one table page in both themes, at 375px
      and at desktop width. (Dashboard, account menu and Events, 2026-09-18.
      The frame's dark computed colours match the old literals exactly.)
- Also done here: the root layout's body is `text-primary` rather than
  `text-white` (finding 8, one word), and the three inline
  `colorScheme: 'dark'` styles are gone, since the global date-input rule now
  follows the theme.
- **Fixed a field leak found while checking the event form.** `Auth.css`
  (the sign-in pages) declared an unscoped `.form-input`, and
  `admin/loading.tsx` imports it through `AuthRouteLoading`, so it loaded on
  every dashboard page and could override `Admin.css`'s field: a fixed
  `rgba(0,0,0,0.4)` fill (grey on the light theme) and a border read from the
  never-defined `--color-border`, which drops the border on both themes. Its
  field rules (`.form-group`, `.form-label`, `.form-input`, `.form-hint`,
  `.form-optional`, `.form-textarea`) are now scoped to `.auth-container`,
  which all four sign-in pages wrap their forms in.
- One deliberate change to the dark theme: a menu item's success and danger
  hover keep their own status ink rather than switching to the second set's
  `#22c55e` / `#ef4444`, which went away with the duplicate rules.

## ☑ Batch 2: Shared primitives and modals

- [x] Tokenise `AdminSelect`, `AdminDataTable`, `AdminCardList`,
      `AdminTablePager`, `FiltersMenu`, `FilterOptions`, `MobileSortMenu`,
      `RowActionsMenu` and the `bg-[#111]` / `bg-[#050505]` surfaces (finding 4).
- [x] Tokenise `NotificationBell`, `NotificationsCenter`, `AlertModal`,
      `Toast`, and the shimmer and runner tokens (finding 8).
- [x] Verified on Communities (the shared table, View popover, row actions,
      the remove confirmation, the notification centre, and the phone's card
      list and Sort sheet at 375px) in both themes; the dark theme's bell,
      shimmer and loader tokens compute to the old values.
- Only the panel surface line was converted in the page files (fill and its
  hairline); the rest of each page is Batch 3. `ProofLightbox`'s `#0b0b0b`
  frame stays for Batch 3 with the rest of that file. The bell's badge fills
  and the solid red and green confirm buttons keep white text, since it sits
  on a coloured fill. The public register fields' `#0d0d0f` lists stay: the
  public site is not themed.

## ☑ Batch 3: Pages, heaviest first

- [x] `RegistrantsTable` and `ProofLightbox`.
- [x] `PromoCodesClient` and the event create and edit forms.
- [x] Team, Clients, Activity, Feedback, Remittances, Results, Communities,
      Settings, and the Viewer dashboard.
- [x] Sweep for any `text-white`, `white/…` or `black/…` class left over
      (finding 3). The only ones allowed to remain are text on a coloured fill,
      such as the orange avatar or a solid button.
- Done as one pass over all 94 dashboard TSX files with the Batch 1/2 mapping
  (plus `text-white/NN` → the nearest ink step, `bg-black/20|30|40` →
  `--dash-sunken|surface|field`, every `bg-black/60–90` scrim →
  `--dash-scrim`, `border-gray-700/50` → `--dash-border`), and the checkbox,
  column dot and white "primary" button copied from `AdminCardList` /
  `.btn-light` (`--ink` fill, `--dash-inverse-*`). `AdminRouteLoading`'s
  inline rgba, ResultsUploader's red asterisk, RecordRemittanceDialog's
  `#faad14` and ProofLightbox's `#0b0b0b` frame read tokens too.
- **Added: `--accent-blue-ink` / `--accent-orange-ink`** (Tailwind
  `text-accent-blue-ink`, `text-accent-orange-ink`), for words and icons in
  brand colour. They are the exact brand hexes on dark, so the 36 former
  `text-accent-blue` / `text-accent-orange` uses do not move there, and the
  logo's deepened pair on light, since the brand hexes fall below 4.5:1 on
  white. `--accent-*-text` stays for the places that already used it.
- **Status words moved onto the status tokens**: `text-red-400/500`,
  `text-green-400/500`, `text-orange-400`, `text-amber-400` →
  `--status-danger/-success/-warning`, and the amber notice's
  `text-amber-300/90` → `--tone-amber`. On dark this is a small, deliberate
  shift (e.g. `#f87171` → `#ff4d4f`), so a status reads the same colour on
  every screen; on light it is what makes them legible.
- **Left literal on purpose:** `text-white` on the solid red and green confirm
  buttons, the black veil and white words over the proof thumbnail (a photo
  overlay), the PDF iframe's white page, the certificate preview's own
  `#111` ink in the event editor (it draws the printed certificate), and
  Communities' orange-tinted border. The sign-in, register and invite pages
  are not themed (standing decision).
- Verified in light on Events, Registrants (table, detail modal, lightbox),
  Promo codes and its create modal, Team and its role matrix, Activity, the
  event editor, and at 375px on Registrants (no horizontal scroll). An
  automated probe for near-white text or near-black fills came back clean on
  every other page (Overview, the four Settings pages, New Event, Results,
  Clients, Feedback, Communities, Remittances and a settlement). On dark the
  converted classes compute to their old values.
