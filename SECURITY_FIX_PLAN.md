# Security fix plan (Strix run `run-as-one-scan_00c6`, 2026-09-23)

Findings come from a Strix scan of a clone at
`C:\Users\user\Web Projects\Claude Scratch\run-as-one-scan`; the full reports are
in that clone's `strix_runs/run-as-one-scan_00c6/vulnerabilities/`. Batches are
done one per session on purpose. A later batch is deferred, not forgotten, and
each one below says what a cold session needs to pick it up.

## Batch 1: code fixes (done 2026-09-23, uncommitted until the owner says so)

- **HIGH vuln-0014, negative transaction fee.** Both checkout routes trusted the
  posted `transactionFee`. The fee is now computed on the server by
  `transactionFeeFor` in `src/lib/free-checkout.ts`, which the online wizard also
  uses. `/api/checkout` refuses a fee that differs, and `/api/checkout/manual`
  refuses any fee other than 0. The Strix PoC now returns 409.
- **MEDIUM vuln-0013, upload path traversal.** `uploadPublicFile` in
  `src/lib/blob.ts` now uses the same `safeFileName` as proofs do.
- Side effect: the scan's PoC placed a real order (`attacker@example.com`) in the
  **dev** database. It is left alone until the owner decides what to do with it.

## Batch 2: dependencies (next session)

1. **CRITICAL vuln-0003: `next` 16.2.12 → ≥ 16.3.3.** The RCE only affects Windows
   hosts. Production runs on Vercel (Linux), so the live risk is low, but the fix
   is cheap. Read `node_modules/next/dist/docs/` for the upgrade notes, bump
   `next` (and `eslint-config-next` if it is pinned to match), then run
   `npm run build` and smoke-test checkout on localhost.
2. **HIGH vuln-0005 / LOW vuln-0006: `xlsx` 0.18.5.** npm has no fixed version.
   SheetJS only publishes fixes on its own CDN tarball
   (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). The only use is
   `XLSX.read` in `src/app/admin/events/[id]/results/ResultsUploaderClient.tsx`,
   on a file an admin picks. **The owner decides:** the CDN tarball (recommended)
   or another parser.
3. INFO findings (postcss, fast-uri, deepmerge-ts) are transitive. Run
   `npm audit` after step 1 and take only what `npm audit fix` resolves without
   `--force`.

## Batch 3: verify

Pull the fixes into the scan clone (`git pull` from the main checkout once they
are committed to `dev`), then re-run Strix scoped to the fixes:

    strix -n -t ./ -t http://host.docker.internal:3000 --scan-mode quick --scope-mode diff --diff-base origin/main --max-budget 5

Exit `0` together with `run.json` `status: "completed"` closes the plan.
