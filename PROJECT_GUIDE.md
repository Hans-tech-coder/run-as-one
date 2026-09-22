# Run As One — Project Guide

**Read this file before touching the codebase.** It is the index to the briefing on
what this app is, how it is built, and the rules it holds itself to, so a fresh
session can start work without reading every file first.

**This file is deliberately short.** It carries only what every session needs: the
product in a paragraph, the stack and its hard constraints, the directory map, and
the standing rules. The detailed parts — the data model, the domain rules, the
routes, the security model, the conventions and the current state — live in `docs/`
and are read **only when a task touches them**. Section numbers are unchanged, so a
"§5" written anywhere in the docs still means the same part; the routing table in
[§0](#0-where-the-rest-of-the-guide-lives) says which file holds it.

It is a map, not a substitute for the code: the files it names carry the detailed
reasoning in their own header comments, and those comments are the authority when
the two disagree.

**Keep it current.** Every feature, schema change, route, or convention that lands
must be reflected in the right part in the same change — see [Keeping this guide
updated](#keeping-this-guide-updated) at the bottom.

---

## 0. Where the rest of the guide lives

**Read only the part your task touches.** Each file is self-contained; none of them
need to be read in full to start.

| If the task… | Read | Size |
| --- | --- | --- |
| adds or changes a **Prisma model or column**, or asks what a field means | [`docs/data-model.md`](docs/data-model.md) — §4 | 21 KB |
| touches **money, discounts, promos, pacers, registration eligibility, consent, uploads, email, permissions, the audit trail** — anything with a rule behind it | [`docs/domain-rules.md`](docs/domain-rules.md) — §5 | 92 KB |
| adds or changes a **page or an API route**, or asks what a screen already does | [`docs/routes.md`](docs/routes.md) — §6 | 79 KB |
| changes **who may reach or see what** — auth, scopes, roles, gating | [`docs/security.md`](docs/security.md) — §7 | 13 KB |
| writes **UI** — a table, a form field, a button, a badge, a loader, motion, the logo, theming | [`docs/conventions.md`](docs/conventions.md) — §9 | 67 KB |
| needs to know **what has shipped and what is still open** | [`docs/current-state.md`](docs/current-state.md) — §10 | 32 KB |
| needs to find **which files a feature lives in** | [`docs/FEATURE-MAP.md`](docs/FEATURE-MAP.md) — generated | small |

**Start with `docs/FEATURE-MAP.md`.** It names the files behind each feature, so a
task can go straight to two or three files instead of searching for them. Regenerate
it with `node scripts/gen-feature-map.mjs` after adding a route or a `src/lib`
module.

### Plan documents at the repo root

The `*_PLAN.md` files are working documents for one piece of work each. **Read one
only if the task is inside it.** A finished plan is history, not instructions — the
guide and the code are the authority, and a finished plan's rules are already
folded into §5 and §9.

| Plan | State |
| --- | --- |
| `ADMIN_MERGE_PLAN.md` | **active** — batches 1–6 on `dev`, release pending |
| `PACER_DISCOUNT_PLAN.md` | **active** — batch 2 open |
| `STAFF_ACCESS_PLAN.md` | **active** — phases 4 and 5 not started |
| `GUARDIAN_CONSENT_PLAN.md` | done |
| `LIGHT_THEME_PLAN.md` | done |
| `MARKETING_DISCOUNTS_PLAN.md` | done |
| `SETTINGS_PLAN.md` | done |

They stay at the root rather than moving to `docs/`, because more than a hundred
header comments across `src/**` cite them by that path. When a plan finishes, mark
it done in this table instead of deleting it.

**§5 is the big one and it is a table.** When a task touches one subject, grep
`docs/domain-rules.md` for that module's name rather than reading the file whole:

```bash
grep -n "discount.ts" docs/domain-rules.md
```

---

## 1. What the product is

Run As One is a **running-event registration and results platform for the
Philippines**. Three groups use it:

| Who | What they do | Where |
| --- | --- | --- |
| **Runners** (public, no account) | Browse upcoming races, register solo or as a group, pay, and later look up their times and download an e-certificate | `/`, `/events`, `/events/[slug]`, `/results`, `/results/[slug]` |
| **Run As One staff** (the owner — shown as Super Admin — admins and per-event staff) | Create and run every event, validate every payment, see registrants, upload race results and run promo codes; owners and admins (`platform:manage`) also read client submissions and **send the invite** that lets one sign in, curate the shared running-club list, read feedback and watch the platform fees collected — in the same dashboard. There is no separate super admin: the portal merged in `ADMIN_MERGE_PLAN.md` Batch 2 (old `/superadmin/**` addresses redirect), and the super admin account and every approve / reject path were retired in Batch 5. **Only Run As One's own Organizer row signs in as an owner** | `/admin/**` |
| **Clients** (organizations Run As One runs races for) | Apply through `/admin/register` — no password — and wait on `/admin/clients`. Staff press **Send invite**; the contact chooses a password from the email and signs in as a **client viewer**, which sees its own events' registrant counts and nothing else | `/admin/register`, `/admin/invite/[token]`, `/admin` |

Runners pay **Run As One** through PayMongo or a direct bank transfer, and Run
As One settles with the organizer afterwards: it keeps the platform fee (the
per-runner `Event.adminFee`) and the transaction fee the runner paid on top for
PayMongo, and owes the organizer the rest of every PAID order — tracked per
event on `/admin/remittances` (`ADMIN_MERGE_PLAN.md` Batch 6, §5
`settlement.ts`).

---

## 2. Stack and hard constraints

- **Next.js 16.2 (App Router) + React 19**, TypeScript, deployed on **Vercel**.
- **This is NOT the Next.js in your training data.** Breaking API and convention
  changes. **Read the relevant guide in `node_modules/next/dist/docs/` before
  writing Next-specific code.** Two changes that bite immediately:
  - Route params are **async**: `{ params }: { params: Promise<{ id: string }> }`,
    then `const { id } = await params;`.
  - `middleware.ts` is now **`src/proxy.ts`**, default-exporting `proxy()`.
- **Prisma 7 + `@prisma/adapter-pg`** against **Neon Postgres**.
- **Tailwind CSS v4** (`@import "tailwindcss"` + `@theme`) alongside hand-written
  CSS files and CSS custom properties in `src/app/globals.css`.
- **Vercel Blob** for every uploaded file. There is **no local filesystem
  fallback** — Vercel's disk is read-only, so `writeFile` is never an option.
- Other notable deps: `jose` (JWT), `bcryptjs`, `pdf-lib` (e-certificates),
  `xlsx` (results import / registrant export), `@tanstack/react-table`,
  `framer-motion`, `gsap`, `lucide-react`.
- **Production is live** at `https://run-as-one.cresendorunningcommunity.com`
  — Vercel project `run-as-one`, linked to `Hans-tech-coder/run-as-one`. Every
  push to `main` deploys to production; there is no manual deploy step. That
  custom domain is the *only* public hostname the project answers on, and it is
  what `SITE_URL` in `lib/site-contact.ts` must name.
- **Work lands on `dev`, not `main`.** Because a push to `main` ships to
  production, day-to-day commits go to the long-lived `dev` branch, and every
  push to `dev` gets its own Vercel preview deployment. `main` is only advanced
  — by fast-forwarding it onto `dev` and pushing — when the owner explicitly
  asks to deploy. The local checkout (which the owner runs `localhost:3000`
  from) tracks `dev`. Never push to `main` without being told to.
- **Hosting budget matters.** Vercel + Neon's free 0.5 GB Postgres tier. Weigh
  storage cost before proposing schema growth, and say so when you do.

### Commands

```bash
npm run dev        # dev server on :3000 (use the Browser pane / launch.json, never a raw shell server)
npm run build      # prisma generate + next build (see below)
npm run lint
npm run seed:dev   # scripts/seed-dev.ts
npm run uppercase:existing  # brings pre-uppercase-rule rows into line; --write to apply
npm run test:blob  # scripts/test-blob.ts — exercises both blob stores
```

`npx prisma migrate dev` / `npx prisma generate` for schema work. Migrations run
DDL through `DIRECT_URL` (see `prisma.config.ts`); the app itself uses the pooled
`DATABASE_URL` (see `src/lib/db.ts`).

**`npm run build` runs `prisma generate` before `next build`, and must keep doing
so.** The generated client is git-ignored, and a fresh install on Vercel does not
run Prisma's postinstall hook (npm now withholds install scripts it has not been
told to allow), so without that step the build type-checks against a client that
is not there and fails.

### Environment (`.env`, mirrored in `.env.example`)

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection, used at runtime |
| `DIRECT_URL` | Neon **direct** connection, used by Prisma Migrate (DDL cannot cross PgBouncer) |
| `JWT_SECRET` | Signs the admin session cookie. The app refuses to boot without it |
| `BLOB_READ_WRITE_TOKEN` | **Public** blob store: event banners, race-kit posters, certificate templates |
| `PROOFS_BLOB_READ_WRITE_TOKEN` | **Private** blob store: payment receipts |
| `PAYMONGO_SECRET_KEY`, `NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET` | PayMongo |
| `RESEND_API_KEY` | Resend — sends every email in the app (registration emails, team and client invitations) from the **admin email** set at `/admin/settings` when it is on `@cresendorunningcommunity.com`, otherwise from `info@cresendorunningcommunity.com` with the admin email as reply-to (the key is **send-only**, so the app cannot ask Resend which domains are verified — see `EMAIL_SENDING_DOMAIN` in `site-contact.ts`). Unset in dev just skips the send and reports it as not sent (see `lib/email.ts`). **Set in the local `.env` too, so an invitation sent on localhost reaches the real inbox** |
| `CRON_SECRET` | Guards `/api/cron/expire-pending`, the daily abandoned-checkout sweep. Vercel Cron sends it as `Authorization: Bearer …`; **unset, the route refuses to run rather than running unguarded** |

### Databases: production and development are separate Neon branches

**Local development must never dial the live database.** Until this was split,
`.env` and the deployed site pointed at the same Neon branch, so a `prisma
migrate reset`, a seed script, or a stray `deleteMany` on a laptop would have
destroyed real customer orders — including bank-transfer registrations sitting
`PENDING` while a runner waits for their slot to be confirmed.

Neon project **`run-as-one`** (`wispy-rain-76789112`, free tier, 10 branches,
0.5 GB):

| Branch | Endpoint | Used by |
| --- | --- | --- |
| `dev` — **this is production**, `br-calm-darkness-b3tqh63k` | `ep-still-pine-b3n210bs` | The live site (Vercel Production). Holds every real registration and all 2,149 race results. |
| `local-dev`, `br-dry-grass-b3ubrfhy` | `ep-shiny-sunset-b3gzfro9` | The local checkout's `.env`. A copy-on-write branch of production. |
| `legacy-empty-root`/`production`, `br-spring-pine-b35lahiy` | `ep-silent-pond-b38yfoxa` | Nothing. The original root branch, **it has no tables at all** and never held data. Kept only because Neon cannot delete a root branch. |

**The branch named `dev` is the production database.** The names are backwards
because the project was built on the branch Neon created second, and the
rename is a console-only step that has not been taken. Go by the endpoint, not
by the name: `ep-still-pine-b3n210bs` is live.

**Syncing production data down is a Neon branch reset, not a feature.** To
refresh `local-dev` with what production holds now, reset it from its parent in
the Neon console (Branches → `local-dev` → Reset from parent). It is instant and
nearly free, because a branch stores only its diff. There is deliberately **no
"sync from production" button inside the app**: such a button would ship a
code path that exports every customer's personal data into the production
bundle, hidden behind a flag that is one environment-variable mistake away from
being on, and it would require production credentials to be reachable from a
developer's machine — the exact coupling the split removes.

**`git push` never touches a database.** Promoting `dev` to `main` ships code
only. The only things that can write to production are the running app and
whatever a connection string is pointed at, which is why the protection lives
in `.env` and in the guard below rather than in the branching workflow.

**Every maintenance script calls `assertNotProduction()` first**
(`scripts/guard-environment.ts`). It refuses to run when `DATABASE_URL` or
`DIRECT_URL` names the production endpoint, and refuses equally when neither is
set. It checks the **host**, not `NODE_ENV`: `NODE_ENV` is a property of the
process and reads "development" on a laptop no matter which database that
laptop is dialling. Any new script in `scripts/` that writes must call it too.

**Migrations no longer reach production by themselves.** They used to, because
the two shared a branch. `npm run build` still runs `prisma generate` only —
deliberately, since a build that silently mutates the production schema is a
build that can break the live site without anyone asking it to. A schema change
now reaches production as its own step at deploy time, with `DIRECT_URL`
pointed at `ep-still-pine-b3n210bs`:

```bash
npx prisma migrate deploy
```

**Still shared, and still a hazard:** both Vercel Blob stores are common to
local and production. Deleting an event banner or a payment proof locally
deletes it from the live site too.

Two blob stores, not one: a store's access level is fixed at creation, so a
single store cannot hold both public and private blobs.

**Scheduled work lives in `vercel.json`.** One cron entry today — the
abandoned-checkout sweep at `0 18 * * *` (18:00 UTC = 02:00 Manila, the quietest
hour for a job that cancels orders). **Vercel's Hobby plan runs a cron at most
once a day** and within the hour rather than on the minute, so nothing here may
be designed around a tighter schedule. Vercel Cron issues a **GET**, which is
why that route answers GET as well as POST.

---

## 3. Directory map

```
src/
  proxy.ts                  # route protection (was middleware.ts)
  app/
    layout.tsx              # fonts, metadata, AlertProvider, ClientLayoutWrapper
    globals.css             # design tokens + most global styling
    (home)/                 # `/` — page.tsx showcases upcoming events;
                            #   loading.tsx is its own wait (route group so
                            #   the boundary covers `/` alone)
    events/                 # public listing, event page, registration wizards
    results/                # everything about a race that has been run:
                            #   landing, winners board, leaderboard, one runner
    feedback/               # the public feedback form (page + FeedbackForm)
    coming-soon/ privacy/ terms/ not-found.tsx
    admin/                  # the one dashboard (AdminShell, Admin.css, Auth.css,
                            #   DashboardShell — its frame,
                            #   dashboard-nav.tsx — the sidebar's flags for
                            #   client code such as loading.tsx,
                            #   clients/ communities/ feedback/ — Run As
                            #   One's own screens (platform:manage); the last
                            #   two moved from /superadmin, clients/ replaced
                            #   its organizers screen, remittances/ — what
                            #   each race's organizer is owed and was paid
                            #   (remittance:manage),
                            #   dashboard-sidebar.ts — the collapsed-rail cookie,
                            #   dashboard-theme.ts — the Dark Mode cookie,
                            #   AdminCardList — what every table becomes below lg,
                            #   AdminDataTable — the events table's lg-up frame,
                            #   View chip and No. counter, shared by clients,
                            #   communities, feedback and both remittance lists,
                            #   AdminCardEdit — an inline edit, as a card holds it,
                            #   AdminTablePager / MobileSortMenu — every table's
                            #   pager and its below-lg Sort chip,
                            #   row-menu-position.ts — where a row's menu opens,
                            #   RowActionsMenu — the ⋮ row menu built from an
                            #   item list (clients, clubs, feedback, a race's
                            #   remittances),
                            #   route-loading-shape.ts — what each page's wait
                            #   draws, phone and desktop, bare-paths.ts — the
                            #   pages under /admin with no sidebar,
                            #   AuthRouteLoading — their wait, FiltersMenu —
                            #   every table's one Filters chip and sheet,
                            #   FilterOptions — one group's checkbox list
                            #   inside it, NotificationsCenter — the header
                            #   bell and its notifications modal,
                            #   AccountMenu — the person beside the bell,
                            #   opening the settings pages, the Dark Mode
                            #   switch and Log Out)
                            # (no superadmin/ folder: /superadmin/** is a
                            #   permanent redirect in next.config.ts)
    api/                    # all route handlers — see §6
  components/               # public-site components (Navbar, Footer, EventGrid,
                            #   StatusPanel, RunAsOneLogo, HeroArcBackground,
                            #   PublicRouteLoading…)
  components/ui/            # cross-app primitives: AlertProvider, AlertModal, Toast,
                            #   Skeleton, LinkPending, FieldError, table,
                            #   RunnerLoader, BusyLabel, LinkPendingIcon,
                            #   RunnerOverlay, NotificationBell
  lib/                      # domain logic — see §5. Read these before re-deriving a rule.
  data/mockEvents.ts        # legacy mock data
prisma/schema.prisma        # the data model, heavily commented
vercel.json                 # scheduled work (crons) — see §2
scripts/                    # seed + one-off maintenance scripts
.claude/skills/             # project-scoped skills (ui-ux-pro-max, 21st-*, prisma-*)
```

---

## 8. Standing rules for this project

These are the user's own standing preferences. Follow them without being asked.

1. **No dead links, ever.** A runner or organizer must never hit a placeholder
   `href="#"` or a bare 404. A destination that is not built yet gets a real,
   designed page — that is what `/coming-soon` and `StatusPanel` exist for.
2. **The UI must look expensive and uniform.** Browser and OS default controls
   (native `<select>`, `alert()`, `confirm()`) are unacceptable. A new control
   copies an existing one: `SelectField`, `Combobox`, `BirthdatePicker`, `AdminSelect`,
   `AdminDatePicker`, `AlertProvider`'s
   `alert`/`confirm`, `AlertModal`, `StatusPanel`, `FieldError`, and
   **`.admin-switch-row`** — the admin form's switch (`role="switch"`, the whole
   44px row is the target, `.t-toggle`'s motion from the account menu's Dark Mode
   row, generalised out of `.account-theme-switch` when the Pacers screen needed
   one). A **disabled** switch keeps its hint at full contrast and dims only the
   track: the person who may not use a control is exactly the person who has to
   read why not.
