# Mobile-responsive dashboards — work plan

An organizer's race-day work happens away from a desk: validating a bank
transfer at the kit pickup table, looking up a runner at the start line,
pausing sign-ups from a phone. Today the organizer admin (`/admin/**`) and the
platform owner's dashboard (`/superadmin/**`) are desktop screens. Every table
scrolls sideways, the toolbar chips run off the edge, and the floating menu
button sits on top of the page header. This plan makes both dashboards fully
manageable on a phone **without a single horizontal scroll**.

Written the way `STAFF_ACCESS_PLAN.md` was: **one batch per session**, in order,
each batch landing whole. Each batch has its own file in this folder, so a
session loads only the batch it is doing.

## How to run a session

Start the session with:

> Basahin ang `MOBILE_RESPONSIVE_PLAN/README.md` at gawin ang Batch N.

Then, in this order:

1. Read `PROJECT_GUIDE.md`, then this README, then **only** `BATCH_N_*.md`.
2. Use the project's `ui-ux-pro-max` skill for layout decisions, and
   `transitions-dev` for anything that animates.
3. Do that batch and nothing past it. If a later batch's problem is noticed,
   write it into that batch's file instead of fixing it now.
4. Verify it (see [Verification](#verification)), including the regression
   pass on desktop.
5. Update the Status table below, add a short "what landed" note to the batch
   file, and update `PROJECT_GUIDE.md` in the same change.
6. Stop. **Do not commit or push** — report, and wait for the owner's word.

## Status

| Batch | File | Scope | Status |
| --- | --- | --- | --- |
| 1 | [BATCH_1_SHELL.md](BATCH_1_SHELL.md) | Shared shell (admin + superadmin), menu, header, toolbar, modal frame, **card component**, Dashboard recent registrations | Landed (uncommitted) |
| 2 | [BATCH_2_EVENTS_TEAM.md](BATCH_2_EVENTS_TEAM.md) | Shared pager and mobile sort, Events list, Team + roles matrix | Landed (uncommitted) |
| 3 | [BATCH_3_REGISTRANTS.md](BATCH_3_REGISTRANTS.md) | Registrants table, its five modals, bulk actions, proof lightbox | Landed (uncommitted) |
| 4 | [BATCH_4_MARKETING_RESULTS.md](BATCH_4_MARKETING_RESULTS.md) | Marketing promotions + modals, race results table + uploader | Landed (uncommitted) |
| 5 | [BATCH_5_SUPERADMIN.md](BATCH_5_SUPERADMIN.md) | Superadmin dashboard, organizers, communities, feedback | Landed (uncommitted) |
| 6 | [BATCH_6_FORMS_FINAL_SWEEP.md](BATCH_6_FORMS_FINAL_SWEEP.md) | Create and edit event forms, settings, sign-in pages, loading skeletons, full sweep of every route | Landed (uncommitted) |

**The plan is finished.** All six batches have landed. This folder is kept for
the reasoning behind each batch and the decisions below; the convention itself
now lives in `PROJECT_GUIDE.md` §9 ("One responsive dashboard", including
"Checking a screen"), and a new screen follows that without reading this plan.

**Git: everything stays local.** Work happens in the current checkout, on
whatever branch it is on. No branch switch, no commit, no push. The owner will
say when the work goes to the `dev` branch.

## Decisions (closed — do not relitigate)

- **Breakpoints follow the public site** (the owner's decision). The homepage
  uses Tailwind's default scale with no custom numbers, and the dashboards use
  the same three:

  | Breakpoint | On the public site | In the dashboards |
  | --- | --- | --- |
  | `sm` 640px | The phone line (55 uses across the home surfaces) | Below it: 16px inputs, full-width buttons, bottom-sheet popovers, full-width modals, single-column forms |
  | `md` 768px | `Navbar` swaps its hamburger for the full nav | Below it: the menu rests as a 56px rail and opens over the page. From it up: it pushes the page and can collapse to an 80px rail |
  | `lg` 1024px | `EventGrid` reaches its 3-column desktop layout | Below it: every data table is a card list. From it up: the table |

  **Between `md` and `lg`** (a portrait tablet) the sidebar is visible and the
  lists are still cards, because 280px of sidebar leaves under 500px for
  content. The card list is an auto-fill grid,
  `minmax(min(100%, 20rem), 1fr)`, so it steps up to two columns on its own
  when there is room, the way `EventGrid` steps up.

  **No one-off numbers**: no 900px, no 1023.98px.
  - In a CSS file, write range syntax at Tailwind's own values:
    `@media (width < 40rem)`, `(width < 48rem)`, `(width < 64rem)`. These never
    overlap `sm:` / `md:` / `lg:` on fractional widths.
  - In TSX, use `max-sm:` / `max-md:` / `max-lg:` and `sm:` / `md:` / `lg:`.
  - The existing `max-width: 1024px` rule in `Admin.css` moves onto this scale.

  **The desktop above 1024px is not redesigned by this plan.** Today the
  sidebar hides at exactly 1024px; after Batch 1 it shows from 768px. Batch 6's
  sweep measures the wide tables at 1024 and 1280 and reports any that still
  scroll, for the owner to decide. It does not hide columns, because a column
  is information.
- **Tables become cards; they never scroll sideways.** No `overflow-x-auto`
  wrapper survives as the mobile answer for a data table.
- **Cards and table read the same rows.** A TanStack screen hands
  `table.getRowModel().rows` to the card list, so search, filter chips, sort,
  selection and pagination are shared and cannot drift. The toolbar and pager
  stay; only the body swaps. The "One admin table" convention is extended, not
  forked.
- **Both layouts render, and CSS picks one.** It uses the shared
  `.dash-desktop-only` / `.dash-mobile-only` classes that Batch 1 defines. This
  was chosen over a `matchMedia` hook because a hook renders the wrong layout
  on the server and then flashes; CSS has no hydration mismatch and no layout
  shift. The cost is a second copy of at most 50 rows per page. That is
  acceptable, but it brings three hazards to watch:
  - No duplicated `id` attributes between the table and the cards.
  - No `ref` that assumes one element per row.
  - Per-row UI state (an expanded batch row, an open disclosure) lives in the
    parent, so resizing across 1024px keeps it.
- **One menu at every width, not a phone drawer or bottom navigation.**
  *(Revised by the owner after Batch 1.)*
  - Batch 1 first built a top bar and slide-in drawer, and the owner rejected
    a phone menu that looks different from the desktop's.
  - The sidebar is now the same collapsible menu everywhere. Below `md` it
    rests as a 56px icon rail and opens out over the page; from `md` up it
    pushes the page and collapses to an 80px rail.
  - A bottom bar was never an option: the organizer switcher, the user block
    and logout need a home.
- **One shell for both dashboards.** `AdminShell` and `SuperAdminShell` are
  near-copies today, so Batch 1 extracts the shared frame and both become thin
  wrappers holding only their nav items and role line. The superadmin gets the
  menu for free.
- **On mobile, sort moves into a Sort chip**, because cards have no column
  headers to click.
- **Hover-only information is shown in text on touch.** For example, the team
  table's "why you can't manage this row" tooltip becomes a visible line on
  the card. Nothing a label shows today is dropped.

## Definition of done — every batch, and every future feature

`PROJECT_GUIDE.md` §8 makes this a standing rule, so it applies to work outside
this plan too.

- [ ] No horizontal scroll at 360, 390, 767 and 820px. Checked with the script
      below, not by eye.
- [ ] Desktop at 1280 and 1440px looks exactly as it did before, on every
      screen that uses anything the batch touched.
- [ ] Data tables below 1024px are cards built from the shared card component.
      Nothing gets a local rival.
- [ ] Touch targets are at least 44×44px, with at least 8px between neighbours.
- [ ] Any field a person types into is 16px below 640px, so iOS does not zoom.
- [ ] Modals fit the viewport (`max-height` in `dvh`), scroll inside, and keep
      their primary button reachable.
- [ ] Dropdowns and menus stay inside the viewport at 360px.
- [ ] Long, untrusted text (names, emails, references, event titles) wraps or
      truncates. It gets `min-w-0` and `overflow-wrap: anywhere`; `nowrap`
      goes only on chips.
- [ ] Motion respects `prefers-reduced-motion`.
- [ ] `npm run lint` is clean for the touched files, and `npx tsc --noEmit`
      passes.

## Verification

**Sign-in:** Claude may not type a password. At the start of the session, ask
the owner to sign in once in the Browser pane: an owner account for Batches
1–4 and 6, and a super admin for Batch 5. A staff account is useful for the
role-dependent nav in Batch 1.

**Widths:** use `resize_window` at these sizes, and reset it to `desktop` when
done:
- 360×780 and 390×844: phones.
- 767×1024: just under `md`, where the menu is a rail that opens over the page.
- 820×1180: a portrait tablet, with the sidebar and the cards.
- 1024×768: `lg`, where the tables return.
- 1440×900: desktop.

**Overflow check.** Run it on every route touched, at each phone width. It must
return `ok: true` with an empty list.

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

The resting rail stays inside the viewport, so it does not trip the check. An
opened menu, open popovers and modals must be checked separately, while open.

**Regression pass:** before editing shared CSS (`Admin.css`, `globals.css`) or a
shared component, take 1440px screenshots of the screens that use it. Compare
them after the change.

**Live data:** the registrants, marketing and superadmin screens show real
orders; see the pinned note on PENDING registrations. While verifying, only
open things and cancel them — menus, modals, the lightbox. Never validate,
save, send, pause or delete a row just to see the layout.

## Routes in scope

Admin:
- `/admin`
- `/admin/events`, `/admin/events/new`, `/admin/events/[id]/edit`
- `/admin/events/[id]/registrants`, `/admin/events/[id]/results`
- `/admin/marketing`, `/admin/team`, `/admin/settings`
- `/admin/login`, `/admin/register`, `/admin/invite/[token]`
- the admin 404

Superadmin:
- `/superadmin`, `/superadmin/organizers`
- `/superadmin/communities`, `/superadmin/feedback`
- the superadmin 404

The public site is out of scope. It is already built mobile-first.
