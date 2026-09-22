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
  `src/app/(home)/page.tsx`. The `[slug]` pages under `/events` and `/results` are
  already server-rendered on demand because they take a dynamic segment and
  have no `generateStaticParams` — that is why the event page was right while
  the listing in front of it was wrong — but **any new public page that queries
  Prisma and has no dynamic segment must opt in explicitly**; check the build's
  route table for a `○` on a page that should be live.
- Imports use the `@/` alias for `src/`.
- Registrant text is stored **UPPERCASE**, email excepted (§5, `text-case.ts`).
  A field whose value is stored uppercase shows an uppercase *sample*
  placeholder; a placeholder that is an instruction stays sentence case.
- **An email address is checked on both sides of the wire** (§5,
  `email-address.ts`) and stored trimmed. `type="email"` on the input is not a
  check — a browser only enforces it on a form submit, and the wizards advance
  through click handlers — and an address that is not one is not a cosmetic
  fault: it is a runner who never hears from us again.
- Money is centavos everywhere (§5). Dates are `YYYY-MM-DD` strings against a
  Manila "today". Phones are E.164.
- A finishing time is never shown with tenths — every display runs through
  `toWholeSeconds` (§5, `race-time.ts`), including the e-certificate.
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
  - **From `md` up the menu collapses to an 80px icon rail** from the round
    chevron on its edge. Icons never move. Labels fade but stay each row's
    accessible name, and a tooltip (transitions.dev's 17) names the row on
    hover and focus. The choice is kept in the `dash_sidebar` cookie
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
    included.
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
  - A header back arrow wears `.admin-back-link` for its 44px hit area.
  - **A bulk action below `lg` is a bottom bar, not a toolbar chip.** The
    registrants list's `.bulk-bar` ("N selected · Export · Delete · Clear")
    is fixed to the viewport and lined up with the content column, with a
    `.bulk-bar-spacer` at the end of the list so the pager scrolls clear of
    it, and rises on `.t-toast`. It is fixed rather than sticky because it
    floats over whichever card is at the foot of the screen, wherever the
    list is scrolled to. From `lg` up the red chip in the toolbar does the
    job. A card list with a bulk action passes `selectAll` to
    `AdminCardList`, reading the table's page selection.
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
  - **A wait is the page's shape, at both widths.** `admin/loading.tsx` and
    `admin/events/loading.tsx` read the URL and hand `AdminRouteLoading` a
    shape (the Overview's tile count also reads `dashboard-nav.tsx`, since
    `platform:manage` adds a fourth) from `admin/route-loading-shape.ts`.
    Below `lg` that is metric tiles, the toolbar's wrapped rows and a card
    list in its frame, or form panels field by field. The same entry's `lg`
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
    Validation*, *Unsent Email*): a single question asked all day, coloured
    like what it collects, stays its own chip beside Filters. The public
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
    the arrow flush with the card's edge — the same trick `.admin-back-link`
    uses), and it names the site rather than saying "Home", which on a page
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
  registrants screen's *Needs Validation* and *Unsent Email* chips, the feedback
  screen's triage filter. And when the number in the `No.` column is worth
  quoting outside the screen, assign it on the server from that order and carry
  it on the row (registrants' `regNo`) instead of using the row's position,
  which renumbers the moment anything is filtered.
  A cell that has something to add to a badge uses **`.status-note`** (Admin.css)
  — a small line under it in the badge tones' own colours, as the marketing
  table's *Ends in 3 days* does — never a second `.status-badge`, because two
  pills in one cell read as two states when there is only one.
- **One public event card.** `components/EventGrid` renders every public event
  listing — `/`, `/events`, `/results` — so an event looks like itself wherever
  it appears. It differs only by its `action` prop (`'register'` → the event
  page, `'results'` → the winners board), a string rather than a callback
  because the pages rendering it are Server Components. Never fork a rival card.
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
- **A closed list of answers is never a native `<select>`.** The wizard has
  `events/[slug]/register/SelectField`; the admin now has `admin/AdminSelect`,
  the same interaction wearing `.form-label` / `.form-input`. Two components
  rather than one because they live in different design systems. The results
  uploader's seven column-mapping selects moved onto it in Mobile Batch 4, so
  the admin has no native select left. The registrants edit modal's Gender
  field moved in Mobile Batch 3; its Shirt Size is still a free-text box with a `<datalist>`,
  which AdminSelect cannot replace because a size may be left blank or typed.
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
  phase**: a Month or Year option commits and unmounts on its own pointerdown,
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
  picker's one line under date and time). The trigger is named by its label
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
- **Chrome every dashboard page shares goes through `DashboardShell`, not into each page.** The notification bell is the model: one `headerAccessory` slot at the top of `<main>`, and CSS (`.has-header-accessory .admin-header`) that keeps every page's header clear of it. Something meant for every header is added there, never pasted into fifteen `page.tsx` files.
- **A row with more than one action has a ⋮ menu, never a row of chips.** The
  Actions cell holds one `.action-dropdown-btn` whose menu lists each action
  as icon + label, destructive ones red below a divider — the events table's
  shape. Icon-only chips named by a hover `title` (the old clients, clubs,
  feedback and remittance rows) are gone. A menu with bespoke states (the
  events menu's pending navigation, the team menu's *Saving*) keeps its own
  `*ActionsMenu`; a plain list of items passes them to
  **`admin/RowActionsMenu`** (`RowAction`: label, icon, `onSelect` or `href`
  for a new-tab file, `danger`, `disabled`), which swallows the row's click and
  keys and renders nothing for an empty list. A single action stays a labelled
  chip (*View Details* on the Remittances list).
- **A row's action menu is portalled to `<body>`.** Every card and table in the
  app clips its own overflow (rounded corners, horizontal scrollers), so a menu
  laid out inside the row is cut off on the last rows. The admin menus
  (`admin/events/EventActionsMenu` and its siblings) and the public leaderboard's
  `ActionMenu` (`results/[slug]/full/FullResultsClient`) all render into
  `document.body` with `position: fixed`, place themselves from the trigger's
  `getBoundingClientRect()`, reposition on scroll and resize, and — the
  leaderboard's — flip above the trigger when the space below it cannot hold the
  menu. Copy that rather than an `absolute top-full` menu. The three admin
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
  silent `router.refresh()` in the admin is a candidate.
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
    120ms, so a prefetched page never flashes it, and after
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
  (`Admin.css`): an **inverse pill** — on the dark theme `#e4e4e7` fill,
  `#09090b` label, white on hover; on the light theme zinc-900 with a zinc-50
  label, black on hover (`--dash-inverse-*`) — inverting the ground it sits
  on, so the one thing worth pressing is the highest-contrast thing on the
  screen. Icons are lucide and draw in
  `currentColor`, so they darken with the label on their own. It stands
  **48px** tall everywhere except inside `.toolbar-actions`, where it drops to
  the 40px of the `.btn-filter` chips sharing its row. A table toolbar holds
  exactly one `.btn-light` — its page's primary action, and the four are
  peers that must look alike: Create Event, New Promotion, Upload results,
  Export to CSV. Everything else in that row (Category, Logistics, Payment,
  View, Unsent Email) stays a dark `.btn-filter` chip, and a destructive one
  like Delete Selected keeps its red. The orange gradient
  (`.btn-gradient`) keeps the surfaces a runner sees: the public site, the
  registration wizard, and the `/admin/login` and `/admin/register` sign-in
  CTAs. Do not add Tailwind padding or flex utilities on top of
  `.btn-light` — sizing it per site is what made the admin uneven before.
- **The public site's quiet button is `.btn-secondary`** (`globals.css`).
  Wherever a runner is offered a second way forward beside the gradient —
  *Browse Other Races* on the registration gate and the event page's on-hold
  panel, *Back to Home* on the 404, the support address on `/coming-soon` and
  the legal pages — that button is `.btn-secondary`, never a hand-rolled set
  of Tailwind borders. It copies `.btn-gradient`'s geometry exactly (16px
  radius, 48px minimum, the same padding and its 640px step, 700-weight
  uppercase at 0.05em, the same 2px lift on hover) and differs only in the
  surface: white-at-4% glass with a `--glass-border` edge that warms to orange
  on hover. The pair must read as one set, so pass it only layout utilities
  (`w-full`, `shrink-0`, `sm:w-auto`); padding and type belong to the class.
  The one licensed exception is a label that is a literal string rather than a
  command — an email address — whose inner span carries
  `font-medium normal-case tracking-normal` so it still reads as an address.
