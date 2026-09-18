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
- **Only the logo reacts so far.** Everything else in the dashboard is painted
  with dark-only literals, so the light setting shows a dark dashboard, and
  **the logo's dark light-theme ink disappears against the dark sidebar**.
  Batch 1 is what makes the switch safe to use.

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

## ☐ Batch 1: Tokens, and making the switch safe

- [ ] Define the dashboard palette as variables (surface, raised surface, panel,
      hairline, hover, text primary, secondary and muted, scrim) with dark
      values in `:root` and light values under `[data-theme="light"]`.
- [ ] Define `--bg-dark`, which fixes finding 9.
- [ ] Change the `@theme` colours to `@theme inline` so they point at the
      variables (finding 2).
- [ ] Tokenise `Admin.css` (finding 5): the frame, the sidebar, the header,
      dropdowns, modals, `.btn-filter`, `.btn-light` and `.btn-secondary`.
      Merge the duplicate dropdown rules (finding 10).
- [ ] Add light-theme status colours (finding 6).
- [ ] Make `color-scheme` and the SVG icons follow the theme (finding 7).
- [ ] Verify the frame, the menu and one table page in both themes, at 375px
      and at desktop width.

## ☐ Batch 2: Shared primitives and modals

- [ ] Tokenise `AdminSelect`, `AdminDataTable`, `AdminCardList`,
      `AdminTablePager`, `FiltersMenu`, `FilterOptions`, `MobileSortMenu`,
      `RowActionsMenu` and the `bg-[#111]` / `bg-[#050505]` surfaces (finding 4).
- [ ] Tokenise `NotificationBell`, `NotificationsCenter`, `AlertModal`,
      `Toast`, and the shimmer and runner tokens (finding 8).

## ☐ Batch 3: Pages, heaviest first

- [ ] `RegistrantsTable` and `ProofLightbox`.
- [ ] `PromoCodesClient` and the event create and edit forms.
- [ ] Team, Clients, Activity, Feedback, Remittances, Results, Communities,
      Settings, and the Viewer dashboard.
- [ ] Sweep for any `text-white`, `white/…` or `black/…` class left over
      (finding 3). The only ones allowed to remain are text on a coloured fill,
      such as the orange avatar or a solid button.
