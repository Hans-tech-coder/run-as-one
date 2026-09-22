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
| 2 | Quick jump reaches events by name (search API) | **Deferred by the owner**, not abandoned |
| 3 | The shell owns the header: retire `--dash-accessory-w`, add breadcrumbs | **Deferred by the owner**, not abandoned |

Batches 2 and 3 were **staged deliberately**, not left half-done. The owner was
asked when to do the header work and chose "sariling batch mamaya"; Batch 2 was
split off because reaching events by name needs a search route that Batch 1's
client-only quick jump does not. The project's rule is **one batch per
session**, so each of these is meant to be started fresh.

## How to run a pending batch

Open a new session in this repository and paste the matching line. Everything
the session needs is in this file — it does not need the conversation that
produced it.

**Batch 2:**

```
Read DASHBOARD_SHELL_PLAN.md and do Batch 2 only. Stop when it is done.
```

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

## Batch 2 — the quick jump reaches events (deferred)

Batch 1's quick jump (`admin/DashboardQuickJump.tsx`) searches a list that is
already in the browser: the menu's rows plus the settings pages, handed to the
shell as `quickJumpExtras`. Reaching **a single race by name** — "pink" landing
on Pink Run 2026's registrants — is what staff will actually want, and it needs
a route, because the events a person may see depend on their role.

What it takes:

- A `GET /api/admin/search` returning events the actor may reach
  (`reachableEvents(actor, 'registration:view')` in `lib/actor.ts` is the same
  gate the Overview uses), matched on title, capped at ~8 rows.
- Debounced fetching in `DashboardQuickJump`, merged under their own heading
  below the static rows, so typing never makes the menu's own destinations
  disappear.
- The static list must stay answerable with no network: a failed or slow fetch
  leaves the menu rows working, never an empty palette.

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
