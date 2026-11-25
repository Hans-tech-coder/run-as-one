<!-- Part of the Run As One project guide. This file is §9, the conventions; the index is PROJECT_GUIDE.md at the repo root.
     Section references like "§5" point to the other parts listed in the guide's routing table. -->

## 9. Conventions

- **Server Components by default**; `'use client'` only where interaction needs
  it. Pages fetch with Prisma directly and client islands take props.
- **A public page that reads the database renders per request.** Next.js
  prerenders a page with no dynamic segment at build time and then never
  rebuilds it, which freezes both the data *and* the clock: `/` and `/events`
  went on badging a race **Paused** after its organizer had scheduled it, and a
  build-time `new Date()` would also keep a finished race in the grid and count
  down to an opening that had already come. So `/`, `/events` and `/results`
  each export `dynamic = 'force-dynamic'`, with the reasoning written out in
  `src/app/s/[site]/(home)/page.tsx`. The `[slug]` pages under `/events` and `/results` are
  already server-rendered on demand because they take a dynamic segment and
  have no `generateStaticParams` — that is why the event page was right while
  the listing in front of it was wrong — but **any new public page that queries
  Prisma and has no dynamic segment must opt in explicitly**; check the build's
  route table for a `○` on a page that should be live.
- Imports use the `@/` alias for `src/`.
- **A rule a client component imports lives in a module with no server-only
  import.** When the browser needs part of a module that also reads Prisma or
  holds the signing secret, the client-safe part is split into its own file
  rather than the whole module reaching the bundle: `discount.ts` (the rule)
  beside `promo-store.ts` (the queries), `running-community.ts` beside
  `running-community-store.ts`, `price-lock-window.ts` (the 45 + 10 minutes)
  beside `price-lock.ts` (which imports `SECRET_KEY`), and `price-changed.ts`,
  whose 409 shape both checkout routes build and both wizards read. The split
  file's header says why it is apart; when constants move out, the server
  module re-exports them so its callers do not change (`price-lock.ts`).
- Registrant text is stored **UPPERCASE**, email excepted (§5, `text-case.ts`).
  A field whose value is stored uppercase shows an uppercase *sample*
  placeholder; a placeholder that is an instruction stays sentence case.
