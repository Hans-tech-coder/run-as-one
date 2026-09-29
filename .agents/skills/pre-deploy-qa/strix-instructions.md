# Scan brief: run-as-one

Next.js 16 (App Router) + Prisma/Postgres race-registration platform for running events
in the Philippines. Runners register and pay without an account; organizers and
Run As One staff use `/admin`.

## Trust model

- Public and unauthenticated: `/events/[slug]/register`, `POST /api/checkout` (online,
  PayMongo), `POST /api/checkout/manual` (bank transfer with a deposit-slip upload),
  `POST /api/promos/lookup`, `POST /api/auth/register`.
- `POST /api/webhooks/paymongo` must accept only requests signed with `PAYMONGO_WEBHOOK_SECRET`.
- `/api/cron/expire-pending` must refuse without `Authorization: Bearer <CRON_SECRET>`.
- Admin: a JWT session cookie. `src/proxy.ts` guards `/admin/**` pages but **not**
  `/api/**`, so every admin route must call `getActor()`, scope its queries to
  `actor.orgId` (the tenant), and check `can(actor, permission)` from `permissions.ts`.
  Roles: OWNER, ADMIN, STAFF (per-event assignment), and a read-only client viewer.
- Payment proofs live in a **private** blob store; only authorized admins may open one.

## Focus, in order

1. Registration money and slots: tampering with price, category, fee, or quantity in the
   checkout body; reusing or stacking promo codes past their limits; getting a ₱0 order
   without a real free entitlement; booking past a category's capacity (race conditions).
2. Webhook forgery or replay that marks a registration PAID.
3. IDOR across tenants: one organizer reading or changing another organizer's events,
   registrants, promos, remittances, or payment proofs; a client viewer or STAFF member
   writing where they may only read.
4. Deposit-slip upload: file type/size checks, and whether a stored proof URL is guessable.
5. Injection and stored XSS through registrant fields and the rich-text event description.

## Rules

- Never target `run-as-one.cresendorunningcommunity.com`. Only `localhost` / `host.docker.internal`.
- Do not delete data or blobs. Create new test registrations instead of changing existing rows.
- Do not send email or trigger real payments.
