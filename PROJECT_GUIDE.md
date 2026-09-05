# RunAsOne — Project Guide

**Read this file before touching the codebase.** It is the single briefing on what
this app is, how it is built, and the rules it holds itself to, so a fresh session
can start work without reading every file first. It is a map, not a substitute for
the code: the files it names carry the detailed reasoning in their own header
comments, and those comments are the authority when the two disagree.

**Keep it current.** Every feature, schema change, route, or convention that lands
must be reflected here in the same change — see [Keeping this file
updated](#keeping-this-file-updated) at the bottom.

---

## 1. What the product is

RunAsOne is a **running-event registration and results platform for the
Philippines**. Three groups use it:

| Who | What they do | Where |
| --- | --- | --- |
| **Runners** (public, no account) | Browse upcoming races, register solo or as a group, pay, and later look up their times and download an e-certificate | `/`, `/events`, `/events/[slug]`, `/results` |
| **Organizers** (the paying clients) | Create and manage their own events, see registrants, upload race results, run promo codes | `/admin/**` |
| **Super admin** (the platform owner) | Approve organizer accounts, set per-organizer commission, curate the shared running-club list, watch platform revenue | `/superadmin/**` |

Money flows to the organizer through PayMongo or a direct bank transfer; the
platform takes a per-runner admin fee.

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
- **Hosting budget matters.** Vercel + Neon's free 0.5 GB Postgres tier. Weigh
  storage cost before proposing schema growth, and say so when you do.

### Commands

```bash
npm run dev        # dev server on :3000 (use the Browser pane / launch.json, never a raw shell server)
npm run build
npm run lint
npm run seed:dev   # scripts/seed-dev.ts
npm run test:blob  # scripts/test-blob.ts — exercises both blob stores
```

`npx prisma migrate dev` / `npx prisma generate` for schema work. Migrations run
DDL through `DIRECT_URL` (see `prisma.config.ts`); the app itself uses the pooled
`DATABASE_URL` (see `src/lib/db.ts`).

### Environment (`.env`, mirrored in `.env.example`)

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection, used at runtime |
| `DIRECT_URL` | Neon **direct** connection, used by Prisma Migrate (DDL cannot cross PgBouncer) |
| `JWT_SECRET` | Signs the admin session cookie. The app refuses to boot without it |
| `BLOB_READ_WRITE_TOKEN` | **Public** blob store: event banners, race-kit posters, certificate templates |
| `PROOFS_BLOB_READ_WRITE_TOKEN` | **Private** blob store: payment receipts |
| `PAYMONGO_SECRET_KEY`, `NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET` | PayMongo |

Two blob stores, not one: a store's access level is fixed at creation, so a
single store cannot hold both public and private blobs.

---

## 3. Directory map

```
src/
  proxy.ts                  # route protection (was middleware.ts)
  app/
    layout.tsx              # fonts, metadata, AlertProvider, ClientLayoutWrapper
    globals.css             # design tokens + most global styling
    page.tsx                # home — showcases upcoming events
    events/                 # public listing, event page, registration wizards, results
    results/                # public results landing (finished events)
    coming-soon/ privacy/ terms/ not-found.tsx
    admin/                  # organizer portal (AdminShell, Admin.css, Auth.css)
    superadmin/             # platform-owner portal (SuperAdminShell)
    api/                    # all route handlers — see §6
  components/               # public-site components (Navbar, Footer, EventGrid, StatusPanel…)
  components/ui/            # cross-app primitives: AlertProvider, AlertModal, FieldError, table
  lib/                      # domain logic — see §5. Read these before re-deriving a rule.
  data/mockEvents.ts        # legacy mock data
prisma/schema.prisma        # the data model, heavily commented
scripts/                    # seed + one-off maintenance scripts
.claude/skills/             # project-scoped skills (ui-ux-pro-max, 21st-*, prisma-*)
```

---

## 4. Data model (`prisma/schema.prisma`)

The schema's own doc comments explain *why* each column exists — read them. The
shape:

- **Organizer** — the client account. `role` is `ORGANIZER` or `SUPER_ADMIN`;
  `status` is `PENDING`/approved; `adminFee` is the per-runner commission in
  centavos. Owns `Event[]` and `PromoCode[]`.
- **Event** — title, unique **`slug`**, `date` (**string `YYYY-MM-DD`**, not
  DateTime), location, imagery, logistics fees, `adminFee`, `shirtSizeUpcharge`,
  `consentWaiver` (string[] of paragraphs), `registrationForm`
  (`ONLINE` | `BANK_TRANSFER`), `eventType` (`RACE` | `FUN_RUN`), certificate
  template + coordinates. Owns `Category[]`, `BankAccount[]`, `Registration[]`,
  `RaceResult[]`.
- **Category** — what a runner buys. A `RACE` event's categories carry a
  `distance` (`"10K"`); a `FUN_RUN`'s carry a package `imageUrl` and no distance.
  `inclusions` is a string[]. `price` in centavos.
- **BankAccount** — per event, not per organizer: bank/account name, number kept
  exactly as typed, optional QR image, `sortOrder`.
- **Registration** — one order. `orderRef` unique; all amounts centavos
  (`subtotal`, `deliveryFee`, `platformFee`, `transactionFee`, `totalAmount`);
  `status` (`PAID`, `PENDING`…), `paymentMethod`, `proofOfPayment` (private blob
  **pathname**, not URL), `transactionNumber`, `consentGiven` + `consentGivenAt`.
  Owns `Runner[]`.
- **Runner** — one participant on an order: name, contact, gender, birthdate,
  `singletSize`, emergency contact, medical notes, `runningCommunity` (free-text
  snapshot, defaults to `"INDEPENDENT RUNNER"`).
- **RunningCommunity** — the shared master club list. `slug` is the uppercased
  name and carries uniqueness; `status` is `PENDING` (a runner's write-in) or
  `APPROVED` (appears in pickers). Rejecting deletes the row.
- **PromoCode** — per organizer. `discountType` `FIXED` (centavos) or
  `PERCENTAGE` (**basis points**, 1000 = 10%).
- **RaceResult** — one finisher: bib (unique per event), name, gender, chip/gun
  time, `chipTimeSecs`, and the three ranks (overall, gender, category).

---

## 5. Domain rules that live in `src/lib` — read before re-inventing

These modules exist so two screens can never disagree about the same rule. If a
task touches one of these subjects, import from here rather than writing the
logic again.

| Module | The rule it owns |
| --- | --- |
| `money.ts` | **All money is integer centavos.** Convert pesos→centavos when data *enters*, centavos→pesos only when *displayed*, never in between. `toCentavos`, `toPesos`, `formatPesos` (no ₱ symbol; add it at the call site). |
| `event-schedule.ts` | The line between upcoming and finished. "Today" is **Asia/Manila**, not the server's UTC. A race stays upcoming through race day itself. `upcomingEvents()`/`finishedEvents()` return Prisma `where`s; `soonestFirst`/`mostRecentFirst` the orderings; `hasFinished()` the per-event check; `formatEventDay(Short)` and `formatEventTime` for display. `isCalendarDay` guards the `YYYY-MM-DD` format at the API door. |
| `event-slug.ts` | Public event URLs. `slugifyEventTitle` → `uniqueEventSlug` on write; `eventByParam` matches slug **or** legacy cuid on read, and `canonicalEventPath` redirects old cuid links to the slug. |
| `event-type.ts` | `RACE` vs `FUN_RUN`. `asEventType` guards untrusted input (defaults to `RACE`); `sellsPackages(event)` is the branch the forms and wizards use. |
| `registration-form.ts` | `ONLINE` vs `BANK_TRANSFER` checkout. `asRegistrationForm` defaults to `ONLINE`; `offersBankTransfer`. |
| `shirt-size.ts` | The size chart, whether a category needs a size at all, and the 4XL-and-up upcharge. `subtotalWithUpcharge` is the priced truth. |
| `app/events/[slug]/register/delivery.ts` | Race-kit delivery tiers. A fee of `0` means **not offered**. `deliveryTiers`, `deliveryFeeFor`, `asDeliveryZone`. Shared by both wizards so they can never charge differently. |
| `app/events/[slug]/register/validation.ts` | What step 1 requires. Returns *which* fields are missing, driving the red states, the summary dialog, and where the caret lands. |
| `consent-waiver.ts` | The liability/media/data-privacy waiver. Organizers may override it per event; the default wording is supplied here. **Never present an empty waiver.** |
| `running-community.ts` + `running-community-store.ts` | Club names, `INDEPENDENT RUNNER`, and the pending/approved flow for runner write-ins. |
| `inclusions.ts` | Free text (one item per line) ⇄ stored string[] for what a category includes. |
| `bank-accounts.ts` | Validating and normalizing per-event bank accounts between form, API and wizard. |
| `phone.ts` + `request-country.ts` | Phone numbers stored in **E.164**. Country list from dial codes; names via `Intl.DisplayNames`. The country is *guessed* from `x-vercel-ip-country` and always overridable. |
| `blob.ts` | Every upload. `uploadPublicFile` (returns a URL) vs `uploadPrivateProof` (returns a **pathname**) + `signedProofUrl`. 4 MB cap, because a Vercel function body caps at 4.5 MB. |
| `auth.ts` / `jwt.ts` | bcrypt hashing, the `admin_token` httpOnly cookie (1 day), `getAuthCookie()` in server code. |
| `signed-in-user.ts` | The name and initial the admin sidebars show — read from the record, not the token, so a rename is never stale. |
| `site-contact.ts` | Site name, contact email, legal "last updated", social channels. **Site-wide details belong here**, destined to become superadmin-editable settings — never inline them in a component. |

---

## 6. Routes

### Public
| Path | What it is |
| --- | --- |
| `/` | Home. Hero + up to 6 **upcoming** events, soonest first. Events are the point of this page. |
| `/events` | Full upcoming listing |
| `/events/[slug]` | Event detail and registration entry point (closed once the race is over) |
| `/events/[slug]/register` | The wizard — `RegistrationWizardClient` (ONLINE: 3 steps, plus step 4 for proof when the runner picks bank transfer) or `BankTransferWizardClient` (3 steps). Steps: **1** runners & categories, **2** logistics, **3** checkout/payment, **4** proof upload. |
| `/results` | Finished-event landing, most recent first |
| `/events/[slug]/results` | Winners board |
| `/events/[slug]/results/full` | Full searchable table; category filter via query param |
| `/events/[slug]/results/[resultId]` | One runner's result plus `ECertificateGenerator` (pdf-lib) |
| `/coming-soon`, `/privacy`, `/terms`, `not-found` | Real designed pages — see the no-dead-links rule in §8 |

### Organizer (`/admin`, gated by `src/proxy.ts`)
`/admin` dashboard · `/admin/login` · `/admin/register` · `/admin/events` (plus
`/new` and `/[id]/edit`) · `/admin/events/[id]/registrants` ·
`/admin/events/[id]/results` (the uploader detects the sheet's real header row —
timing exports open with banner rows — and maps columns by sheet index, not by
label) · `/admin/marketing` (promo codes) ·
`/admin/settings` (profile + password) · `/admin/[...missing]` → the admin's own 404.

### Super admin (`/superadmin`)
`/superadmin` dashboard (platform revenue, fees) · `/superadmin/organizers`
(approve, suspend, set commission) · `/superadmin/communities` (approve, rename,
reject clubs) · `/superadmin/[...missing]`.

### API (`src/app/api/**/route.ts`)
| Route | Methods | Notes |
| --- | --- | --- |
| `auth/login`, `auth/logout`, `auth/register` | POST | Sets / clears `admin_token` |
| `checkout` | POST | PayMongo checkout session. Re-derives every amount from the database. |
| `checkout/manual` | POST | Bank transfer: multipart, proof file → private blob |
| `webhooks/paymongo` | POST | HMAC-verified; marks the registration `PAID` |
| `upload` | POST | Organizer-only image upload (public store) |
| `admin/events`, `admin/events/[id]` | POST / GET, PUT, DELETE | Event CRUD including categories and bank accounts |
| `admin/events/[id]/results/upload` | POST | CSV/XLSX results import; dedupes by bib, computes seconds and the three ranks |
| `admin/registrations/[id]/status` | PATCH | Confirm or reject a manual payment |
| `admin/runners/[id]`, `admin/runners/bulk-delete` | PUT/DELETE, POST | Registrant editing |
| `admin/proof/[id]` | GET | Auth-checked redirect to a short-lived signed proof URL |
| `admin/promos` | POST | Promo codes |
| `admin/profile`, `admin/profile/password` | PATCH | Self-service only; the id comes from the cookie, never the body |
| `superadmin/organizers`, `superadmin/organizers/[id]` | GET, PATCH | Status and commission |
| `superadmin/communities`, `superadmin/communities/[id]` | GET/POST, PATCH/DELETE | Club curation |

---

## 7. Security model

- `src/proxy.ts` guards `/admin/**` (except `/login` and `/register`) and
  `/superadmin/**`: no token → `/admin/login`; a `SUPER_ADMIN` on `/admin` →
  `/superadmin`; a non-super-admin on `/superadmin` → `/admin`.
- **Route handlers re-check auth themselves.** The proxy does not cover
  `/api/**`, so every admin route calls `getAuthCookie()` and scopes its queries
  to the signed-in organizer.
- **Never trust client amounts.** `checkout` and `checkout/manual` refetch the
  event and recompute the delivery fee, platform fee, and subtotal (including the
  shirt upcharge) before writing or billing. Mismatches are rejected.
- **Server-side gates, not just UI ones.** Consent (`consentGiven !== true`) and
  the finished-race check (`hasFinished`) are enforced in the API, because a tab
  left open yesterday will still POST.
- Payment proofs are **private** blobs, served only through
  `/api/admin/proof/[id]` with a roughly five-minute signed URL.
- Passwords are bcrypt-hashed; the session cookie is httpOnly, `sameSite=lax`,
  `secure` in production, with a one-day expiry.

---

## 8. Standing rules for this project

These are the user's own standing preferences. Follow them without being asked.

1. **No dead links, ever.** A runner or organizer must never hit a placeholder
   `href="#"` or a bare 404. A destination that is not built yet gets a real,
   designed page — that is what `/coming-soon` and `StatusPanel` exist for.
2. **The UI must look expensive and uniform.** Browser and OS default controls
   (native `<select>`, `alert()`, `confirm()`) are unacceptable. A new control
   copies an existing one: `SelectField`, `Combobox`, `AlertProvider`'s
   `alert`/`confirm`, `AlertModal`, `StatusPanel`, `FieldError`.
3. **Consult the project's `ui-ux-pro-max` skill for UI/UX work** rather than
   designing ad hoc. Skills stay project-scoped in `.claude/skills/` — nothing is
   installed globally.
4. **Validation messages must be specific.** Name exactly what is missing and
   highlight the offending fields; never a generic catch-all. See
   `app/events/[slug]/register/validation.ts` and `FieldError`.
5. **The home page exists to showcase events.** Events stay the focal point.
6. **Table action icons align under their column header**, never pushed to the
   row's right edge.
7. **Site-wide contact and social details live in `lib/site-contact.ts`**, headed
   for superadmin-editable settings — never inline in a component.
8. **Work must reach the user's dev server.** They test on their own
   `localhost:3000` running the **main checkout**, so anything left in a git
   worktree is invisible to them. Land it on `main`.
9. **Weigh storage cost** (Neon's free 0.5 GB tier) before growing the schema.
10. **Comment the *why*.** This codebase's header comments explain the reasoning
    behind a decision, not what the code does. Match that voice.

---

## 9. Conventions

- **Server Components by default**; `'use client'` only where interaction needs
  it. Pages fetch with Prisma directly and client islands take props.
- Imports use the `@/` alias for `src/`.
- Money is centavos everywhere (§5). Dates are `YYYY-MM-DD` strings against a
  Manila "today". Phones are E.164.
- String columns instead of Postgres enums (`status`, `role`, `paymentMethod`,
  `eventType`, `registrationForm`) — which is exactly why each has an `asX()`
  guard in `lib/` that the API must call on untrusted input.
- Styling: Tailwind utilities plus the CSS variables in `globals.css` (motion,
  spacing, radius, glass, gradient tokens). The admin has `Admin.css` and
  `Auth.css`; the wizard and event page have their own CSS files. Dark,
  glassmorphic, with an orange (`#FF6B00`) → blue (`#007AFF`) gradient.
- Fonts: Outfit (`--font-sans`, headings), Inter (`--font-body`).
- Commit style: `feat:` / `fix:` / `refactor:` plus a sentence saying what changed
  for the user.

---

## 10. Current state

`FEATURES_CHECKLIST.md` tracks the roadmap; every major section is ticked through
the results and e-certificate module. Known open threads:

- Site contact and social links are constants awaiting a **superadmin settings
  screen**; the social icons currently point at `/coming-soon`.
- PayMongo runs in **test mode**.
- `src/data/mockEvents.ts` is legacy and is no longer the source for real pages.

---

## Keeping this file updated

**Whenever you add or change a feature, update this file in the same change.**
Specifically:

- A new or changed **model or column** → §4, and §5 if a new rule module came
  with it.
- A new **page or API route** → §6, and §7 if it changes who may reach what.
- A new **shared module in `src/lib`** → §5, described by the *rule* it owns, not
  just its name.
- A new **reusable UI primitive** → §8 or §9, so the next session copies it
  instead of inventing a rival.
- A **standing instruction from the user** → §8, phrased as a rule.
- Anything shipped or unblocked → §10.

Keep it a briefing: dense, current, and short enough to read in full at the start
of a session. If a detail is only true of one file, the explanation belongs in
that file's header comment and only its headline belongs here.