- **Title Case on UI chrome, Sentence case on prose** (owner, 2026-11-23; §8
  rule 13, overriding `design-taste-frontend`'s sentence-case rule). Every
  navigation link (including *Track Registration* in the public header), page
  and section heading (`h1`–`h4`), short eyebrow/kicker subheading, modal and
  alert title, button, standalone action link, `BusyLabel` gerund, form `<label>`
  / `<legend>`, choice-card title, switch title, table header, filter heading /
  short option, metric title and status badge/chip wears Title Case across both
  Paper and `/admin` — principal words, phrasal-verb particles (*Look Up*, *Sign
  In*, *Pick Up*) and both halves of hyphenated compounds (*Sign-Ups*, *Add-Ons*,
  *E-Certificate*, *Two-Step*, *On-Site*) capitalized; short articles,
  coordinating conjunctions and short prepositions lowercase unless first, last
  or after `:`, `—`, `/`, `·`. Supporting prose — `.site-lead`,
  `.site-section__sub`, `.auth-subtitle`, panel/empty-state descriptions, form
  hints, instructional placeholders, `FieldError` messages, alert/toast body
  sentences and full-sentence consent checkboxes — stays Sentence case.
- **An email address is checked on both sides of the wire** (§5,
  `email-address.ts`) and stored trimmed. `type="email"` on the input is not a
  check — a browser only enforces it on a form submit, and the wizards advance
  through click handlers — and an address that is not one is not a cosmetic
  fault: it is a runner who never hears from us again.
- **Every CSV cell goes through `csvField` or `csvPhone`**
  (`admin/events/[id]/registrants/registrant-csv.ts`) — the staff registrants,
  unpaid checkouts and client runner exports all do. Beyond RFC 4180 quoting,
  `csvField` prefixes a `'` to any value opening with `=`, `+`, `-`, `@`, tab
  or CR, because runner-typed text is only trimmed and uppercased and a
  spreadsheet would otherwise run it as a formula (a lone `-` passes bare).
  Never build a CSV cell by hand.
- Money is centavos everywhere (§5). Dates are `YYYY-MM-DD` strings against a
  Manila "today". Phones are E.164.
- A finishing time is never shown with tenths — every display runs through
  `toWholeSeconds` (§5, `race-time.ts`), including the e-certificate.
- **Every image upload goes through `compressImage`** (§5 `image-compress.ts`)
  with the preset for its purpose — `proof`, `photo` or `graphic` — at the
  point the picked `File` is read, before anything is sent. A field that
  uploads at once compresses inside its existing *Uploading* state; a field
  that holds the file (a preview, a size check on the spot) uses
  `useImageCompression`, shows *Optimizing image* (`BusyLabel`) while it
  runs, checks size **after** compressing so a 6 MB camera photo is judged by
  what will be sent, and holds its form's submit until it is done. Only
  certificate templates skip it.
- **A runner's name is untrusted length.** Anywhere a name shares a row with
  something else, that something else gets `shrink-0` and the name's column gets
  `min-w-0` — otherwise the name holds the column open and mangles what is beside
  it. In a list the name then truncates; on the runner's own result card it is the
  headline, so instead its size steps down by name length (`nameScale` in
  `results/[slug]/[bib]/page.tsx`) and the block is capped at about two lines with
  `text-balance`. Never fix a long name by hard-coding a line break.
- **A text field a runner types into is 16px on a phone** (`text-base sm:text-sm`).
  iOS Safari zooms the whole page into any field set smaller than that the
  moment it is focused, and leaves it zoomed afterwards. The leaderboard's
  search is the worked example.
- A pill or badge never wraps inside itself: chips sit in a `flex flex-wrap` row
  and each carries `whitespace-nowrap`. A chip holding organizer-typed text (a
  category name) also truncates, and the full text is shown elsewhere on the page.
- **A clipping panel that holds form fields is `overflow-clip`, not
  `overflow-hidden`.** The glass panels carry decorative glows that overhang
  their edge, and an `overflow: hidden` box is still a scroll container:
  `scrollIntoView` and `focus()` scroll it to reach a field, sliding the
  content sideways under the clip with no scrollbar to undo it. The wizard's
  form panel did exactly that after "Take me there" and carried the shift into
  every later step. `overflow: clip` clips and rounds the same way but cannot
  be scrolled.
- String columns instead of Postgres enums (`status`, `role`, `paymentMethod`,
  `logisticsMethod`, `deliveryZone`, `eventType`, `registrationForm`) — which is
  exactly why each has an `asX()` guard in `lib/` that the API must call on
  untrusted input. **Every one of them is stored UPPERCASE**, and the guards
  accept either casing so rows written before that rule still read correctly.
  PayMongo is the one consumer that needs lowercase, and
  `paymongoPaymentType()` is the only place that converts.
- **One step progress bar.** Every multi-step form — the organizer
  application (`/admin/register`) and both runner registration wizards — draws
  its progress with `components/ui/StepRail` (styles in `StepRail.css`):
  numbered dots joined by a line that fills orange as steps are finished, a
  check on each finished step, and a short label under each dot from `sm` up.
  It is a progress indicator, not tabs, so the dots are not buttons. A new
  multi-step form uses it rather than drawing its own; the caller only adds
  spacing through `className`.
- **One admin table.** Every table in the dashboard — events, registrants,
  results, marketing, team, activity, clients, communities, feedback,
  remittances and a race's settlement — is `components/ui/table` driven by
  TanStack, wearing the same furniture: an `.admin-toolbar` standing on the
  page (not in a panel) holding the search box, the dark `.btn-filter` chips
  (Filters, View, and a work-queue chip where a screen has one) and the one `.btn-light`
  primary action; a bordered, rounded table with a `No.` column and sortable
  headers (events, registrants and marketing add a select column, because
  something acts on the selection); and the rows-per-page menu and pager
  beneath. **A new table uses `admin/AdminDataTable`** — the `lg`-up box, with
  `loading` placeholder rows, a clickable `rowProps` and a `renderSubRow` —
  plus its `AdminColumnsMenu` (View) and `rowPosition`; the first five screens
  above still draw the same markup inline. Never hand-roll a `<table>`, so an
  organizer reads a promotion the way they read a registrant; the Dashboard's
  five recent registrations are the one `.data-table` left. A row that opens
  (voucher batches, a feedback message) is a second `TableRow` under the first,
  not a column of its own. A cell that reads screen state which changes while
  it is typed in or toggled (the club rename box, the open message) gets it
  from the table's **`meta`**, not from a column list rebuilt on that state: a
  new cell function remounts the cell and takes the cursor out of the box. The
  data a screen filters before the table is **memoized**, since TanStack goes
  back to page one whenever the data changes identity. Where the `No.` cell is
  a **position**, it counts by row **id**, not by object identity: sorting
  rebuilds the rows, so an `indexOf` on them finds nothing and every line
  numbers itself 0 the moment a header is clicked.
- **A row action says what it does.** An icon staff already know from
  elsewhere in the dashboard *and* a short label — opening a record is the eye
  with *View Details* — never a bare chevron or a glyph whose meaning lives only
  in a hover `title`, which a phone does not have. The owner's call after a
  chevron-only Actions column on the Remittances list read as unclear.
- **A list whose every row goes to one place is a link list, not a table**
  (`.overview-list` / `.overview-row` in `Admin.css`, the Overview's queue and
  live races). The **whole row is the link** — at least 64px tall, hover and
  focus ring on the row — so there is no action column to explain; the
  trailing chevron is only the "this opens" cue beside a row whose text already
  names what it is, and it drops on a phone, where the row's two ends stack
  instead of scrolling. A metric tile that opens its explanation is
  `.metric-card.is-link` (a `Link`, border and surface answer the pointer).
  A row with an *action* — anything besides opening — is still a table row with
  a labelled button, per the rule above.
- **Changing who is signed in ends with `router.refresh()`.** The sidebar is
  rendered by the **layout** (`admin/layout.tsx` reads `getSignedInUser()`), and
  the sign-in pages live *under* `/admin`, so they share that layout — rendered
  with no session, giving the fallback "Organizer / Organizer Admin" block and a
  menu without Team or Activity. Next keeps a rendered layout in its client
  router cache and reuses it across a `router.push`, refetching only the page
  inside it, so a sign-in that only pushes lands on correct dashboard numbers
  under a signed-out sidebar until the person reloads by hand. Every client call
  that changes the session therefore pushes **and then refreshes**:
  `admin/login`, `handleLogout` in `AdminShell` (so the next sign-in
  cannot inherit the departing person's name), and `InviteAcceptClient`, which
  already did it.
- **One responsive dashboard.** The dashboard stands in
  `admin/DashboardShell.tsx`; `AdminShell` hands it only its links and its role
  line (the super admin's `SuperAdminShell` and the organizer switcher were
  removed in `ADMIN_MERGE_PLAN.md` Batch 2). The
  breakpoints are the **public site's Tailwind scale and nothing else**. In
  CSS they are written as range queries, `(width < 40rem)` / `48rem` / `64rem`;
  in TSX they are `sm:` / `md:` / `lg:` and their `max-` forms. Never a
  one-off number.
  - **The menu** is full-width rows under a MENU label: **the pages and
    nothing else**. The person, Settings and Log Out left the sidebar at the
    owner's request and live in the header beside the bell
    (`admin/AccountMenu.tsx`, see "The dashboard" in §6). The page on screen
    is a tinted band with a 4px bar on its right edge.
  - **The rows are grouped, and a row stays lit for everything under it**
    (`DASHBOARD_SHELL_PLAN.md`, Batch 1). `AdminShell` hands the shell
    `DashboardNavGroup[]` — Dashboard alone, then **Races**, **Platform**,
    **Organization** — and the shell drops a group nobody's role fills. A
    hairline always divides the groups; **the headings' words appear only when
    two or more labelled groups survive the role filter**, so a validator's two
    rows and a client viewer's one are not labelled at all. Active state is
    `isActivePath()`: exact for `/admin`, prefix for the rest, so every screen
    inside an event keeps Events lit. **Never compare the pathname to a row's
    path with `===`** — that is what left the seven deepest pages in the
    dashboard with no row lit.
  - **A footer holds *View public site***, and the mark at the top is a link
    back to `/admin`. A **skip link** to `#dash-main` is the first focusable
    thing on every dashboard page.
  - **Quick jump is ⌘K / Ctrl+K** (`admin/DashboardQuickJump.tsx`) over the
    menu and the settings pages, plus a discoverable row in the sidebar — a
    shortcut nobody is told about is not a feature. It is an ARIA combobox on
    the app's own `.t-modal`, not a new dialog. Destinations outside the menu
    reach it through the shell's `quickJumpExtras`.
  - **It reaches races by name too**, from two characters up, through
    `GET /api/admin/search` (§6, Batch 2). Three rules keep a networked
    palette from feeling like one, and any other search-as-you-type screen
    should copy them:
    - **The instant answer renders first and is never displaced.** The rows
      already in the browser are drawn from the first keystroke and stay put
      while the request is in flight; fetched rows **append** under their own
      heading. An answer arriving between a keystroke and Enter therefore
      cannot move the row the cursor is already on.
    - **A failed fetch has no error state.** It records an empty result and
      says nothing — the menu's own rows are on screen and still work, and a
      banner over them would take away the one thing the palette can always
      do.
    - **The query's state is derived, not stored.** `searching` is
      "the last answer's needle ≠ the field's", and the previous rows stand
      only while the word they answered is being extended or backspaced. That
      is what stops a cleared box followed by a new word from showing the old
      race for a beat — and it keeps `setState` out of an effect body, which
      the React compiler's lint rule refuses anyway.
  - **From `md` up the menu collapses to an 80px icon rail** from the round
    chevron on its edge. Icons never move. Labels
    fade but stay each row's accessible name, and a tooltip (transitions.dev's
    17) names the row on hover and focus. **That tooltip is one `fixed`
    element drawn by the shell** and placed from the hovered row's rect: a copy
    per row needed `overflow: visible` on the menu to escape the rail, which
    took its scrollbar with it and put the last rows out of reach on a short or
    zoomed viewport. It is driven by **one delegated handler** on the menu, not
    handlers per row — per-row `mouseleave` fires before the next row's
    `mouseenter`, which tore the tooltip down between every pair of icons and
    made the rail flicker. **It renders after `<main>`**, and the rules that
    narrow the page to the rail use `~`, not `+`: a `fixed` element between the
    sidebar and the page once broke
    `.admin-sidebar.is-collapsed + .admin-main` on every hover, and the whole
    screen jumped 200px and back. The collapse choice is kept in the `dash_sidebar` cookie
    (`admin/dashboard-sidebar.ts`), which both layouts read, so the first
    paint is already the right width.
  - **Below `md` it is the same menu, smaller.** This is the owner's decision:
    a phone gets no top bar or drawer of its own. The menu rests as a 56px
    rail, and the same chevron opens it *over* the page at 256px, because
    pushing a phone's content aside would leave a sliver. On a phone, open is
    a moment rather than a preference:
    - the cookie is not read;
    - the open state remembers its pathname, so any route change folds it;
    - the body does not scroll and `<main>` is `inert`;
    - Esc or a tap on the backdrop folds it and returns focus to the chevron;
    - there are no tooltips;
    - the resting rail keeps the desktop sidebar's z-index 50, so a page's
      own z-50 modal covers it. Only the opened menu rises to 70.
  - **Below `lg`** the header grows to a 2-line clamped title, the content
    padding steps down, and the toolbar's search takes its own row. Every data
    table becomes **`admin/AdminCardList`**.
  - **Both layouts render and CSS picks one**, through `.dash-desktop-only` /
    `.dash-mobile-only` in `Admin.css`. That is the only place the switch is
    decided; a `matchMedia` hook would render the wrong layout on the server.
    One exception, also in `Admin.css`: the Unpaid checkouts tab
    (`.unpaid-list`) switches on its own width with a container query, below
    60rem of list, because beside the sidebar a 1024px window leaves its
    ~950px table about 660px.
    A TanStack screen passes `table.getRowModel().rows` to the cards, so
    search, filters, sort, selection and pager are shared. Nothing in a card
    carries an `id`, and per-row open state lives in the parent.
  - The card list is data-agnostic (`title`, `subtitle`, `badges`, `fields`
    with `full`, `actions`, `selection`, `leading`, `expanded`, `empty`),
    a server page can render it directly, and it is an auto-fill grid of
    `minmax(min(100%, 20rem), 1fr)`.
  - **An edit a table does in its cell is `admin/AdminCardEdit` on a card**
    (the communities screen's club rename). It sits in the `expanded`
    slot under the value it changes, as a labelled full-width 16px box, with
    Save and Cancel at 44px underneath; Enter saves and Escape cancels. It
    holds no state: the page's `editingId` and draft feed the cell and the
    card alike. A form sitting in a toolbar (Add a club) is `.toolbar-form`,
    which stacks the box and its button at full width below `sm`. An approve
    chip is `.btn-filter.is-success`, green on hover only, beside
    `.is-danger` / `.is-pending` / `.is-primary`. Those classes exist because
    Tailwind colour utilities lose to the unlayered `.btn-filter`.
  - A filter chip's menu is **`.toolbar-popover`**: anchored from `sm` up, a
    bottom sheet with 44px options below it. A modal is
    **`.admin-modal-panel`** with `.admin-modal-body` and
    `.admin-modal-footer`: capped at the viewport in `dvh`, the body scrolls,
    and the footer is sticky and full width on a phone. The panel is
    `overflow: clip`, so a footer's own background cannot paint square
    corners past its rounded edge. Both are defined in `Admin.css`, and every
    dashboard dialog wears them, the event forms' success and failure dialogs
    included. A modal whose fields change with a choice (the promo form's
    *Discount type* and *How runners get it*) uses
    **`admin/SmoothModalBody`** in place of the bare body `div`: it measures
    its content and eases the height (`.t-resize`, transitions-dev card
    resize), and it holds the panel's top where it opened (centred) so only
    the bottom edge moves — rising only if the bottom would leave the screen.
    It keeps `scrollbar-gutter: stable` and still scrolls past the cap.
  - **"Confirm it's you" before a dangerous action is `admin/StepUpDialog`**
    (`lib/step-up.ts`), never a page-local password box. Mount it with the
    action and target id; it shows only the proofs that account has (code,
    or password with Confirm with Google beside it) and hands back a token
    through `onConfirmed`, which the caller sends with the action. Keep the
    token for a retry after a 400 / 409 (a refused action leaves it unspent)
    and drop it after a 200 or a 403, reopening the dialog on a 403
    (`PaymentCorrectionModal.tsx` is the first caller).
  - **Every TanStack table's pager is `admin/AdminTablePager`.** It holds the
    rows-per-page menu, the range and First / Previous / Next / Last. Below
    `sm` it shows only the range and 44px Previous / Next. It counts with
    `table.getRowCount()`, so a **server-paged** table (the activity trail:
    `manualPagination`, `rowCount`, and `onPaginationChange` pushing the URL)
    wears the same pager, and pass `pageSizes` to change the menu.
  - **Below `lg` a table's toolbar gains `admin/MobileSortMenu`**, a Sort chip
    listing every column that can sort, each ascending or descending, with
    the active sort named on the chip. Cards have no headers to click.
    - The View (column visibility) chip is `.dash-desktop-only`, because cards
      have no columns.
    - A card list standing on the page, rather than inside a panel, passes
      `className="is-flush"`.
    - A route's wait draws the list's shape through
      `route-loading-shape.ts` (below).
  - **A row's portalled menu is placed by `admin/row-menu-position.ts`**
    (`placeRowMenu`). It is clamped inside the viewport's sides, and flips
    above a trigger that has no room below, measured once the menu has
    rendered. A card's menu trigger is 44px.
  - **A card's footer is a shortcut on the left and ⋯ on the right.**
    - The shortcut is the row's most-used action, as a quiet 44px
      `.btn-filter`: Registrants on an event card, Edit Access on a team
      member card.
    - It stays inside the ⋯ menu too, so the menu matches the table's.
    - This was the owner's choice. A footer holding only ⋯ read as empty
      space, and a label such as "Actions" beside it would look like a button
      without being one.
  - **Hover-only information becomes visible text on touch.** Examples: a
    team row's "why you cannot manage this", and a role's hint on the matrix
    header. The card or picker says it in words. Nothing a label shows is
    dropped.
  - A panel's inset is 16px below `sm`. A modal's close button is 44px with a
    -12px margin, so its icon does not move.
  - A page header has no back arrow: its breadcrumb trail (`DashboardHeader`'s
    `crumbs`) is the way back, each link a 44px target by padding and negative
    margin.
  - **A bulk action below `lg` is a bottom bar, not a toolbar chip.** The
    registrants list's `.bulk-bar` ("N selected · Export · Delete · Clear")
    is fixed to the viewport and lined up with the content column, with a
    `.bulk-bar-spacer` at the end of the list so the pager scrolls clear of
    it, and rises on `.t-toast`. It is fixed rather than sticky because it
    floats over whichever card is at the foot of the screen, wherever the
    list is scrolled to. From `lg` up the red chip in the toolbar does the
    job. A card list with a bulk action passes `selectAll` to
    `AdminCardList`, reading the table's page selection. A bar with no
    export (the race results) adds **`.is-no-export`**: one row from `sm` up,
    and on a phone the count and Clear over a full-width Delete.
  - **A `.btn-filter` chip's tone is a class, never a Tailwind colour.**
    `Admin.css` is unlayered, so `.btn-filter` beats `text-orange-400` and
    friends: the registrants queue chips and Delete Selected drew grey for as
    long as they carried those utilities. Use `.is-pending` (amber),
    `.is-danger` (red) or `.is-primary` (blue).
  - A modal a person reads rather than answers (the registrant's details)
    adds `.admin-modal-sheet` to `.admin-modal-panel`: below `sm` it is the
    whole screen with its footer at the bottom edge, and its overlay drops
    its padding with `max-sm:p-0`.
  - **A long form keeps Save in reach below `sm`.** `.admin-form >
    .form-actions` (the create and edit event forms) sticks to the foot of
    the screen, edge to edge on a blurred ground; Cancel keeps its own width
    and Save takes the rest. It can stick because `<body>` **clips** its
    `overflow-x` (`globals.css`). It used to hide it, which made `<body>` a
    scroll container that never scrolls, so no sticky box anywhere in the app
    stuck — the desktop `.admin-header` and the event page's and wizard's
    summary sidebars stick now too. Never put `overflow-x: hidden` back on
    `html` or `body`.
  - **Forms on a touch screen.** A `.form-grid` cell may shrink
    (`min-width: 0`), so a native time input cannot hold a column open (the
    dashboard has no native date input left; see `AdminDatePicker` below). Below `lg` a row's remove button, the add link and a checkbox's
    label row are 44px, and an uploaded image's Remove is a bar under the
    image instead of a hover overlay. Below `sm` the drop zone tightens and a
    settings button spans the width. A money box carries
    `inputMode="decimal"`, a count `inputMode="numeric"`; radio cards stack
    below `md` and step their inset down below `sm`.
  - **A picker's list stays on screen.** `AdminSelect` measures when it
    opens: below its trigger when the list fits, above it when there is more
    room there, and never taller than the room it opens into.
  - **A long picker answers to typing.** `AdminSelect` has a native select's
    type-ahead: letters typed within half a second build one query and the
    first option starting with it is highlighted (and the list opened), so
    the 85-province *Event Province* list reaches Tarlac with "ta".
  - **A wait is the page's shape, at both widths.** `admin/loading.tsx` and
    `admin/events/loading.tsx` read the URL and hand `AdminRouteLoading` a
    shape (the Overview's tile count also reads `dashboard-nav.tsx`, since
    `platform:manage` adds a fourth) from `admin/route-loading-shape.ts`.
    Below `lg` that is metric tiles, the toolbar's wrapped rows and a card
    list in its frame, or form panels field by field — and on the Overview,
    `linkPanels` between the tiles and the list: the queue as its one-line
    quiet bar, then live-race rows at their measured height. The same entry's `lg`
    block is the desktop: the toolbar in the one row it unwraps into, and the
    **table** the cards stand in for — its header band and its rows at that
    screen's own row height — or a panel's rows in a real `.form-grid`, where
    a `split` row is the pair of fields the form puts side by side. Both are
    rendered and `.dash-mobile-only` / `.dash-desktop-only` pick, the same
    switch the real pages use. Every number is measured on the real page (the
    phone at 390px, `lg` at 1680px). **A page that gains a toolbar row, a
    metric, a field or a column updates its entry in the same edit.** A route
    with no entry at all — a 404, anything unlisted — is still the centred
    dots, which promise nothing about what is coming. A client page that
    fetches its own list (clients, communities, feedback) passes `loading` to
    `AdminDataTable` for placeholder rows and shows `AdminCardListSkeleton`
    (`is-flush`) in place of its cards while it waits.
  - **A column only some events fill starts hidden where nothing fills it.**
    The registrants table's *Add-ons* (`ADD_ONS_PLAN.md` Batch 4) is hidden
    by default on a race where no row has one (`initialColumnVisibility` in
    `registrant-columns.tsx`) and stays in the View chip; its card field and
    its filter group appear only on a row or race that has one. A race that
    never used the feature keeps the table, cards and sheet it had, and the
    table's columns still fit beside the sidebar.
  - **A table filters through one `admin/FiltersMenu` chip, at every width**
    (events, registrants, results, clients, feedback, remittances, activity).
    It takes `groups` — a heading, `FilterOptions` checkboxes (a `hint` for
    small print), the selected values and a toggle — plus `onClear` and an
    optional `empty` sentence for a sheet whose lists come from rows not yet
    there. Several values in a group widen it; groups narrow each other; the
    chip counts every checked value and the sheet ends in *Clear filters*. The
    screen owns the selections and filters its data before the table (a
    server-paged screen pushes them to the URL instead). **Never a row of
    one-chip-per-value toggles or a menu per column** — the owner's call, so
    every screen filters the same way; `FilterChip` was deleted with the last
    of those. The one exception is a **work queue** (registrants' *Needs
    Validation*, *Unsent Email*): what still needs doing, not what a row is.
    Since 2026-11-25 (the owner) a screen's queues are **one *Needs
    Attention* chip** beside Filters (`registrants/NeedsAttentionMenu.tsx`),
    never a chip each: closed it shows the total waiting in the most urgent
    queue's colour (red for a failure, amber for a wait), open it lists each
    queue with its count and a line on what it collects; one queue at a time,
    named on the chip with its own ✕. A new queue is a row in its `queues`,
    so the toolbar does not grow. Occasional actions go in a ***More*** chip
    (`registrants/ToolbarMoreMenu.tsx`, icon + label, items with a note), so
    the toolbar keeps one filled button. The public
    `/results/[slug]/full` keeps its own Category / Gender menus.
  - **A single-event screen's miss is `AdminNotFound`**, worded from
    `admin/events/event-not-found.ts`, identical for a missing event and one
    the person may not open (§7).
  - **The sign-in pages** (`Auth.css`: login, register, the invitation). Below
    `sm` the card keeps a 16px margin and a 24px inset, its title steps down
    and the glows fit the screen. The card is centred by auto margins, so with
    a phone's keyboard open it starts at the top instead of pushing its head
    out of reach. The container clips rather than hides and is `dvh` tall, the
    card lifts on hover only where there is a real pointer, and the glows stop
    under reduced motion. **They are not dashboard screens**, and two places
    have to agree on that: `admin/bare-paths.ts` lists them, `AdminShell` draws
    them without the sidebar, and `admin/loading.tsx` answers them with
    `AuthRouteLoading` — the running figure centred in the page's own
    `.auth-container` — instead of the dashboard frame, whose header skeleton
    bar over a sign-in page was a placeholder for furniture that never
    arrived. A new page that lives under `/admin` without the sidebar goes in
    that list. **Both sign-in pages carry a way back to the public site**
    (`admin/AuthHomeLink.tsx`): a *Back to Run As One* link above the card,
    and the lockup at the head of the card wrapped in a link to `/` the way
    the public navbar wraps it. They have no navbar and no sidebar by design,
    which left them dead ends for anyone who arrived from a stale bookmark or
    only wanted to look at an event — and a page opened from a link has no
    Back button to press. The pill sits **in the flow**, inside a new
    `.auth-shell` column that now carries the width and the auto margins the
    card used to: pinned to the corner of the viewport it would slide under
    the card on a short screen, which is exactly the case the auto margins
    exist for. It is **bare text and an arrow — no fill, no border**: drawn as
    a glass pill it read as a third button on a page whose whole job is to get
    one button pressed, and it pulled the eye before Sign In did. It is still
    a 44px target (padding, not a background, and a negative left margin pulls
    the arrow flush with the card's edge — the same trick the header's
    breadcrumb links use), and it names the site rather than saying "Home", which on a page
    headed *Admin Portal* would be ambiguous. The invitation page keeps `.auth-card` on its own and is
    unchanged — it is a one-time destination from an email and already offers
    *Go to Sign In*.
  - **Checking a screen.** A dashboard change is not done until:
    - nothing scrolls sideways at 360, 390, 767 and 820, measured with the
      script below at rest *and* with the screen's menus and dialogs open;
    - 1280 and 1440 look as they did, on every screen using what changed;
    - a data table is cards below `lg`, from `AdminCardList`;
    - targets are 44×44 with 8px between them, and a typed-into field is
      16px below `sm`;
    - a dialog fits in `dvh` with its primary button reachable, and a menu
      stays inside a 360px screen;
    - untrusted text wraps (`min-w-0`, `overflow-wrap: anywhere`) and only
      chips are `nowrap`;
    - motion keeps its reduced-motion guard, and lint and `npx tsc --noEmit`
      are clean for the touched files.

    It must return `ok: true` with an empty list. A resting rail stays inside
    the screen; an opened menu, popover or dialog is checked while open.

    ```js
    (() => {
      const w = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll('body *')]
        .filter(el => { const r = el.getBoundingClientRect(); return r.width && r.right > w + 1; })
        .slice(0, 10)
        .map(el => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`);
      return { ok: document.documentElement.scrollWidth <= w, offenders };
    })()
    ```
- **A list's order is a fact about the rows, not about the view — and a number
  in it should name the thing, not its seat.** Every listing gets an explicit
  `orderBy`; without one Postgres is free to return rows in heap order, which
  every `UPDATE` reshuffles, so a screen quietly reorders itself as somebody
  works it. Sort by what the rows *are* (registration order, newest message
  first) and hold it: a row must never move because of an action just taken on
  it, or the person loses their place and the sight of the change landing where
  they clicked. Work queues are therefore **filters**, not sorts — the
  registrants screen's *Needs Validation* and *Unsent Email* queues, the feedback
  screen's triage filter. And when the number in the `No.` column is worth
  quoting outside the screen, assign it on the server from that order and carry
  it on the row (registrants' `regNo`) instead of using the row's position,
  which renumbers the moment anything is filtered.
  A cell that has something to add to a badge uses **`.status-note`** (Admin.css)
  — a small line under it in the badge tones' own colours, as the marketing
  table's *Ends in 3 days* does — never a second `.status-badge`, because two
  pills in one cell read as two states when there is only one.
  A fact about a person rather than a state — *You*, *Two-step on* — is a quiet
  grey pill beside the name (`admin/TwoStepChip` for the latter, used on the
  Team page and in a client's Sign-ins), never a coloured badge.
- **One public event card.** `components/EventGrid` renders every public event
  listing — `/`, `/events`, `/results` — so an event looks like itself wherever
  it appears. It differs only by its `action` prop (`'register'` → the event
  page, `'results'` → the winners board), a string rather than a callback
  because the pages rendering it are Server Components. Never fork a rival card.
  **Its shape (Paper, `.site-card`):** the poster **whole** on top in a 12:5
  frame (`object-fit: contain` — organizers' banners run 2:1 to 2.8:1, some
  posters are square or portrait, and they carry their own title, so nothing
  is printed over them) inside the shared **poster frame** below,
  then the day with its weekday (`formatEventWeekdayShort`), the title, the
  venue, the race's **distance chips** (`distances`, the category names read
  before `forListing` drops the categories; a Bib + Medal variant is not a
  distance; four shown, then *+N more*) and a foot with the status in words
  and the action link, which stretches over the whole card and is named with
  the race (*Register: Pink Run 2026*). The grid (`.site-grid`) goes four
  across from `lg` whenever three would leave one card alone on the last row,
  and keeps exactly three in one row on a tablet.
- **One poster frame (`components/PosterFrame`, site.css `.poster-frame`).**
  Any public surface that shows an event poster in a frame of **fixed shape**
  uses it — today the `.site-card` poster on every listing (`/`, *Recently
  held*, `/events` upcoming and past, `/results`, and the same pages on client
  subdomains). The poster sits whole on top (`object-fit: contain`); behind it
  the **same image** at `object-fit: cover`, blurred (`filter: blur(20px)`,
  scaled 1.2 so the blur's soft edge falls outside the clip) under a light
  `--site-surface` wash, so no poster shape leaves empty bands. The backdrop
  is the poster's own URL, so the browser downloads the file once and paints
  it twice; it is decorative (`alt=""`, `aria-hidden`), never preloaded, CSS
  only (no canvas, no JS) and never animated — the hover zoom moves only the
  sharp poster. If the poster fails, the backdrop goes with it and
  `EventImage`'s placeholder stands alone. **Posters load lazily by default**
  (`loading` on `EventImage` and `PosterFrame`, applied to both layers alike —
  they share one URL, so an eager backdrop under a lazy poster would fetch it
  early anyway). Only a poster on the first screen is eager: the first row of
  `/events` and `/results` (`EventGrid`'s `eagerCount={4}`), the wizard
  header, and the home "Next race" hero, which also gets
  `fetchPriority="high"` as the page's main image. The surface's own class sets the
  ratio and corners (`className`). **A new poster surface with a fixed frame
  must use it**, never a bare `object-fit: contain` on a tint. Posters shown
  at their natural height (the home hero's *Next race*, the event page) have
  no bands and do not need it.
- **One option row at sign-up.** `events/[slug]/register/CategoryPicker` renders
  a race's distances and a fun run's packages with the *same* full-width radio
  row — poster thumbnail, name, price on a shared right edge — because to the
  runner it is one decision either way. A race's distance is a chip beside the
  name; that chip is the only difference. Do not bring back a separate grid.
  The row is a CSS grid with two arrangements: from `sm` up it is one line
  (radio, name, chips, price, tick); on a phone it is two fixed lines — name
  with the radio at its right, then chips with the price on the right edge —
  so every card is the same height instead of wrapping wherever the text runs
  out. On a phone the poster thumbnail (with its expand badge) is the way into
  the inclusions and the "View inclusions" link is hidden; an option with
  inclusions but no poster keeps the link on every screen.
- **Stopping something is a pause, not a deletion.** An organizer switching a
  promotion off gets Pause / Resume, the same word and the same reversible
  gesture as the events table's registration hold. Deleting is for a mistake;
  pausing is for a decision, and a code printed on a poster does not stop
  existing because its row did.
- **A discount is never a surprise at the end.** An automatic promotion is named on the event page, priced into the order summary from the first render of step 1, and — for a group deal — offered as a free slot with a FREE badge on the runner it belongs to. **A group deal also states where it ends**: one registration covers one group, so step 1 stops at `buy + get` runners with the reason beside the disabled button rather than letting a group of ten fill in four cards the promotion was never going to pay for. A promotion the runner only meets on the payment step cannot do the thing it was created to do.
- **One form field on the public side, and it lives in `globals.css`.** `.input-group` — a label, a control, and whatever small print goes under it — was written for the registration wizard and lived in `RegistrationWizard.css` until the feedback form needed the same controls. The choice then was a second copy of those declarations or one definition both surfaces read, and a runner should not meet two different text boxes on one site, so it moved. The wizard's own layout (`.form-grid`, `.logistics-options`, the step furniture) stayed behind; only the field itself moved. **It sets no `font-size` on purpose** — the control inherits the body's 16px, which is exactly what the iOS zoom rule below wants — and its invalid state is driven off `aria-invalid` rather than a class, so the colour a person sees and the state a screen reader announces cannot drift apart.
- **A phone number is `PhoneField`, in the admin too** (`events/[slug]/register/PhoneField`): a country picker, digits only, capped at the country's length, stored E.164 — already on the delivery switch and Site & Branding, and since 2026-11-25 on the staff registration form and Edit Registrant (Phone and Contact Phone), where a legacy `09…` number opens read as Philippine. Inside `.admin-layout` it is dressed as a `.form-input` by Admin.css (*The phone box in the dashboard*: field colours, line, focus ring, invalid state, 58px height, the country list as an AdminSelect panel, in both themes); the sign-in pages and the inquiry keep their own. Never a free-text box that takes letters. An **email** field is checked with `emailAddressError` as staff leave it, not only on save.
- **A running club is typed, with suggestions — never a plain text box or a select.** The list is long and open (a club not on it yet must still be usable), so the wizard has `events/[slug]/register/CommunityPicker` and the admin has **`admin/AdminCommunityField`** (2026-11-25, the staff registration form): approved clubs from `approvedCommunityNames()` suggested, prefix matches first, the list's spelling taken on blur, a write-in via *Add "…"* that the save sends to the Communities review queue. The registrants' Edit Registrant modal uses it too (the page passes `approvedCommunityNames()` to `RegistrantsTable` for `registration:edit` holders), and `PUT /api/admin/runners/[id]` files a changed club's write-in for review, as checkout does.
- **A closed list of answers is never a native `<select>`.** The wizard has
  `events/[slug]/register/SelectField`; the admin now has `admin/AdminSelect`,
  the same interaction wearing `.form-label` / `.form-input`. Two components
  rather than one because they live in different design systems. The results
  uploader's seven column-mapping selects moved onto it in Mobile Batch 4, so
  the admin has no native select left. The registrants edit modal's Gender
  field moved in Mobile Batch 3, and its Shirt Size on 2026-11-21: the
  public registration's chart (3XS–5XL with each size's inches), then *No
  shirt* (stored blank), plus any off-chart size an older order holds.
  **An option picks on pointerdown for a mouse and on click for a finger** —
  in AdminSelect, SelectField, Combobox and PhoneField alike. A touch's
  pointerdown is also where a scroll through the list starts, so committing
  there chose whatever row the swipe began on (the Hour / Minute lists could
  not be scrolled on a phone); a scroll cancels the click, a tap does not.
  A new list copies that pair of handlers.
- **A date a runner picks is never a native `<input type="date">`.** The
  runner-facing control is `events/[slug]/register/BirthdatePicker`
  (GUARDIAN_CONSENT_PLAN.md Batch 2), used by both wizards. Its trigger is
  SelectField's field (showing "March 4, 2014" in words, or the sentence-case
  "Select your birthdate"); it opens a calendar whose header is a **Month and a
  Year `SelectField`** (the year list runs from this Manila year back 100, so a
  birthdate is two taps away, not a hundred "previous month" presses), with
  days after `today()` disabled and unfocusable, future months left out of the
  current year's Month list, and a fixed six-week grid so its height never
  jumps. Keyboard is the APG date-picker set: arrows move a day or a week,
  Home/End the week, PageUp/PageDown a month (Shift for a year), Enter picks,
  Esc closes and returns focus to the trigger. From `sm` up it is an anchored
  popover opening with `.t-dropdown`; below `sm` it is a bottom sheet portalled
  to `<body>` (the wizard's panels carry transforms that would trap a fixed
  element) with 44px day cells, a backdrop, a close button and the page scroll
  locked, animated by `.date-sheet` / `.date-sheet-backdrop` in `globals.css` on the
  dropdown's motion tokens. The value in and out stays a `YYYY-MM-DD` string,
  and it takes `id` / `error` exactly like SelectField, so validation and
  `focusField` did not change. Its outside-click listener runs in the **capture
  phase**: a Month or Year option commits and unmounts on its own pointerdown (a mouse's; a finger's commits on click),
  so a bubbling check found the target in no document and closed the calendar
  on every pick. `SelectField` gained `hideLabel` (label kept for screen
  readers only) for that header pair. Any new runner-facing date field uses
  this picker. Its date arithmetic lives in `lib/calendar-day.ts` (§5).
- **A date picked on the dashboard is `admin/AdminDatePicker`, never a native
  `<input type="date">`.** It is BirthdatePicker in the admin's clothes — the
  `.form-label` / `.form-input` trigger showing the day in words with a
  calendar icon, a Month + Year **`AdminSelect`** header (AdminSelect gained
  `hideLabel` for it), the same APG keyboard, six-week grid, `.t-dropdown`
  popover from `sm` up and `.date-sheet` bottom sheet below it with 44px cells
  — on the dashboard tokens, so it follows both themes. A sibling rather than
  one shared component for AdminSelect's reason: two design systems. What it
  adds: **`min` / `max`** in either direction (days outside are disabled and
  unfocusable; with neither, the Year list spans ten years either side of
  today and of the value), **`clearable`** (a Clear button, for a field that
  may be blank) and a **Today** button whenever today is pickable, `hint`,
  `disabled`, `className` for the `.form-group`, and `invalid` /
  `describedBy` for a field whose message is drawn elsewhere (the opening
  picker's one line under date and time), and **`withTime`** — a date **and** a
  time of day in the one calendar (Hour / Minute / AM-PM `AdminSelect`s under
  the grid, a **Done** button), never a second time field beside it. Its value
  is `YYYY-MM-DDTHH:mm` (24-hour, Manila), picking a day keeps the calendar
  open and commits live, a new day takes `defaultTime`, and the placeholder
  becomes "Select a date and time". The promo window's Starts / Ends use it.
  The trigger is named by its label
  **and** its value (`aria-labelledby`). The desktop popover is **portalled to
  `<body>` with `position: fixed`**, placed under the field or flipped above
  it and kept on screen, because a modal's scrolling body would clip it;
  `data-theme` sits on `<html>` while the dashboard is mounted, so the portal
  keeps the theme. **Escape closes only the calendar**: dialogs here listen on
  `document`, where React's `stopPropagation` does not reach, so it also calls
  `nativeEvent.stopImmediatePropagation()` (AdminSelect now does the same for
  its open list). In use on the event date (create and edit), the registration
  opening day, the promo windows, the activity range, a remittance's Sent On,
  the runner edit's birthdate (today back a century) and the organizer
  application's target date. Time inputs are still native `type="time"`.
- **Chrome every dashboard page shares goes through `DashboardShell`, not into each page.** Every page draws its header with `<DashboardHeader title crumbs? actions? />` (`admin/DashboardHeader.tsx`), never a hand-written `<header className="admin-header">`. The page says only what it is; the shell hands the bell and the account menu down through context (`HeaderToolsProvider`), and they sit in the header's own flex row, so nothing is measured and nothing pads itself clear of them. `crumbs` are the ancestors, outermost first — the page itself is the `<h1>`, never repeated in the trail — and a crumb with no `href` (an event, which has no page of its own) is plain text, not a dead link. Something meant for every header is added to `DashboardHeader`, never pasted into twenty-five `page.tsx` files.
- **A row with more than one action has a ⋮ menu, never a row of chips.** The
  Actions cell holds one `.action-dropdown-btn` whose menu lists each action
  as icon + label, destructive ones red below a divider — the events table's
  shape. Icon-only chips named by a hover `title` (the old clients, clubs,
  feedback and remittance rows) are gone. A menu with bespoke states (the
  events menu's pending navigation, the team menu's *Saving*) keeps its own
  `*ActionsMenu`; a plain list of items passes them to
  **`admin/RowActionsMenu`** (`RowAction`: label, icon, `onSelect` or `href`
  for a new-tab file — `sameTab` for a `tel:` / `sms:` / `mailto:` link, which
  a new tab would leave blank — `danger`, `disabled`), which swallows the row's click and
  keys and renders nothing for an empty list. A single action stays a labelled
  chip (*View Details* on the Remittances list; *E-Cert* on the public full
  leaderboard, whose old ⋮ also held *View Details* — what tapping the row
  already did).
- **A row's action menu is portalled to `<body>`.** Every card and table in the
  app clips its own overflow (rounded corners, horizontal scrollers), so a menu
  laid out inside the row is cut off on the last rows. The admin menus
  (`admin/events/EventActionsMenu` and its siblings) all render into
  `document.body` with `position: fixed`, place themselves from the trigger's
  `getBoundingClientRect()`, and reposition on scroll and resize. (The public
  leaderboard's portalled `ActionMenu`, which also flipped above the trigger,
  was replaced 2026-11-24 by a single *E-Cert* button.) Copy that rather than an `absolute top-full` menu. The three admin
  menus share one width — `.action-dropdown-menu` is **210px**, wide enough for
  the longest label plus its icon and the pending dots — and
  `.action-dropdown-item` is `white-space: nowrap`, so an item never wraps onto
  a second line beside one-line neighbours and a label never has to be
  shortened to fit. Every admin row menu is placed by `placeRowMenu`, whose
  `ROW_MENU_WIDTH` repeats that number, so it moves in `Admin.css` and
  `admin/row-menu-position.ts` together.
- **One status badge, four tones** (`Admin.css`): `success` for done, `pending`
  (amber) for a state that is simply waiting and needs nobody, `danger` for
  something that failed and a person must act on — an email that never went out
  — and `neutral` for a fact that is neither, like a sold-out event. Reach for
  one of these rather than a one-off pill.
- **A failure is answered, a success is announced.** `useAlert()` hands out
  three things and they are not interchangeable. `alert` and `confirm` open the
  blocking dialog and are for what a person must read or decide — a validation
  summary, a delete. `toast` raises a small panel at the bottom-right that
  leaves on its own after four seconds, and is for what merely worked: a
  promotion created, paused, resumed or deleted. Do not make an organizer
  dismiss a box to be told a thing they just asked for happened, and do not
  demote a failure to a toast that can time out unread. Toasts stack (dialogs
  queue) and wear the same four variants as the dialog, so a success is the
  same green check in both. Marketing is the screen that uses them; every other
  silent `router.refresh()` in the admin is a candidate. **A change pressed
  from a row menu also gets `progress`**: the menu closes on the press and
  nothing else on screen moves until the server answers, so `progress("Pausing
  sign-ups on …")` raises a toast carrying the `sm` running figure that stays
  until the caller settles it — `done("Sign-ups … paused.")` turns that same
  panel into an ordinary toast that leaves on the usual clock, `clear()` takes
  it away before a failure's dialog. **The rule for which wait gets which:** a
  control that stays on screen shows its own wait with `BusyLabel`, and a
  control that disappears on the press (a row menu item, a confirm dialog's
  button) gets `progress` — never both for the same press, so a modal's action
  toasts only the result. On `progress` today: the events table's Pause / Close /
  Reopen Sign-Ups, the registrants menu's Validate Payment (the modal and
  lightbox doors toast only the result), every pacer row action, promotion
  Pause / Delete, team Resend / Suspend / Reinstate / Remove, client Archive /
  Restore, feedback Reviewed / Delete, and community Approve / Remove
  (Rename and Add show `BusyLabel` and toast the result).