3. **Consult the project's `ui-ux-pro-max` skill for UI/UX work** rather than
   designing ad hoc. Skills stay project-scoped in `.claude/skills/` — nothing is
   installed globally.
4. **Validation messages must be specific.** Name exactly what is missing and
   highlight the offending fields; never a generic catch-all. See
   `app/events/[slug]/register/validation.ts` and `FieldError`.
5. **The home page exists to showcase events.** Events stay the focal point.
6. **Table action icons align under their column header**, never pushed to the
   row's right edge.
7. **Site-wide contact and social details live in `lib/site-contact.ts`**, or in
   `lib/site-settings.ts` once staff can edit them (the admin email and the
   social links already are) — never inline in a component.
8. **Work must reach the user's dev server.** They test on their own
   `localhost:3000` running the **main checkout**, so anything left in a git
   worktree is invisible to them. Edit in the main checkout — that alone is
   enough for them to see the change.
9. **Never commit or push until the user says so.** Finish the work, verify it,
   report it, and leave it uncommitted in the working tree. `git commit` and
   `git push` wait for their explicit command — say plainly that the change is
   sitting there unstaged rather than assuming a finished change should land.
10. **Weigh storage cost** (Neon's free 0.5 GB tier) before growing the schema.
11. **Comment the *why*.** This codebase's header comments explain the reasoning
    behind a decision, not what the code does. Match that voice.
12. **Every screen ships mobile responsive, and a fix never breaks another
    screen.** Organizers run race day from their phones, so the dashboard
    must be fully manageable at 360px. This applies to
    every new or changed feature, in the same change, never "mobile later".
    - **Breakpoints follow the public site**: Tailwind's default `sm` 640 /
      `md` 768 / `lg` 1024. Never a one-off number.
    - **The menu is the same at every width.** It is the collapsible sidebar,
      a narrower rail on a phone. The dashboards never get a separate phone
      top bar, drawer or bottom bar.
    - **No horizontal scroll on a phone, ever.** Below `lg` a data table
      becomes cards through the shared card component, not an `overflow-x`
      scroller.
    - Touch targets are 44px. Typed-into fields are 16px. Modals fit the
      viewport and scroll inside. Menus stay on screen.
    - Responsive fixes go into the shared furniture (shell, toolbar, pager,
      card, modal frame), not page-local hacks. Every other screen using that
      furniture is re-checked at phone *and* desktop widths before the work is
      called done.
    - The full checklist and the overflow-check script are in §9, under
      "One responsive dashboard" → "Checking a screen".

---

## Keeping this guide updated

**Whenever you add or change a feature, update the right part in the same change.**
The guide is split, so update the file that owns the subject — not this index,
unless the change is to the stack, the directory map, or a standing rule.

| What changed | Update |
| --- | --- |
| a **model or column** | `docs/data-model.md` (§4), and `docs/domain-rules.md` (§5) if a new rule module came with it |
| a **page or API route** | `docs/routes.md` (§6), and `docs/security.md` (§7) if it changes who may reach what |
| a **shared module in `src/lib`** | `docs/domain-rules.md` (§5), described by the *rule* it owns, not just its name |
| a **reusable UI primitive** | `docs/conventions.md` (§9), so the next session copies it instead of inventing a rival |
| a **standing instruction from the user** | §8 in **this** file, phrased as a rule |
| the **stack, a command, an env var, the directory layout** | §2 / §3 in **this** file |
| anything **shipped or unblocked** | `docs/current-state.md` (§10) |
| a **new route or `src/lib` module** | also run `node scripts/gen-feature-map.mjs` |

Two rules keep this cheap to load, which is the point of the split:

1. **This index stays under ~250 lines.** If a part of it is growing, it belongs in
   a `docs/` file with a row in §0, not here.
2. **A detail true of only one file belongs in that file's header comment**, and
   only its headline belongs in the guide.
