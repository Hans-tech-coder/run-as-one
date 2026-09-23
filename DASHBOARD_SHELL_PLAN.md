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
| 3 | The shell owns the header: retire `--dash-accessory-w`, add breadcrumbs | **Deferred by the owner**, not abandoned |

Batches 2 and 3 were **staged deliberately**, not left half-done. The owner was
asked when to do the header work and chose "sariling batch mamaya"; Batch 2 was
split off because reaching events by name needs a search route that Batch 1's
client-only quick jump does not. The project's rule is **one batch per
session**, so each of these is meant to be started fresh.

**Batch 3 is still pending and still deferred on purpose.** Everything a cold
session needs to run it is under its own heading below — what
`--dash-accessory-w` does today, why 25 page files each have to remember it,
and where breadcrumbs belong. Nothing about it was started in Batch 2.

## How to run a pending batch

Open a new session in this repository and paste the matching line. Everything
the session needs is in this file — it does not need the conversation that
produced it.

**Batch 3:**

```
Read DASHBOARD_SHELL_PLAN.md and do Batch 3 only. Stop when it is done.
```

When a batch lands, change its row above to **Landed (dev)** and write what
shipped under its own heading, the way Batch 1 is written up below.

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

## Batch 3 — the header (deferred)

The bell and the account menu are a zero-height sticky slot at the top of
`<main>`, and a `ResizeObserver` writes their measured width to
`--dash-accessory-w` so that each of **25** page files can pad its own
`.admin-header` clear of them. It works, but every new page has to remember it.

The shell should own the header bar: one `<header class="admin-header">` drawn by
`DashboardShell`, with the title supplied by the page. That retires the measured
variable, and it is where breadcrumbs belong (`Events › Pink Run 2026 ›
Registrants`) — the dashboard is three levels deep in places, and the
`.admin-back-link` in 11 files is standing in for them today.

It touches ~25 files, so it is its own batch and its own session.