- **A wait is the shape of the answer.** A panel that fetches shows
  `components/ui/Skeleton`'s `SkeletonSwap` — placeholder rows built from
  `SkeletonBar` at the widths the real rows have — and cross-fades them into
  the content in one grid cell, rather than swapping a "Loading…" sentence for
  a list and jumping height. The redemptions panel on `/admin/marketing` is the
  worked example. Bars must be direct children of the skeleton layer or they
  will not pulse.
- **A whole screen waits differently from a panel.** Every dashboard
  page is a database read behind an auth cookie, so a click on the sidebar can
  sit for a second with the page being left still on screen — and an organizer
  who cannot tell a slow page from an ignored click will click again. Two things
  answer that, and both are already wired:
  - `admin/loading.tsx` renders
    `admin/AdminRouteLoading` — the page frame every screen in the dashboard
    shares (an 80px `.admin-header` with a pulsing skeleton bar where the title
    goes, then `.admin-content`) holding that route's shape, or the brand
    loader centred in it when the route has no shape. Next.js
    makes that the Suspense fallback for the segment and everything nested
    under it — **but a fallback shows only when the segment directly under it
    changes**. `admin/loading.tsx` answers a sidebar click (`events` →
    `marketing`), not a click that stays inside a section: the events table →
    Edit / Registrants / Manage Results / New Event keeps `events` as the
    segment under `admin`, so it sat on screen unchanged until the page came.
    That is what `admin/events/loading.tsx` is for. **A new section with pages
    nested under its index needs its own `loading.tsx` rendering
    `AdminRouteLoading`**; a flat one (organizers, communities, feedback today)
    does not. A page that fetches its own data on the client after arriving (the
    edit form) renders `AdminRouteLoading` while it waits too, so the route's
    wait and the fetch's wait are one screen, never a bare "Loading…" line.
  - `components/ui/LinkPending` marks *which* link was clicked, because the
    sidebar's active state comes from `usePathname()` and does not move until
    the navigation commits. It reads `useLinkStatus()` (Next 15.3+, and it only
    works inside a `<Link>`), sits in a slot that is always in the layout so
    appearing costs no layout shift, and fades in after 120ms so a fast
    navigation never flashes it. It rides the sidebar's nav items **and** the
    three destinations in `events/EventActionsMenu`.