- Styling: Tailwind utilities plus the CSS variables in `globals.css` (motion,
  spacing, radius, glass, gradient tokens). The admin has `Admin.css` and
  `Auth.css`; the wizard and event page have their own CSS files. Dark,
  glassmorphic, with an orange (`#FF6B00`) → blue (`#007AFF`) gradient.
- **Motion comes from transitions.dev.** The `--duration-*` / `--ease-*` /
  `--distance-*` scale at the top of `globals.css` is that library's shared
  motion scale, and the `t-*` classes below it are its snippets: `t-modal`,
  `t-dropdown`, `t-tilt`, `t-stagger`, `t-toast`, `t-skel`. Each snippet keeps
  its `@media (prefers-reduced-motion: reduce)` guard — never drop it — and its
  own token block in `:root` so a duration can be tuned in one place. The
  reference for all 32 free transitions is installed as an agent skill at
  `.claude/skills/transitions-dev/`; reach for one of those before hand-rolling
  an animation, and add the CSS at the bottom of `globals.css` next to its
  siblings. (`.claude/` is gitignored, so the skill is per-checkout: reinstall
  it from `github.com/Jakubantalik/transitions.dev` under `skills/`.)
- **The home hero stands under a dot arch** (`components/HeroArcBackground`,
  `.hero-arc` in `globals.css`). It is a Canvas 2D port of the "Predictive Arc"
  background, and only its core renderer — the package's iframe and Three.js
  variants were left behind, so no dependency came with it. It is recoloured to
  be the logo's track bend, and reads as a finish gantry over "Find Your Next
  Finish Line": **outer rim brand orange, inside brand blue, a warm white
  core**, with the two accents read from `--accent-orange` / `--accent-blue` at
  mount rather than typed. Blue goes on the inside because the copy sits under
  the arch and blue is the darker accent. The rules it keeps are the ones any
  later decorative loop should copy:
  - The apex is **anchored to the hero copy** (`--nav-offset` plus the section's
    top padding), not to a fraction of the layer. A fraction put the white core
    through the headline at some widths.
  - A scrim of `--bg-primary` pools behind the text.
  - It redraws at **30fps**, one path per colour, with DPR capped at 1.5.
  - It **pauses** off screen and in a hidden tab, and draws **one still frame
    under reduced motion**.
  - It fades in on the skeleton-reveal tokens once the first frame is drawn.
  - It runs full-bleed and up under the navbar like the event page's poster.
    That is why the home page wrapper does not clip its overflow.
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
- Fonts: Outfit (`--font-sans`, headings), Inter (`--font-body`).
- **The logo is a component, not an image** (`components/RunAsOneLogo.tsx`,
  `.rao-logo` in `globals.css`, geometry in `lib/brand-mark.ts` — the one copy
  of the path data, which the component, the themed favicon and the icon
  raster scripts all draw from; `app/icon.svg` is the sole exception, a static
  file that can import nothing, so change it in the same edit). It replaced `public/run-as-one-logo.png` (the old
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
  2.8:1 and a thin stroke at that contrast reads as a smudge. **The
  dashboard's Dark Mode switch sets `data-theme`** (on its frame and on the
  root) — the component does not change. A logo on an unusual surface can likewise be
  re-tinted by setting `--logo-ink` on its container.
