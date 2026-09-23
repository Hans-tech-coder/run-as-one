# Dashboard shell plan

The frame every `/admin` page is drawn inside — `admin/DashboardShell.tsx`, the
links `admin/AdminShell.tsx` hands it, and the shell half of `admin/Admin.css`.
Scope is **Run As One's own dashboard** (Super Admin, admins, staff). The client
viewer's screens (`admin/ViewerDashboard.tsx`) are out of scope; the viewer sees
the same frame, so every change here is checked against a sidebar that holds
Dashboard alone.

| Batch | What | State |
| --- | --- | --- |
| 1 | The menu finds its place again: sub-route active state, grouped sections, quick jump, footer, skip link | **Landed (dev)** — complete |
| 2 | Quick jump reaches events by name (search API) | **Landed (dev)** — complete |
| 3 | The shell owns the header: retire `--dash-accessory-w`, add breadcrumbs | **Landed (dev)** — complete |

**All three batches have landed; the plan is finished.** Batches 2 and 3 were
staged deliberately — the owner chose to do the header work as its own batch
("sariling batch mamaya"), and the project's rule is one batch per session — so
each was started fresh from this file.

---

## What was wrong

Read against the shell as it stood at `9b2f7ea`:

1. **The menu lost its place on every detail page.** The active row was
   `pathname === item.path`, so 7 of the 24 dashboard pages —
   `/admin/events/new`, `/admin/events/[id]/edit`, `/pacers`, `/registrants`,
   `/registrants/[runnerId]/consent`, `/results`, and
   `/admin/remittances/[eventId]` — highlighted **nothing**. Those are the pages
   staff spend the most time on.