- **A row's action menu stays open on the page it opened.** The menu used to
  close the instant an item was clicked, which on a slow destination left the
  events table sitting there unchanged — indistinguishable from a button that
  did nothing. Clicking Registrants, Manage Results or Edit Event now puts the
  menu in `.is-navigating`: the other items dim back and stop taking clicks,
  the chosen one keeps full contrast with `LinkPending`'s dots beside it, and
  an outside click can no longer dismiss it. The page it opened is what
  replaces it. Pause and Delete are unchanged — they act in place and close.
- **The dashboard's page transition is the skeleton reveal, applied to a
  route.** `.admin-content` and `.admin-header-title` fade and un-blur on mount
  over `--skel-reveal-dur` / `--skel-reveal-ease` — the same numbers `.t-skel`
  uses on the marketing panel, so a route swap and a panel swap move alike. The
  two halves cannot share a grid cell the way `.t-skel` does (React unmounts
  the fallback and mounts the page in its place, so they are never on screen
  together), which is why the motion rather than the markup is what carries
  across. It is CSS on those two selectors rather than a wrapper component
  because every page in the dashboard already renders both, and a client
  navigation builds them fresh — which is what makes the animation replay. The
  `.admin-header` bar is deliberately left out: it is identical chrome on both
  sides of the swap, and fading it would flicker the frame the reveal exists to
  hold still. It fills **`backwards` only** — a finished `blur(0)` is still a
  filter, and a filter re-anchors every `position: fixed` modal inside the page
  to `.admin-content`. With `both` it did: the edit form's success dialog was
  centred halfway down a long form, off screen, so saving an event showed a
  dimmed page and a stuck "Saving..." button. Never give an element that holds
  page content a lasting `filter` or `transform`. The fallback's own reveal is
  dropped to `--duration-quick`, because 400ms of fade before the shape appears
  is 400ms still looking like nothing happened.