- **The dashboard is themed through tokens, never `dark:` branches**
  (`LIGHT_THEME_PLAN.md`). `globals.css` `:root` holds the dark values and
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
- **The three brand assets outside the component, and why each is a different
  file.** They are not interchangeable and the favicon is not any of the others:
  - **`app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png` — the mark alone,
    no wordmark**, since a tab icon is ~16px. The SVG carries literal colours and
    its own `prefers-color-scheme` rule (a favicon is fetched as a standalone
    document and never sees the page's stylesheet) and wins in every modern
    browser; the `.ico` is the old-browser and crawler fallback and the Apple
    icon is what iOS puts on a home screen. Both are regenerated from the mark
    with `sharp` — pure geometry, so they rasterise without needing a font.
  - **`app/opengraph-image.png` — the 1200x630 card a shared link shows.** This
    is what Messenger, Viber, Facebook, X and Slack scrape, and **it has nothing
    to do with the favicon**: before it existed a shared link showed no image at
    all. Next turns the file into `og:image` on its own, but only once
    `metadataBase` is set in `layout.tsx` — a preview will not resolve a relative
    path. `SITE_URL` in `site-contact.ts` is that base, and **it has to be a
    hostname this Vercel project actually serves**: it once named a
    `*.vercel.app` host the project had never been assigned, which broke nothing
    in a browser but pointed `og:image` at a URL Facebook could not fetch, so
    the crawler substituted the featured event's poster and captioned the card
    with a domain that did not exist. `opengraph-image.alt.txt` beside the PNG
    supplies the card's `og:image:alt`.
  - **`public/email/run-as-one-logo.png` — the full lockup for the email
    header**, 3x for a 224px display width. Email needs a raster: Gmail strips
    inline SVG and no client resolves the app's CSS variables. It moved out of
    the Blob store it used to live in and into `public/`, so it ships with the
    code that renders it instead of being a file somebody uploaded by hand and
    versioned nowhere.
  **Every one of them is exported with a transparent background** — this is the
  project's rule for brand assets, decided knowing the cost, so never bake a
  full-bleed background plate back in to make one safer. The ink is white, so
  each asset depends on the surface behind it being dark; the email header cell
  holds `#050505`, and the icons sit on browser and OS chrome that is dark more
  often than not.

  **The Open Graph card is the one asset that carries its own ground**, because
  it is the one nobody else's surface can be trusted for: it was demonstrably
  reduced to two coloured arcs when a light-mode preview composited it onto
  white. It gets an **inset rounded panel, not a full-bleed plate** — `#050505`
  with the app's own hairline border, a 30px transparent margin all round, and
  the radial glows and the orange→blue rule living inside it. 30px is not
  arbitrary: some platforms crop a 1.91:1 card to 2:1, taking 15px off the top
  and bottom, and a tighter margin would leave the panel looking clipped rather
  than deliberately inset.
- **The favicon follows the theme; the Open Graph card cannot, ever.** This is
  the one asymmetry worth understanding before someone tries to "fix" the
  second. `components/ThemedFavicon` (mounted in the root layout) rewrites the
  SVG icon link to a data URI whenever the theme changes, taking an explicit
  `data-theme` first and the system `prefers-color-scheme` otherwise — the same
  precedence `globals.css` uses, so the light/dark switch will not have to
  remember to tell the favicon about itself. It swaps the `href` rather than
  leaning on the `prefers-color-scheme` rule inside `app/icon.svg`, because
  whether a browser *evaluates* a media query inside a favicon differs between
  Firefox, Chrome and Safari and has changed more than once; the static file
  stays as the pre-hydration and no-JavaScript default. **The Open Graph card
  has no equivalent and no workaround**: `og:image` is one static URL that
  Facebook's, Slack's and X's crawlers fetch server-side, cache on their own
  infrastructure and serve to every viewer alike. The crawler sends no
  colour-scheme signal, the cached image is shared between a light-mode and a
  dark-mode viewer, and no platform negotiates alternates. A card therefore has
  to be legible on any ground *by design*, which is exactly why this one carries
  its own inset dark panel rather than borrowing the platform's background.
  **Regenerating the two with a wordmark means rendering them in a browser**,
  where the real Outfit face is loaded — rasterising SVG `<text>` outside one
  picks up whatever font the rasteriser happens to find.

  **Changing the lockup means patching both wordmark rasters**, and neither
  can be regenerated from source, because there is no source — they were
  rasterised from a browser once and committed. They are patched in place with
  `sharp` on the raw pixels. When the byline was removed, its rows were cleared
  and the wordmark was moved down by 0.13 of the mark's em — half the byline's
  line box plus the gap it sat behind, which is exactly where the live component
  now centres the wordmark (16px in the 3x email PNG, 18px on the OG card). The
  OG card's text sits on the panel's gradient, so its box is rebuilt by
  interpolating each column between clean rows above and below, the white
  wordmark's coverage is recovered against that rebuilt ground, and it is
  composited back at its new height; the email lockup sits on transparent
  ground, so its rows are simply moved. A line that has to be *added* is drawn
  in a canvas on a page where the real face is loaded, measured against the
  PNG, and composited the same way. Patching leaves every other pixel of both
  assets byte-identical, which is worth more than a clean re-render that would
  drift.

  **A re-cut email logo also needs its URL bumped and a deploy to `main`.**
  `LOGO_URL` in `lib/email.ts` carries a `?v=` (`LOGO_VERSION`) that must change
  with the PNG: Gmail's image proxy caches each image URL on Google's side and
  keeps serving that copy, so a new file behind an old URL still shows the old
  picture. And the URL is built on `SITE_URL`, the production domain, so an email
  sent from localhost or a preview shows whatever production serves — a re-cut
  logo once sat fixed on `dev` while every test email kept showing the old one,
  because `main` had not been deployed.
- Commit style: `feat:` / `fix:` / `refactor:` plus a sentence saying what changed
  for the user.

