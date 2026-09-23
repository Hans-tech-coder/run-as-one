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

## Batch 2: dependencies (done 2026-09-23, uncommitted until the owner says so)

1. **CRITICAL vuln-0003.** `next` and `eslint-config-next` are pinned at
   **16.3.6**. The 16.3 codemods (`cache-components-instant-false`,
   `remove-partial-prefetch`) are only for opting into new features, so neither
   was run. `npm run build` passes.
2. **HIGH vuln-0005 / LOW vuln-0006.** The owner chose the SheetJS CDN tarball,
   so `xlsx` now points at `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
   (0.20.3). The API is unchanged. A write-then-`XLSX.read` round trip with the
   uploader's `sheet_to_json` options returns the expected rows.
3. **Transitive.** `npm audit fix` without `--force` fixed `fast-uri` and
   `js-yaml`. Still open, because they need `--force` (a breaking major):
   `deepmerge-ts` < 8 and `mysql2` ≤ 3.23.0. Leave them unless a later scan
   shows they can be reached.
4. **Smoke test on localhost (16.3.6 dev server).** `/events/pink-run-2026/register`
   renders step 1 and the order summary (₱799 + ₱40 fee) with no console errors.
   `/api/checkout` (JSON) and `/api/checkout/manual` (multipart) both reject an
   empty body with 400 and write nothing. No order was placed.
   Aside, not from the upgrade: sending JSON or an empty body to
   `/api/checkout/manual` used to return 500. Fixed: the route now returns 400
   when the body is not a form.

## Batch 3: verify

Pull the fixes into the scan clone (`git pull` from the main checkout once they
are committed to `dev`), then re-run Strix scoped to the fixes:

    strix -n -t ./ -t http://host.docker.internal:3000 --scan-mode quick --scope-mode diff --diff-base origin/main --max-budget 5

Exit `0` together with `run.json` `status: "completed"` closes the plan.