- **The app waits with a sprinter, and there is only the one loader.** The
  dashboard used to answer with three pulsing dots
  (`components/ui/LoadingDots`, `.t-dots`); the owner asked for them to go, so
  the component, its CSS and its `--dots-*` tokens are gone from the app. A
  wait in the dashboard is now either the page's own shape
  (`AdminRouteLoading`, above) or the same running figure the public site uses.
  **Do not reintroduce a spinner or a dot loader** — a wait whose layout is
  known draws that layout, and one whose layout is not known draws the figure.
- **The figure** is `components/ui/RunnerLoader` (`.t-runner` in
  `globals.css`): an original running figure in brand blue whose arms and legs
  run a real stride (each limb is a thigh or upper-arm group turning at the
  joint with the shin or forearm nested inside it, `transform-box: view-box`,
  the two sides half a `--runner-cycle` apart), with brand-orange speed lines
  streaming off behind. The owner asked for it because a runner who presses
  Register and sees nothing move assumes the button is broken. Three sizes —
  `sm` (1.3em, beside a word or in a cell), `md` (48px), `lg` (72px) filling a
  page, dropping to 40px / 56px at ≤640px because the owner found the old
  64px / 104px figure too big, above all on a phone — and
  `tone="current"` to draw it in the surrounding text colour, which is what the
  dashboard's `LinkPending` uses. Hook-free and pure CSS, so it can render in a
  `loading.tsx` without dragging it across the client boundary. A new wait on
  the public side should be one of these four:
  - **A page on its way** — five `loading.tsx` files render
    `components/PublicRouteLoading`, a **loading screen**: the `lg` figure with
    a shimmering caption (transitions.dev's shimmer-text, `.t-shimmer`) on a
    **viewport-fixed stage** under the navbar, on the page's own ground with a
    soft pool of blue. It is fixed, not in the page flow, because in-flow it
    broke on exactly the tap that matters most: Register Now pressed from low
    on a long event page swapped a 3,000px page for a short one, the browser
    clamped the scroll, and the figure landed above the top of the screen with
    the footer filling the view. The outer `.public-route-loading` is only a
    viewport-tall spacer; the fade sits on the stage because a filter on an
    ancestor would re-anchor the fixed stage to it. **Two files per section,
    and both are needed**: `events/` and `results/` catch arriving at a race,
    `events/[slug]/` and `results/[slug]/` catch moving within one (event page
    → wizard, winners → leaderboard → a runner's result) — a fallback shows
    only when the segment *directly* under it changes. It fades in after
    120ms, so a prefetched page never flashes it, fades out as the page
    arrives (the page transition, below), and after
    `--runner-slow-after` (5s) its caption swaps to "Still loading, hang
    tight" through the text-swap motion (`slowCaption` on `RunnerLoader`,
    timed in CSS so the fallback stays hook-free) — a long wait is explained,
    never left looking stuck. **`/` has one too**, `(home)/loading.tsx`: the
    home page is `force-dynamic` (it reads the live listing), so Home from
    another page sat still until the reads came back. The page lives in the
    `(home)` route group so that boundary covers `/` alone — a root
    `app/loading.tsx` would answer every top-level move, the way into `/admin`
    included, with the public screen. The legal pages are prerendered and need
    none.
  - **The page arriving** — `<main>` carries `.public-main`, and each page
    rendered into it fades and un-blurs on mount over `--skel-reveal-dur`, the
    dashboard's route reveal, so the runner leaving and the page arriving read
    as one movement. It fills **`backwards` only**: a finished `blur(0)` is
    still a filter, and it would re-anchor every fixed modal inside the page
    (poster lightbox, size guide, bank details). The same rule gives the page a
    `scroll-margin-top` of `--nav-offset`, so Next's scroll on arrival never
    parks the page's top under the navbar.
  - **The link that was pressed** — `components/ui/LinkPendingIcon` wraps the
    icon a call to action already carries (the chevron on Register Now, View
    Results, View Full Leaderboard, View all) and cross-fades it into the `sm`
    figure through the icon swap (`.t-icon-swap`) while `useLinkStatus()` says
    the link is pending, after the same 120ms. The figure sits absolutely over
    the icon's cell, so the button never changes width. Only inside a `<Link>`.
  - **A submission that leaves the page** — `components/ui/RunnerOverlay`, a
    blocking panel on `t-modal` tokens, open while either wizard creates the
    PayMongo checkout or uploads a deposit slip. It says what is happening and
    asks the runner to keep the page open. **Portalled to `<body>`**, because
    the wizard's stagger reveal leaves transforms on its panels and a
    transformed ancestor traps `position: fixed`.
  - **Inside a button — always through `components/ui/BusyLabel`.** A button
    that is working renders `{busy ? <BusyLabel>Saving</BusyLabel> : 'Save'}`:
    a plain gerund with **no trailing ellipsis**, and the `sm` figure running
    **after** the words. `tone="current"` draws it in the button's own text
    colour, since brand blue vanishes into the gradient's blue end, and
    `label=""` keeps it silent — the word beside it already says what is
    happening. The owner asked for both halves of this: the dots out ("Saving…"
    is a loader drawn in punctuation — three marks that never move cannot say
    the work is still going, which is the same objection that removed the dot
    loader), and the figure behind the words rather than in front, so the label
    starts where it started when the button was idle and only the trailing mark
    changes. It is a component, not a snippet, so the ordering is decided once:
    **do not hand-roll a busy button.** Its `.busy-label` (globals.css) is an
    8px inline-flex, so the word-to-figure gap is the same in a `.btn-light`
    whose icon gap is 8px and in an action-menu row whose gap is 12px; a button
    with a leading icon keeps it while busy, so it never changes width
    mid-press. Every busy control in the app is on it — both sign-ins and the
    staff invite, Save/Update Event, the schedule modal, account settings and
    the inline card edit, Validate Payment in all three places it appears, the
    registrants table's Save/Delete/Delete Selected/Remarks/Mark As Sent, the
    results uploader, every "Uploading" dropzone, the wizard's checkout, the
    feedback form's Send, the e-certificate button and the leaderboard's *View
    E-Cert*.
  The leaderboard's rows used to open a result with `window.location.href`, a
  full reload with nothing on screen meanwhile; they now `router.push` in a
  transition, prefetch on hover, and the row's number becomes the figure while
  it opens. Reduced motion *pauses* the figure rather than removing it — a
  paused animation holds the frame its delay points at, so it freezes
  mid-stride — and the speed lines pulse in place.
- **No gradient buttons inside the admin.** Every action in the dashboard —
  toolbar, panel header, form footer, modal submit — wears `.btn-light`
  (`Admin.css`): an **inverse button** (the control corner) — on the dark theme `#e4e4e7` fill,
  `#09090b` label, white on hover; on the light theme zinc-900 with a zinc-50
  label, black on hover (`--dash-inverse-*`) — inverting the ground it sits
  on, so the one thing worth pressing is the highest-contrast thing on the
  screen. Icons are lucide and draw in
  `currentColor`, so they darken with the label on their own. It stands
  **48px** tall everywhere except inside `.toolbar-actions`, where it drops to
  the 40px of the `.btn-filter` chips sharing its row. A table toolbar holds
  exactly one `.btn-light` — its page's primary action, and the four are
  peers that must look alike: Create Event, New Promotion, Upload results,
  and the registrants' Add Registration (whose Export to CSV moved into its
  *More* chip, 2026-11-25). Everything else in that row (Filters, Needs
  Attention, View, More) stays a dark `.btn-filter` chip, and a destructive one
  like Delete Selected keeps its red. The orange gradient
  (`.btn-gradient`) keeps the dark surfaces a runner sees: the legal,
  feedback and 404 pages, and the `/admin/login` and `/admin/register`
  sign-in CTAs. Do not add Tailwind padding or flex utilities on top of
  `.btn-light` — sizing it per site is what made the admin uneven before.
  **The redesigned public pages no longer wear the gradient** — they use
  `.site-btn` (see "The public site is Paper" below); `.btn-gradient` stays on
  the dark pages (legal, feedback, the 404, the sign-in cards) and is restyled
  solid wherever it appears inside a Paper frame — which is how the checkout's
  buttons (the wizard, `/pay`) wear the one solid action.
- **The public site's quiet button is `.btn-secondary`** (`globals.css`).
  Wherever a runner is offered a second way forward beside the gradient —
  *Browse Other Races* on the registration gate and the event page's on-hold
  panel, *Back to Home* on the 404, the support address on `/coming-soon` and
  the legal pages — that button is `.btn-secondary`, never a hand-rolled set
  of Tailwind borders. It copies `.btn-gradient`'s geometry exactly (the control
  corner, 48px minimum, the same padding and its 640px step, 700-weight
  uppercase at 0.05em, the same 2px lift on hover) and differs only in the
  surface: white-at-4% glass with a `--glass-border` edge that warms to orange
  on hover. The pair must read as one set, so pass it only layout utilities
  (`w-full`, `shrink-0`, `sm:w-auto`); padding and type belong to the class.
  The one licensed exception is a label that is a literal string rather than a
  command — an email address — whose inner span carries
  `font-medium normal-case tracking-normal` so it still reads as an address.
- Styling: Tailwind utilities plus the CSS variables in `globals.css` (motion,
  spacing, radius, glass, gradient tokens). The admin has `Admin.css` and
  `Auth.css`; the wizard and event page have their own CSS files. The dark
  pages are glassmorphic with an orange (`#FF6B00`) → blue (`#007AFF`)
  gradient; the redesigned public pages are Paper (`site.css`, below).