2. **Nine flat rows under one MENU label.** `AdminShell` already ordered them by
   meaning ("Run As One's own screens sit between the race work and the people
   work") but nothing showed it.
3. **The logo was dead chrome** — not a link back to `/admin`.
4. **No skip link**, so the keyboard had to walk the whole menu to reach the page.
5. **No way to jump.** Nine sections plus four settings pages, reachable only by
   reading the sidebar.
6. **The collapsed rail could not scroll.** `overflow: visible` was set on
   `.admin-nav` so the tooltips could escape it, which meant a short viewport or
   a zoomed browser put the last rows out of reach entirely.

## Batch 1 — what landed

- **Sub-route active state.** `isActivePath()` — exact for `/admin`, prefix for
  everything else. `aria-current="page"` follows it.
- **Grouped menu.** `DashboardNavGroup[]` replaces the flat `DashboardNavItem[]`:
  Dashboard alone, then **Races** (Events, Marketing Tools), **Platform**
  (Remittances, Clients, Communities, Feedback), **Organization** (Team,
  Activity). Empty groups are dropped. A group's **label only renders when two or
  more labelled groups survive the role filter**, so a validator with Dashboard
  and Events sees no labels and a client viewer sees none either — a label earns
  its place only when it distinguishes. The hairline between groups is always
  drawn, and the labels collapse to nothing on the rail on the same clock as the
  width.
- **The logo is a link** to `/admin`, with its own focus ring.
- **Skip to content** as the first focusable thing on the page, to `#dash-main`.
- **Quick jump (⌘K / Ctrl+K)** over the nav and the settings pages — a
  `.t-modal` combobox, the same object as `AlertModal`. A row in the sidebar
  under the brand makes it discoverable rather than leaving it to a shortcut no
  one is told about.
- **Sidebar footer:** *View public site*, opening `/` in a new tab.
- **The rail scrolls again.** The tooltip is one shell-level element positioned
  from the row's rect, so it is no longer clipped by the menu's scroll box and
  `overflow: visible` is gone.

### Corrected after the owner saw it

Three things shipped wrong and were fixed in the same batch. They are written
down because each is easy to reintroduce:

- **A `[` shortcut folded the rail**, advertised as a bare bracket on the end
  of the chevron's tooltip — "Expand menu [", which read as a typo. The owner
  asked for no `[` at all, so **both the chip and the keybinding are gone**. A
  shortcut nobody is told about is a surprise, not a feature. Only the search
  row shows a key now, the ⌘K the owner asked for.
- **The whole page jumped 200px on every hover.** The tooltip was rendered
  between `</aside>` and `<main>`, which stopped
  `.admin-sidebar.is-collapsed + .admin-main` from matching, so the page lost
  the rule narrowing it to the 80px rail and sprang back to the 280px margin.
  The tooltip renders after `<main>` now, and those selectors were changed to
  `~` so nothing put between the two can break them again.
- **The rail flickered as the pointer swept it.** Per-row `mouseenter` /
  `mouseleave` destroyed and rebuilt the tooltip between every pair of icons,
  replaying its open delay and fade each time. One delegated handler on the
  menu moves the element instead. Its left edge is measured from the rail, not
  from the row, so the chevron's protruding button no longer throws its tooltip
  further out than the rest.

## Batch 2 — what landed

Batch 1's quick jump searched a list already in the browser. It now also
reaches **a single race by name**: typing "pink" and pressing Enter lands on
Pink Run 2026's registrants, which was this batch's acceptance test and is
verified.

- **`GET /api/admin/search`** (`api/admin/search/route.ts`). `?q=` matched
  against event titles, case-insensitively, answering
  `{ events: [{ id, title, day, href }] }`. Signed-in only (401), and what
  comes back is `reachableEvents(actor, 'registration:view')` — the same gate
  the registrants page enforces, asked of `actor.ts` rather than re-derived
  here. A **client viewer** holds `event:view-summary` alone, so that `where`
  is empty for one and its palette stays the Batch 1 menu.
  - **The match happens on the server for a reason**: shipping every title to
    the browser so it could filter there would hand a STAFF member the names of
    the races they were deliberately not assigned to.
  - A query under **2 characters** is answered `{ events: [] }` with no
    database call; results are capped at **8**. The palette is a way to *one*
    known thing, and the menu's own rows have to stay in view underneath it.
  - **Registrants is the destination**, not the edit form: a person typing a
    race's name on event day is looking for the people in it. The heading
    (*Event registrants*) says so, so the jump is never a surprise.
- **Debounced fetching in `DashboardQuickJump`** — 180ms, one `AbortController`
  per run, hits appended under their own heading **below** the static rows.
  Each row carries the race's day (`.dash-jump-row-meta`), so two similar
  titles are told apart; the title ellipsises against it.
- **The static list stays answerable with no network.** It renders from the
  first keystroke and is never displaced, and a failed fetch records an empty
  result **silently** — no error state at all. An error banner over rows that
  still work would take away the one thing the palette can always do.

### Worth not re-deriving

- **The search's state is derived, not stored.** `searching` is "the last
  answer's needle ≠ the field's", and the previous rows stand only while the
  word they answered is being extended or backspaced (`holds`). Storing it
  meant clearing state synchronously in an effect body, which this repo's lint
  refuses (*"Calling setState synchronously within an effect can trigger
  cascading renders"*) — and deriving it also fixed the real bug behind that
  rule: a cleared box followed by a new word briefly showed the previous
  search's race.
- **`live` beside the `AbortController`.** Aborting rejects the fetch, whose
  `catch` runs *after* the next request is already out; without the flag that
  rejection publishes an answer to a search nobody is making any more.
- **Results append, never interleave**, so an answer arriving between a
  keystroke and Enter cannot move the row the cursor is already on.
- **The group heading is *Event registrants*, not *Races***. *Races* is the
  sidebar's own group label: a static match under it followed by event rows
  under the same name would render **no** heading for the events (the heading
  only draws when the group changes), and the races would read as menu rows.

Checked at 360px: no horizontal overflow, the date holds its place, the title
ellipsises against it. Docs updated in the same change — §6 (the route), §9
(the three rules a networked palette follows), §10.

## Batch 3 — what landed

The bell and the account menu used to be a zero-height sticky slot at the top
of `<main>`, with a `ResizeObserver` writing their measured width to
`--dash-accessory-w` so that each of **25** page files could pad its own
`.admin-header` clear of them. Every new page had to remember it.

- **`admin/DashboardHeader.tsx`** draws every page's header. A page passes
  `title`, optional `crumbs` and optional `actions` (the consent sheet's Print
  button is the only one today); `loading` draws the title as the pulsing bar
  for `AdminRouteLoading`. All 25 hand-written `<header className="admin-header">`
  blocks are gone.
- **The tools ride in the header's own row.** `DashboardShell` hands
  `headerAccessory` down through `HeaderToolsProvider` (context), and
  `DashboardHeader` renders it as the last flex item. There is nothing to
  measure, so the `ResizeObserver`, `--dash-accessory-w`,
  `.dash-header-accessory` and `.has-header-accessory` are all deleted.
  A long title ellipsises (from `lg` up) or clamps to two lines (below) against
  the tools instead of being padded clear of them.
- **Breadcrumbs replace `.admin-back-link`** on the eight deep pages, and the
  class is gone. The trail is the ancestors; the page is the `<h1>` under it:
  - New / Edit Event → `Events` › *Create New Event* / *Edit Event*
  - Pacers, Registrants, Results → `Events › {event}` › *Pacers* / *Registrants*
    / *Race Results* (the titles lost their "for {event}" — the name is in the
    trail, one line up, not dropped)
  - Consent → `Events › {event} › Registrants` › *Guardian Consent: {child}*
  - Remittance detail → `Remittances` › *{event}*
- **An event crumb is plain text, not a link.** There is no
  `/admin/events/[id]` page — an event is reached through its four screens —
  and a crumb linking to one of them would make the trail lie about where it
  goes on the other three.
- **The trail is one line at every width.** The first crumb keeps its word; the
  ones after it ellipsise, so a long race name shortens on a phone rather than
  disappearing. Crumb links are 44px targets by padding and negative margin.
- **The header is `z-index: 45`** (was 40) — what the floating slot had — so
  the account menu dropping out of it still clears anything a page positions
  beneath, and it is `position: relative` rather than `static` below `md` for
  the same reason: it scrolls with the page there, as before.

Docs updated in the same change — §6 (the bell's placement), §9 (the header
convention, the back-link line), §10, and the guide's plan table.
