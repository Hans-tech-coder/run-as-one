# Strix commands for the owner (PowerShell)

The owner runs these by hand. Claude hands them over and reads the results after.
Strix mounts the target folder **writable**, so it scans a separate clone,
`C:\Users\user\Web Projects\Claude Scratch\run-as-one-scan`, never the main checkout.

That clone's `origin` is the **local** main checkout, not GitHub. So it sees what is
**committed** on local `dev` (pushed or not, but never uncommitted edits), and its
`origin/main` is the local `main`, which matches production as long as deploys are
done by fast-forwarding local `main` (the project's normal way).

## Already set up (nothing to do each time)

- `STRIX_LLM` is a permanent user environment variable (currently a Gemini model).
- The API key is saved in Strix's own config, `~/.strix/cli-config.json`.
- Docker Desktop must be running. `docker info` / `strix --version` check both.

To switch model or key later, change them there. Never paste the key into the chat.
`--max-budget` caps the LLM spend in USD, billed to that key, separate from the Claude plan.

## Every release: refresh the clone to the committed `dev`

```powershell
cd "C:\Users\user\Web Projects\Claude Scratch\run-as-one-scan"
git fetch origin
git checkout dev
git reset --hard origin/dev
git clean -fd
```

(`strix_runs/` is git-ignored, so past reports survive `git clean`.)

## Scan A — every release: only what changed since production (~30 min)

```powershell
strix -n -t ./ --scope-mode diff --diff-base origin/main --scan-mode standard --max-budget 10 --instruction-file "C:\Users\user\Web Projects\run-as-one\.claude\skills\pre-deploy-qa\strix-instructions.md"
```

Code-only: findings are reasoned from the source, not proven against a running app.

## Scan B — occasionally (big release): whole app + live localhost

Only after **all** of these, in the main checkout's `.env`:

1. `DATABASE_URL` / `DIRECT_URL` are on `local-dev` (`ep-shiny-sunset-…`), **never** `ep-still-pine-…`.
2. `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `PROOFS_BLOB_READ_WRITE_TOKEN` are blanked
   for the scan. The blob stores are shared with production, and Resend sends real emails.
3. PayMongo keys are test keys (`sk_test_…` / `pk_test_…`).
4. The dev server was restarted after the edit and is up on `localhost:3000`.

Know that `local-dev` is a copy of production, so real runners' details sit in it and the
scan's agents may read them and send them to the LLM provider. Decide on that first.

To let Strix test the admin side, copy `strix-instructions.md` into the scan clone and
add a "Test logins" section with **test accounts only**. Then point `--instruction-file`
at that copy. The clone is not committed, so the logins stay off GitHub.

```powershell
strix -n -t ./ -t http://host.docker.internal:3000 --scope-mode full --scan-mode standard --max-budget 25 --instruction-file "C:\Users\user\Web Projects\run-as-one\.claude\skills\pre-deploy-qa\strix-instructions.md"
```

Restore `.env` and restart the dev server afterwards.

## After a scan

The report is in `C:\Users\user\Web Projects\Claude Scratch\run-as-one-scan\strix_runs\<newest>\`.
Tell Claude "tapos na ang Strix" and it reads `penetration_test_report.md` and
`vulnerabilities\` from there.

Never point `-t` at `https://runasone.ph`.