- **Motion comes from transitions.dev.** The `--duration-*` / `--ease-*` /
  `--distance-*` scale at the top of `globals.css` is that library's shared
  motion scale, and the `t-*` classes below it are its snippets: `t-modal`,
  `t-dropdown`, `t-tilt`, `t-stagger`, `t-toast`, `t-skel`, and for a
  segmented switch `t-tabs-pill` (the sliding pill, measured by script, with
  the active tab painting it itself until then) plus `t-tab-panel` (the page
  side-by-side swap of what the tabs open, `data-phase` exit → enter → rest,
  no blur and no transform at rest) — first used by `/events`'
  `EventsTabSwitch`, which also shows how to swap a URL tab without a
  navigation. Each snippet keeps
  its `@media (prefers-reduced-motion: reduce)` guard — never drop it — and its
  own token block in `:root` so a duration can be tuned in one place. The
  reference for all 32 free transitions is installed as the global agent skill
  `transitions-dev` (`~/.agents/skills/transitions-dev/`, linked from
  `~/.claude/skills/`); reach for one of those before hand-rolling
  an animation, and add the CSS at the bottom of `globals.css` next to its
  siblings. (Reinstall it from `github.com/Jakubantalik/transitions.dev` under
  `skills/` on a new machine.) On public pages, `design-taste-frontend`'s motion
  rules win: no card tilt, no scroll-triggered reveals, and on Paper no entrance
  but the hero's (see "The public site is Paper").
- **Page transitions on the public site are React's `<ViewTransition>`**
  (owner, 2026-11-24; no animation library — `design-taste-frontend` allows
  none on a site of kind *other*, and its GSAP / Lenis are out). On a client
  navigation the page being left fades out (150ms) and the page arriving
  fades in after it (250ms) while rising 8px (400ms, `--ease-smooth-out`):
  `site-page-out` / `site-page-in`, "Page transitions" in `site.css`, which
  also carries the reduced-motion rule (no transition at all). A first load
  served whole has none, so the hero's `data-enter` stays the only entrance
  there; a first load that streams through a `loading.tsx` screen gets the
  same loading-to-page hand-off as a navigation.
  Three places carry it, and a new public page needs the first:
  - **`components/PageReveal`** wraps the tree every public `page.tsx`
    returns (each `return`, placed before any DOM node, never in a layout —
    a layout persists, so its enter and exit never fire). `default="none"`
    keeps it still on a tab switch, a filter or a refresh.
  - **`SiteFrame`** carries the same boundary, because every layout draws its
    own frame: moving between two layouts (`/events` → the wizard, `/track` →
    `/contact`) replaces the whole frame, and a page's `PageReveal` sits under
    the frame's markup, where React will not enter or exit it. The navbar is
    pinned out of that fade (`view-transition-name: site-nav`), so only the
    page and footer move.
  - **`PublicRouteLoading`** exits the same way, so a loading screen hands
    over to the page instead of cutting to it.
  The root is drawn live (`::view-transition-old(root)` hidden), so nothing
  outside a boundary cross-fades and the overlay never blocks a click. A
  browser without view transitions, or a hidden tab, just swaps the page.
  Reference: the project skill `vercel-react-view-transitions`.
- **The scroll moment is `StatementHighlight`** (`design-taste-frontend`'s
  `word-highlight`, dealt for the home page, owner 2026-11-24): one large
  statement whose words turn from a resting 62% ink (4.8:1, readable before
  it lights) to ink as it crosses the screen, the `{ strong }` words to the
  accent text; scrubbed both ways, all ink at the foot of the page, all ink
  without script or under reduced motion (`.site-statement*` in site.css). It
  is the only thing on a Paper page that moves because of the scroll, in a
  section of its own (`RaceDayStatement` on `/`, between the open races and
  Recently Held), never in a card. One per page — two only on a page of
  eight sections or more — and a new one is dealt by the skill
  (`moments.mjs pick --page service`), not picked by taste. Its words are
  things the site really does.
