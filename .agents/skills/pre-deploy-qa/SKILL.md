---
name: pre-deploy-qa
description: Pre-deploy QA for run-as-one before `dev` is promoted to `main` (production). Runs the build gates, a code review of what is shipping, a browser walkthrough of runner registration on localhost, and hands the owner the Strix commands to run a vulnerability scan themselves. Use when the owner asks to QA, test before deploy, "i-QA", "bago i-deploy", or check registration before a release.
---

# Pre-deploy QA

Goal: catch what would break for a runner registering for a race **before** `main`
moves. Output is a go / no-go report. This skill never commits, pushes, promotes
`main`, or runs `prisma migrate deploy`. The owner deploys by hand from the commands
in step 6.

## Hard rules

- **Never against production.** Not the URL `run-as-one.cresendorunningcommunity.com`,
  not the Neon endpoint `ep-still-pine-b3n210bs`. Everything runs on `localhost:3000`
  with the `local-dev` branch (`ep-shiny-sunset-b3gzfro9`).
- **Never print `.env`.** Check the endpoint with a count only (step 1).
- **Do not touch existing registrations**, even on `local-dev` — make fresh test
  registrations on a test event, using the owner's own email as the runner email.
  A bad test order is cancelled by status, never deleted.
- **Blob stores are shared with production.** A proof upload during testing lands in
  the live private store; never delete a blob from local.
- **Token budget:** read pages with `get_page_text` / `read_page`, screenshot only
  for final proof. Test only the rows the diff touches plus the core happy paths.

## Steps

### 0. What is shipping

```bash
git fetch origin
git log --oneline origin/main..dev
git diff --stat origin/main..dev
git diff --name-only origin/main..dev -- prisma/migrations
```

If the working tree is dirty, say so — Strix (step 5) scans the scan clone, which
sees only what is committed on local `dev`.

### 1. Environment is not production

```bash
grep -c "ep-still-pine-b3n210bs" .env
```

Must print `0`. Anything else: **stop** and tell the owner their `.env` points at production.

### 2. Gates

```bash
npm run lint
npm run build
```

A failing build is an automatic no-go.

### 3. Code review of the release

Run `/code-review` (medium) on `origin/main..dev`. Every correctness finding in
`src/app/api/checkout/**`, `src/app/api/webhooks/paymongo/**`,
`src/app/events/[slug]/register/**`, or a `src/lib` rule module
(`registration-gate`, `discount`, `free-checkout`, `minor-consent`, `pending-expiry`)
is a blocker until the owner rules on it.

### 4. Registration walkthrough (browser, localhost:3000)

Start the dev server with `preview_start` (never a raw shell server). Run each row
the diff touches, plus rows A and B always. Also run each touched row at 375px.

| # | Scenario | Pass when |
|---|---|---|
| A | Online checkout (PayMongo **test** keys), adult, valid data | Reaches PayMongo checkout; row is `PENDING` holding a slot. The webhook cannot reach localhost, so `PAID` is not verified here. Say so in the report. |
| B | Bank transfer, deposit slip upload | Upload succeeds, row `PENDING`, bank details modal correct, confirmation screen shown |
| C | Submit with required fields empty | Each missing field named and highlighted (`validation.ts`, `FieldError`), no generic message |
| D | Birthdate under 18 | Guardian consent step required; cannot finish without it |
| E | Promo code: valid / expired / used up / other event's code | Correct discount; each refusal says why (`discount.ts`) |
| F | ₱0 order (100% promo or free slot) | Completes without PayMongo (`free-checkout.ts`) |
| G | Sold-out category, group limit reached | Blocked with a clear message; no over-booking |
| H | Event closed or not yet open | Register page refuses with the gate's reason (`registration-gate.ts`) |
| I | Admin manual registration `/admin/register` | Creates the row; appears in the event's registrants table |
| J | Confirmation email | Arrives at the owner's inbox (Resend is live locally) with correct event, category, and amount |

Check `read_console_messages` and `preview_logs` for errors after each row.

### 5. Strix vulnerability scan (the owner runs it)

Do **not** run Strix yourself. Give the owner the commands in
[strix-commands.md](strix-commands.md), filled in for this release, and wait. When
they say it finished, read
`C:\Users\user\Web Projects\Claude Scratch\run-as-one-scan\strix_runs\<latest>\penetration_test_report.md`,
then each file in `vulnerabilities\`. Confirm each PoC actually shows impact before
you report it. Check `run.json`: a `stopped` status or a cost at the budget cap means
the scan did not finish; say so. Fixes go through `fix-security-vulnerabilities-with-strix`,
one finding per session.

### 6. Release steps (the owner runs them)

The owner promotes `main` by hand; never run `git merge`/`git push` on `main` or
`prisma migrate deploy` yourself. On a GO, give them
[deploy-commands.md](deploy-commands.md). If step 0 listed migration folders, say so
and name them: production needs `npx prisma migrate deploy` before `main` is pushed,
or the live site breaks. If a migration drops or renames a column or table, say that
the order in the file does not fit and work out the safe order with the owner.

## Report

One table: step → pass / fail / not run (why). Then blockers, then non-blocking
notes, then the migration note if any. End with **GO** or **NO-GO**; on a GO, hand
over the deploy commands. Then stop.