- **The public site is "Paper"** (the 2026-11-21 redesign, `design-taste-frontend`
  leading). A warm off-white ground (`#f6f3ee`), navy ink (`#14192b`), **one
  solid orange action** (`#c2530a`, 4.6:1 under white text), Archivo for
  everything (its width axis, ~110%, carries the headings instead of a heavy
  weight), **Title Case on UI chrome and Sentence case on prose** (§8 rule 13 —
  no all-caps titles or buttons), no
  gradients, no glass, no glow orbs. It replaced the dark glassmorphic look and
  its gradient pills, which the public-site audit called out as template tells.
  - **Where it applies is one rule:** `isPaperPath()` in `lib/site-look.ts` —
    **every public page** (since 2026-11-21: every path outside `/admin`, so a
    404 at any address is Paper too) **plus the Our Services inquiry**
    (`/admin/register`, `isInquiryPath`), which renders `SiteFrame` itself.
    `ClientLayoutWrapper` puts `.site-paper` on the frame, with `data-theme`
    set to the visitor's theme and the `data-follows-theme` marker.
  - **Light/dark Paper (2026-11-24).** The whole app follows one light/dark
    switch: the public pages, the sign-in screens and (since its Paper pass the
    same day) the dashboard. Only the print copies stay light.
    - **One palette, two themes:** `src/app/paper-tokens.css` (imported by the
      root layout) names every Paper hue once as `--paper-*` — light on
      `:root`, dark under `:root[data-color-theme="dark"]:has([data-follows-theme])`
      (Carbon `#050505` ground, `#111114` card, Warm Paper `#f6f3ee` ink,
      Blaze `#e05a00` accent text, `#388bfd` link blue, the brand's dark
      status inks — brand-guide §3, contrast listed in the file's header).
      site.css's `--site-*` blocks (frame, portals) and checkout-paper.css's
      bridge read `--paper-*`, never a hex, so both themes come from one place.
      The footer band is Race Navy in both themes (`--paper-band`); shadows use
      `rgb(var(--paper-shadow-rgb) / a)`; a glyph on a solid status fill reads
      `--paper-on-status`.
    - **The switch:** `lib/color-theme.ts` — localStorage `rao-color-theme`
      ("light"/"dark"; absent = follow the system). An inline script in the
      root layout's `<head>` writes `data-color-theme` on `<html>` before paint,
      so there is no flash and no request API (pages stay static). The
      frame's `data-theme` follows after hydration (`useColorTheme`), which
      switches globals.css's older `[data-theme="light"]` leftovers (date-field
      glyphs, select chevron). `ThemeToggle` sits in the navbar (desktop and
      phone): one 44px icon button naming the theme it switches to. The
      dashboard account menu's Dark Mode row writes **the same choice**
      (`useColorTheme`); both press `switchColorTheme`, which cross-fades the
      grounds for one beat (`data-theme-switching`).
    - **The dashboard on Paper (2026-11-24, `ui-ux-pro-max` leading).**
      `DashboardShell` marks `.admin-layout` with `data-follows-theme` and
      Archivo's variable; **`admin/admin-paper.css`** (imported by AdminShell
      after Admin.css) points every name the dashboard paints with —
      `--dash-*`, `--ink` (so the whole `--ink-*` ramp), `--bg-*`, `--text-*`,
      `--status-*`, `--accent-*` (fills: `--accent-orange` = Action Orange,
      `--accent-blue` = Track Blue `--paper-track`; words: the `-text`/`-ink`
      pair), `--tone-*` (violet = `--paper-violet`), `--logo-*`, the fonts —
      at `--paper-*`, on the frame **and on `:root:has(.admin-layout)`** so
      what portals to `<body>` follows too (the body gets Archivo's class from
      `useDashboardTheme`). Its selectors outrank globals.css's
      `[data-theme="light"]` and ink-ramp blocks, so the old zinc light half no
      longer reaches the dashboard. Light = Warm Paper ground and sidebar,
      `#fffdf9` card sheets, Race Navy ink; dark = Carbon, `#111114` cards,
      Warm Paper ink, Blaze accent text. **No theme cookie:** `dash_theme` and
      `admin/dashboard-theme.ts` are gone. Every hue flips on
      `<html data-color-theme>` before paint, so the admin layout reads no
      theme and nothing flashes; the frame's `data-theme` follows on hydration
      (`useDashboardTheme`, mirrored onto `<html>` while mounted) and steers
      only globals.css leftovers. Anything that must be right before
      hydration keys on `:root[data-color-theme]` instead (the select
      chevron in Admin.css, Google's button in auth-paper.css).
      Brand rules applied: `.btn-light` is the one solid action
      (`--paper-action`, white, 600); fields have the Field Edge
      (`--paper-field-line`, 3.5:1) and a `--paper-focus` ring; cards are
      hairline-framed with no shadow, and only floating layers (modals,
      popovers, row menus) keep one soft shadow, set in admin-paper.css over
      Tailwind's `shadow-2xl`; no `backdrop-filter` anywhere; no CSS
      uppercase on chrome (section kickers, table heads, badges read their
      Title Case source); the active menu row is a Warm Surface band in ink.
      Danger / success buttons and tints read `--status-*` with
      `--paper-*-strong` hovers and `--paper-on-status` text, never
      Tailwind's `red-500` / `green-500` palette. Page and section titles are
      Archivo 500 at 110% width.
  - **The sign-in pages are Paper too** (2026-11-22): sign in, two-step,
    forgot / reset password, the invitation, and `AuthRouteLoading`.
    `AdminShell` draws `admin/AuthPaperFrame.tsx` round every bare path
    (bare-paths.ts) except the inquiry: `.site-paper.auth-paper` with
    `data-theme="light"` and Archivo (`src/app/archivo-font.ts`, shared with
    `SiteFrame`), no navbar or footer. Their markup keeps Auth.css's classes;
    **`admin/auth-paper.css` restyles them inside `.auth-paper` only**, every
    selector starting `.site-paper.auth-paper` so it outranks Admin.css's
    `.form-input` and site.css's `.btn-gradient` in any bundle order. Auth.css
    is not edited for Paper — the dashboard loads it (admin/loading) and the
    inquiry's steps use it. The card is a `--site-card` sheet on a hairline,
    the title Archivo 500 at its width, fields the inquiry's (field-line edge,
    ink focus ring, red invalid edge), messages a box with one even 1px edge in the
    light status colours (`--status-danger` #c8282b, 5.5:1) — **no thicker
    left rule on a box**, owner 2026-11-22; *Back to Run As One* is the
    last line inside the card, with no rule above it, Google's own button
    (its light set on light Paper, its dark set on Carbon), the keep box on
    tokens. Since 2026-11-24 the frame follows the app's light/dark switch
    (`data-follows-theme`, `data-theme` from `useColorTheme`).
  - **The last pages (2026-11-21):** the legal pages (`LegalPage`: one
    centred column set, `.legal-shell` — the text measure alone below `lg`,
    the 15rem jump-list rail plus the 40rem text from `lg` — so the header,
    rail and text sit as one block with even margins and no blank strip on
    the right (owner, 2026-11-24); a 40rem column of ink at 17px/1.7,
    numbered clauses on hairlines, no entrance fade. The jump list is
    `LegalToc`: a sticky rail from `lg` marking the clause being read
    (`aria-current="location"`, a navy bar; an IntersectionObserver, no
    scroll listener), a folded `<details>` above the text below `lg` that
    folds again when a link is followed. `.legal-*` in site.css); `/coming-soon`
    and the 404 (`.site-notice`: code line, `.site-h1`, lead, the button
    pair; the 404's three onward links are relative, so a client's subdomain
    keeps its own pages); `/feedback` and the inquiry (heading and lead beside
    a `.site-form-card` from `lg`). **Form furniture on Paper** (site.css):
    `.site-form-card`; `.site-choice` (a choice card: action edge and tint when
    chosen, red edge when missing); `.site-drop` (file drop zone);
    `.site-icon-btn`; `.site-done-mark`; FieldError's `.field-error` hook and
    the `.input-group` invalid edge, both `--status-danger`. A page intro's
    lead is spaced by its named parent (`.site-lead` resets margin unlayered,
    so a `mt-*` beside it does nothing). The inquiry's steps keep their
    Auth.css markup and `register/inquiry-paper.css` restyles it inside
    `.inquiry`; the frame marks it `.site-checkout` (`wearsPaletteBridge`), so
    the bridge below turns its shared controls light too.
  - **The checkout is Paper too** (2026-11-21), so a runner never walks off the
    light event page into a dark checkout at the step where they pay.
    `isCheckoutPath()` (the wizard and `/pay/**`) adds **`.site-checkout`** to
    the frame, and **`src/app/checkout-paper.css`** does the work:
    - **A palette bridge, not a rewrite.** The wizard's components were built
      for the dark look in Tailwind's palette (`text-white`, `border-white/10`,
      `bg-black/40`, `text-red-400`, `emerald`/`amber`), and the two wizards are
      1,870-line split candidates. Inside `.site-checkout` those palette
      variables point at Paper: *white* is the ink, *black* the card, red /
      green / amber the light frame's deepened status colours, `--accent-orange`
      the accent text (#a8460a) and `--accent-blue` Paper's link blue. A white
      label meant to stay white on an orange fill is the one exception, named
      there. **New checkout code reads `--site-*` tokens directly** — the
      bridge is for the code already there, and it reaches nothing outside the
      mark (the dashboard, which shares `PhoneField` and `StepRail`, never
      carries `.site-paper`). The Our Services inquiry wears the bridge as
      well, for the same controls; the bridge also repoints `--ink-15/30/50`,
      `--dash-shadow` and `--dash-field(-focus)` for the dashboard pickers it uses,
      and `body:has(.site-checkout) > .t-dropdown` (AdminDatePicker's portalled
      calendar) is one of its portals.
    - **What a palette swap cannot reach is restyled by name:** the drawn
      controls' `.control-shell` (the field edge, the ink focus ring, the red
      invalid edge and fill), the `#0d0d0f` popovers (select lists, the
      calendar, the country list), the glow orbs and coloured glows (gone),
      the `uppercase` labels (mixed case; never a field, since names are stored
      uppercase), the headings (Archivo 500 at its width), `.glass-panel`'s
      radius, RegistrationWizard.css's rgba fills, the step rail, and the
      modals (a card on a navy scrim, no blur).
    - **Portals.** The poster lightbox, the phone's birthdate sheet, the
      submitting overlay (`RunnerOverlay`) and the alert modal (`AlertModal`,
      hooked by its `.alert-modal` class) render into `<body>`, outside the
      frame; `body:has(.site-checkout)` gives them Paper's values for as long
      as a checkout page is up.
    - **Motion.** The columns' load stagger and the step's slide-down fade are
      off (the fade ran as the page loaded); small reveals inside a step — the
      guardian panel, a chosen file — keep theirs.
    - **The `/pay` pages and the register gate** ("Registration paused" and
      the like) read tokens outright: `.site-h2` title, the eyebrow in
      `text-site-accent`, the details on a `bg-site-card` list with a
      `bg-site-surface` total row, and the `.site-btn` pair.
    - **A field's edge is `--site-field-line`** (#8f887d, 3.5:1 on a card —
      the 3:1 a control's boundary needs; the hairline is 1.8:1). It is the
      `.input-group` edge on every Paper page, not only the checkout.
  - **Portals on Paper** (2026-11-22). What a Paper page renders into `<body>`
    sits outside the frame and would get the dark `:root` defaults, so
    site.css's "Paper on portals" block gives Paper's tokens (and the light
    names the shared alert reads: `--dash-panel-solid`, `--dash-scrim`, the ink
    ramp, red/green as the status colours) to **`.site-portal`**, the alert
    modal (`.alert-modal`), the toast rail (`.toast-rail`, AlertProvider) and
    the photo viewer (`.zoom-lightbox`) under `body:has(.site-paper[data-theme])`
    — so on a dashboard page nothing changes. `ClientLayoutWrapper` copies
    Archivo's variable onto `<body>` while a Paper page is up, so the portals
    get the font too. **A new public modal portalled to `<body>` carries
    `.site-portal`** and is built from `.site-scrim` + `.site-modal`
    (`__head`, `__title`, `__close`, `__foot`) with the `.site-btn` pair — the
    e-certificate is the worked example. A menu that portals into
    `.site-paper` instead (the leaderboard's Actions) needs nothing. The photo
    viewer is the paper ground with card controls and the current thumbnail
    ringed in the action colour; the route loader drops its blue glow and the
    running figure's caption goes mixed case.
  - **Everything reads tokens** (`src/app/site.css`, imported by `SiteFrame`):
    `--site-bg`, `--site-surface`, `--site-card`, `--site-ink`, `--site-muted`,
    `--site-line(-strong)`, `--site-action(-hover/-ink)`, `--site-accent-text`,
    as utilities `text-site-ink`, `bg-site-card`, `border-site-line`,
    `bg-site-action`, `text-site-accent` (`@theme inline` in `globals.css`).
    The values come from `--paper-*` (paper-tokens.css), so **dark Paper needs
    no component changes**: never write a hex, `text-white` or `white/…` in a
    redesigned component — read a `--site-*` token, and add a `--paper-*` pair
    (light and dark) when a new hue is truly needed.
  - The `data-theme` half re-runs globals.css's light block on light Paper —
    the logo's deepened inks, the ink ramp, the status colours — so a shared
    component reading those names (StatusPanel, RunnerLoader, LinkPendingIcon,
    CategoryPrice's sale chip via `--status-success`) turns light untouched.
  - **The furniture:** `.site-wrap` is the content column (it sets only the
    inline edges — `.container` sets the `padding` shorthand unlayered and
    silently beats every `pt-*`/`pb-*` beside it, so never pair the two);
    `.site-section` the vertical step (a section after another drops its top);
    `.site-h1/-h2/-h3` and `.site-lead` the type; **`.site-btn` with
    `--action` or `--quiet`** the only button pair (steps up 1px on hover,
    presses to 0.98); **`.site-link` the one text link** (below); `.site-chip`;
    `.site-card` the event card. On Paper,
    `.btn-gradient` / `.btn-secondary` / `.glass-panel` / StatusPanel /
    `.input-group` fields are restyled in `site.css`, so a shared component
    cannot bring a gradient pill or a grey slab back onto a redesigned page.
  - **One text link: `.site-link`** (`site.css`). Every orange text link on a
    Paper page — the home's "See all past races", an event card's "See race
    details", the sign-in footer's "Our Services", a mail address in a
    sentence, the inquiry's Privacy and Terms — uses it, and **a new one must
    too**; never a hand-rolled `underline hover:…` utility or a per-page
    `.x-link:hover` rule. Rest: accent text, no line (the owner's call). Hover
    and keyboard focus: a 1.5px underline draws in left to right and the
    colour deepens toward the ink; press: the ink; focus also gets the blue ring. One
    timing, `--duration-fast` on `--ease-smooth-out`, off under
    `prefers-reduced-motion`. `.site-link` alone stays inline so it wraps in
    running text; **`.site-link--arrow`** is the standalone form (label in a
    `<span>`, icon beside it, a 44px target, the icon nudging 3px right) and
    **`--back`** nudges a leading back arrow left. A `<button>` that reads as
    a link takes the class too (its chrome is reset). Nav links, the legal
    jump list and the 404's onward cards are not text links and keep their
    own looks; the old `.auth-link` and `.feedback-mail` are gone.
  - **The corner scale is three steps, for the whole app** (Paper pages and
    the admin), defined once in the `@theme static` block of `globals.css`:
    **`--radius-chip` 4px** (a chip, a badge, a count, a tag, a status label),
    **`--radius-control` 6px** (a button, a field, a select, a dropdown
    trigger, a pager or icon button, a segmented switch's outer edge), and
    **`--radius-panel` 8px** (a card, a table, a menu or popover, a modal, a
    sheet, a form card, a choice card, a drop zone, a notice box). CSS reads
    them as `var(--radius-*)`; Tailwind gives `rounded-chip`,
    `rounded-control`, `rounded-panel` (and `rounded-t-panel` and so on). A
    menu item or a segment inside a padded container takes the container's
    corner less the padding, floor 2px (`.lb-menu__item` is
    `calc(var(--radius-panel) - 4px)`). There are **no pills**: no 999px, no
    `rounded-full`, no hard-coded `rounded-[NNpx]` on a container, control or
    chip. The old `--radius-sm/md/lg/xl/2xl/3xl` (and so `rounded-md`,
    `-lg`, `-xl`, `-2xl`, `-3xl`) are folded onto the scale so a leftover
    cannot bring a soft corner back, but new code uses the three names.
    **Only what is drawn as a circle stays round:** the winners board's
    medals, status dots of 12px or less, avatars, radio inputs (ring and
    dot), a toggle switch's track and thumb, the loaders' spinners, the
    zoom-lightbox page dots, and the blurred decorative glow blobs. Icon
    tiles (a success mark, an empty-state icon, a step number), close
    buttons and the footer's social links are squared like any other
    control or panel. Emails (`email-document.ts`) and the e-certificate PDF
    artwork are outside the scale.
  - **The full leaderboard's pointer rules** (`.lb-*` in `site.css`,
    `/results/[slug]/full`): only what opens something answers the pointer,
    and everything of a kind answers alike. `.lb-control` — every bordered
    control (Category, Gender, rows per page, the pager): hover darkens the
    edge to the ink, press fills the surface, a disabled one does not answer.
    A row's *E-Cert* is a **text link, not a bordered button**:
    `.site-link site-link--arrow site-link--still` on a `<button>` — accent
    text, the underline drawing on hover, a leading certificate icon
    (`FileBadge`) that stays put (`--still`), a 44px target; `aria-busy`
    keeps it legible while it draws.
    `.lb-menu` /
    `.lb-menu__item` — the open menus (`--roomy` for the 8px-padded filter
    menu). `.lb-row` — a table row, the same as the winners board's rows
    (surface on hover, a step darker on press, an inset focus ring, the name
    turning accent); the table around the rows no longer reacts. `.lb-card` —
    a phone card, with the same 2px lift as `.site-card`. All off under
    `prefers-reduced-motion`.
  - **The navbar is a solid strip** (`.site-nav`, 64/72px, `--nav-offset` is its
    height on Paper) with a drawn underline on the current link; the phone menu
    is a full-width sheet under it. **The footer is the ink band**
    (`.site-footer`) — the one inverted ground; on a dark page it stays near
    black with a hairline and keeps its top margin.
  - **Motion:** the hero enters once on load (`data-enter` on its parent: each
    child rises 14px over 520ms, staggered 60ms) and nothing else animates in —
    the page-arrival reveal is off on Paper, cards no longer rise in, the
    leaderboard rows no longer stagger, the results tilt script is gone. Hover
    micro-interactions only: a card lifts 2px and its poster zooms 1.025, an
    arrow nudges 3px. All rest under reduced motion.
- **The home hero is a product stage** (`components/HeroSection`, a Server
  Component): the head row — the headline on the left, the lead and the two
  buttons (*See Upcoming Races*, *Look Up Results*) on the right — and the
  **next race's poster whole across the content width** under a *Next Race* line
  (its date and place). **The headline is data:** the provinces the upcoming
  on-site races are in, most races first (`groupBy province` in the home page's
  one `Promise.all`), "Road Races in Tarlac and Pangasinan" — two named, then
  "and More"; none gives a plain fallback. No poster, no stage. The page closes
  on an **Organizing a Race?** band → `/admin/register` (clients hire Run As
  One), replacing the three numbered "How it works" cards.
- **A race's head is `components/RaceHeader`**: one step back, the race's name
  (or a page title such as *Race Winners* with the race's name above it), its
  date, time and venue, an optional plain-language `lead`, and an actions row.
  It is used by the event page and all three results pages, and replaced
  `EventHeroBanner`, which printed the title in white capitals over the
  organizer's poster behind a scrim.
- **No decoration behind a page at a negative `z-index`.** The public pages
  used to float two blurred accent orbs (`-z-10`) behind their content. At rest
  those sit under `<body>`'s own background and cannot be seen at all, but the
  page-arrival reveal (`.public-main > *` in `globals.css`) animates opacity and
  a filter, which briefly makes the page its own stacking context — and for
  that split second the orbs painted on top of the ground as a hard-edged
  blue-to-orange box behind the dimmed page. They were removed from every page
  (home, `/events`, `/results`, and the `PageOrbs` helper the 404, coming-soon,
  legal and registration-closed pages shared). A glow that should be seen goes
  inside the surface it lights, at a non-negative z-index, as the orbs inside
  `StatusPanel` and the winners-board panel do.
- **Page CSS never declares a class named like a Tailwind utility.** Route
  stylesheets (`EventDetails.css`, `RegistrationWizard.css`, `Admin.css`) are
  unlayered, Tailwind v4 emits its utilities in `@layer utilities`, and
  unlayered CSS beats layered CSS regardless of specificity or order. So a
  `.text-accent-blue { … }` in a page file pins that colour and every
  `hover:` / `group-hover:` / `focus:` utility on the same element is silently
  ignored — and because Next keeps a route's stylesheet loaded after client
  navigation, the damage reaches pages that never import the file.
  `EventDetails.css` once did exactly that: the results back link and the
  wizard's "Size Guide" / "View inclusions" links never turned white on hover,
  and the results page's Clear filters had to spell its blue as
  `text-[var(--accent-blue)]` to get its hover back. `RegistrationWizard.css`
  did it too: its `.bg-dark` killed the full-results pager's `hover:bg-white/5`
  after a runner came from the wizard, and its `.text-xl` (1.5rem) overrode every
  `text-xl` and `md:text-2xl` beside it — the wizard now spells that size
  `text-2xl`. A colour or spacing the
  theme already has is the utility (add the token to `@theme` in `globals.css`
  if it is missing); a page class gets a name of its own (`.event-meta-icon`,
  not `.text-blue`). If a utility-named class truly has to live in CSS, put it
  in `@layer components` so utilities still win.
- Fonts: Outfit (`--font-sans`, headings), Inter (`--font-body`) on the dashboard and the dark pages; **Archivo** (`--font-archivo`, loaded with its `wdth` axis in `src/app/archivo-font.ts`, imported by `SiteFrame` and `admin/AuthPaperFrame`, so the dashboard proper never uses it) for both on Paper pages.
- **The logo is a component, not an image** (`components/RunAsOneLogo.tsx`,
  `.rao-logo` in `globals.css`, geometry in `lib/brand-mark.ts` — the one copy
  of the path data, which the component and the e-certificate draw from; the
  raster assets are cut from the official files in `brand/logos/` instead). It replaced `public/run-as-one-logo.png` (the old
  artwork, since deleted)
  everywhere a person sees the app: the public navbar and footer, both
  dashboards' sidebars, and the two auth cards. Two halves made of deliberately
  different material — **the mark is SVG geometry** (three concentric arcs, ink
  then blue then orange, with a solid orange dot carrying on past the outer
  arc: a track curve with the pack inside it and one runner already clear), and
  **the wordmark is real HTML text**, because SVG `<text>` is laid out in
  whatever font actually resolved, so its width — and with it the cropping of a
  fixed `viewBox` — changes between the fallback face and the real one. Live
  text sidesteps that, scales crisply, and is what a screen reader announces
  when the lockup sits in a link (which is why the mark beside it is
  `aria-hidden`, and why the DOM text is mixed-case and uppercased in CSS).
  Three variants — `full`, `stacked`, `mark`. **Flat colour, never the
  orange→blue gradient**: this logo has to survive a bib, a shirt and a
  tarpaulin, and a ramp is the first thing a printer loses.
- **The brand is "Run As One", and `SITE_NAME` is the only place it is
  spelled.** It was once written "RunAsOne", and for a while it carried a
  parent-brand byline; the owner had that byline removed from every surface —
  the name, the logo lockup, the favicon's label, the Open Graph card and the
  email logo. Every surface that names the platform in prose — the root
  `<title>` and every page title, the Open Graph `siteName`, the two legal
  pages, the footer copyright, the sender name and footer on every email —
  builds its string from `SITE_NAME` in `lib/site-contact.ts` rather than
  typing it. **Never retype the name**: an earlier rename left half the page
  titles behind because they were string literals, which is why they are
  template literals off the constant now. The email sender's display name stays
  **quoted** (`"${SITE_NAME}" <…>`) so a special character in some future name
  — the old byline's colon was one — cannot break RFC 5322 parsing. The
  lockup's wordmark is the *only* copy of the name not read from the constant,
  because it is separately styled DOM text, so edit the two together. The
  `RunAsOneLogo` component, its file and the `.rao-logo` class keep their old
  identifiers; they are code names, not text a person sees.
- **The lockup is the mark and the wordmark, nothing else.** There is no byline
  or tagline slot: the endorsement line that used to sit under the wordmark was
  removed along with its `.rao-logo__byline` and `.rao-logo__words` styles, so
  the wordmark alone is centred on the mark in the horizontal lockup and centred
  under it in the stacked one. Do not bring a sub-line back unless the owner
  asks for one.
- **Sizing the logo is one number.** `--rao-logo-size` is the height of the
  mark and everything else — the wordmark and the gap — is `em` off it, so
  a call site sets one value and the proportions hold:
  `className="[--rao-logo-size:32px] sm:[--rao-logo-size:38px]"`. Do not size
  the wordmark or the gaps per surface; that is what left the old raster logo a
  different size in every corner of the app. **The 40px default is only a
  `var(--rao-logo-size, 40px)` fallback — never declare `--rao-logo-size` on
  `.rao-logo` in `globals.css`.** That file is unlayered and Tailwind v4 puts
  the arbitrary-property utilities in `@layer utilities`; unlayered CSS beats
  layered CSS regardless of specificity, so a declared default once pinned every
  logo (navbar, footer, auth cards) at 40px and silently ignored the size each
  call site asked for. The admin sidebar sets its size from `Admin.css`
  (`.admin-brand .rao-logo`: 40px, 26px below 48rem) instead of a utility.
- **The logo draws in four variables, not hexes** — `--logo-ink`, `--logo-mid`,
  `--logo-accent`, `--logo-muted`, defined in `globals.css` and pointing at the
  site tokens so the logo cannot drift from the accents beside it. A
  `[data-theme="light"]` block (any element, not only the root) holds the light values, with the
  two accents deepened (`#d95f00`, `#0062d6`) because brand orange on white is
  2.8:1 and a thin stroke at that contrast reads as a smudge. On a Paper
  frame (public, sign-in, dashboard) the four names read `--paper-logo-*`
  instead, which follow the app's light/dark switch — the component does not
  change. A logo on an unusual surface can likewise be
  re-tinted by setting `--logo-ink` on its container.
- **The dashboard is themed through tokens, never `dark:` branches**
  (`LIGHT_THEME_PLAN.md`). Since the Paper pass (2026-11-24) the values come
  from `paper-tokens.css` through `admin/admin-paper.css` (above); the
  globals.css blocks described here are now only the fallback a frame without
  `data-follows-theme` gets. `globals.css` `:root` holds the dark values and
  `[data-theme="light"]` the light ones: `--bg-dark` (the ground, which the
  frame always read and which was never defined until then), `--dash-surface`,
  `--dash-sunken`, `--dash-field(-focus)`, `--dash-chrome`, `--dash-header`,
  `--dash-panel(-solid)`, `--dash-popover` (a toolbar's small menus),
  `--dash-scrim`, `--dash-shadow`,
  `--dash-inverse-bg/-fg/-hover`, `--text-primary/-secondary/-muted`,
  `--status-success/-warning/-danger` (deepened on light to clear 4.5:1 on
  white; tints are `color-mix` of them), `--accent-blue-text` /
  `--accent-orange-text` for words in brand colour, `--accent-blue-ink` /
  `--accent-orange-ink` (`text-accent-blue-ink`) for the same where the dark
  theme must keep the exact brand hex, `--tone-amber/-green/-red/-violet`
  for words on a tinted chip, and `--color-scheme` for
  the browser's own date pickers. A token derived from another in `:root`
  (`--runner-far`, `--shimmer-base/-highlight`) is declared again in the
  light block, or it keeps the dark result. **Every `rgba(255,255,255,a)` is an ink step**
  `--ink-02` … `--ink-85` (`color-mix` of `--ink`), declared on
  `:root, [data-theme]` so it re-resolves inside a themed frame; the named
  steps are `--dash-hairline`, `--dash-border` and `--dash-hover`. The
  Tailwind colours are `@theme inline`, so `text-primary`, `text-secondary`
  and `bg-dark` follow the theme. A new dashboard surface reads one of these
  names; a hex or white-alpha in admin CSS or TSX is a light-theme bug, and so
  is a `text-white`, `white/…`, `black/…`, `gray-…` or `text-accent-*` class.
  The only literals allowed are words on a solid coloured fill (a red or green
  confirm button, a badge), the black veil over a photo, and the event
  editor's certificate preview, which draws the printed certificate. Status
  words read `--status-*`, never Tailwind's `red-400` / `green-400`. Data-URI
  icons cannot read a variable, so each has a `[data-theme="light"]` twin. Only
  the dashboard sets `data-theme`, so the public site only ever sees the dark
  values.
- **The brand rasters outside the component, and why each is a different
  file.** All are cut from the official outlined lockups in `brand/logos/`
  (`brand/brand-guide.md` §2, §8) by **`node scripts/gen-brand-assets.mjs`** —
  the wordmark there is already vector paths, so `sharp` rasterises it exactly
  with no font installed. `brand/` is gitignored, so the script runs only in a
  checkout that has it; its outputs are committed. Never hand-patch a raster:
  change the brand file and re-run the script.
  - **`public/icon.svg`, `public/favicon.ico` (16/32/48), `public/apple-icon.png`
    (180) — the contained `favicon-badge`**: the mark on a solid Race Navy
    `#14192B` plate, so one icon is legible on light and dark browser and OS
    chrome alike (the brand forbids a bare transparent mark there). This
    replaced the old theme-following favicon (`ThemedFavicon`, deleted). The
    Apple icon is the same badge full-bleed and square, because iOS rounds the
    corners itself and fills transparency with black. They sit in `public/`,
    declared by the root layout's `generateMetadata`, not in `app/`: a file
    there outranks `generateMetadata`, and **a client's site
    (`CLIENT_SUBDOMAIN_PLAN.md`) uses its own square site icon
    (`Client.faviconUrl`) as the tab and Apple icon instead**. A client with no
    site icon keeps the badge.
  - **`app/opengraph-image.png` — the 1200x630 card a shared link shows.** A
    Carbon `#050505` panel inset 30px (some platforms crop 1.91:1 to 2:1,
    taking 15px off the top and bottom) with a white 14% hairline, and the
    compact **`poster-stacked-dark`** lockup centred — the brand's lockup for
    social cards, and one a square-cropped thumbnail still shows whole. No
    tagline, gradient or glow (brand-guide §1, §2.4). It carries its own dark
    panel because `og:image` is one static URL crawlers cache and show to
    light- and dark-mode viewers alike, so the card must be legible on any
    ground by design. Next turns the file into `og:image` only once
    `metadataBase` is set; `SITE_URL` in `site-contact.ts` is that base, and
    **it has to be a hostname this Vercel project actually serves** (it once
    named a `*.vercel.app` host the project had never been assigned, and
    Facebook substituted an event poster). `opengraph-image.alt.txt` beside the
    PNG supplies `og:image:alt`.
  - **`public/email/run-as-one-logo.png` — `horizontal-dark`**, 3x (672x138)
    for a 224px display width, white ink on transparent: it relies on the email
    header cell's `#050505`. Email needs a raster: Gmail strips inline SVG and
    no client resolves CSS variables.

  **The email chrome is dark Paper** (`lib/email-document.ts`, the palette
  constants at its top mirror the dark block of `app/paper-tokens.css`):
  Carbon ground and header, `#111114` card with 8px corners and `#2B2926`
  hairlines, Warm Paper ink, a solid Action Orange `#C2530A` button with 6px
  corners (no gradient), Blaze `#E05A00` section eyebrows and total, a 4px
  status chip in Title Case with the dark status inks (`#FAAD14` pending,
  `#52C41A` done), and `#388BFD` links. **Archivo is loaded from Google Fonts**
  in the email `<head>` and named first in the stack: Apple Mail, iOS Mail,
  Outlook for Mac, Samsung Email and Thunderbird show it; Gmail, Yahoo and
  Outlook on Windows and the web drop web fonts and fall through to
  Helvetica/Arial. The `<link>` is hidden from Outlook desktop and an `mso`
  style pins it to Arial, because Outlook falls back to Times New Roman
  whenever a web font is declared. Labels are Title
  Case in the source; nothing is uppercased by CSS.

  **A re-cut email logo also needs its URL bumped and a deploy to `main`.**
  `LOGO_URL` in `lib/email-document.ts` carries a `?v=` (`LOGO_VERSION`) that
  must change with the PNG: Gmail's image proxy caches each image URL on
  Google's side and keeps serving that copy. And the URL is built on
  `SITE_URL`, the production domain, so an email sent from localhost or a
  preview shows whatever production serves until `main` is deployed.
- Commit style: `feat:` / `fix:` / `refactor:` plus a sentence saying what changed
  for the user.

