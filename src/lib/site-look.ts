/**
 * **Which pages wear the Paper look** (site.css, docs/conventions.md §9).
 * Since 2026-11-21 that is **every public page**: home, the event listing and
 * an event's page, results, track, the checkout behind them (the register
 * wizard and `/pay`), the legal pages, `/feedback`, `/coming-soon` and the
 * 404 — plus one page under `/admin`, the "Our Services" inquiry
 * (`/admin/register`), which a prospective client reaches from the home
 * page's "Organizing a race?" band and must not walk from a light page into a
 * dark admin-looking form. The sign-in pages (sign in, invitation, password
 * reset, two-step) are Paper too since 2026-11-22, but not through this rule:
 * they need no navbar or footer, so `AdminShell` draws `AuthPaperFrame` round
 * them. Only the dashboard keeps its own look.
 *
 * "Every public path" rather than a list of them, because a 404 answers at
 * any address: listing the pages that exist left a typo the one dark page on
 * the site. One rule, read by the frame, so the navbar, the footer and the
 * page under them can never disagree about which look a page is in.
 *
 * Paths are the browser's (a client subdomain's `/events` is rewritten to
 * `/s/crc/events` on the server, but the URL a runner sees keeps `/events`).
 */
export function isPaperPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (isInquiryPath(pathname)) return true;
  return pathname !== '/admin' && !pathname.startsWith('/admin/');
}

/**
 * **The "Our Services" inquiry** (`/admin/register`). It sits under `/admin`
 * for the URL's sake (links already shared), but it is a public page: its
 * `page.tsx` draws the site frame round it, and `ClientLayoutWrapper` lets that
 * one admin path through.
 */
export function isInquiryPath(pathname: string | null | undefined): boolean {
  return pathname === '/admin/register' || pathname === '/admin/register/';
}

/**
 * **The checkout: the register wizard and `/pay/**`.** Paper too, but its
 * components were built for the dark look and still carry `text-white` /
 * `white/…` / `black/…` utilities — the two wizards are 1,870-line files on the
 * split list, and restyling them class by class would mean rewriting checkout
 * code that is not otherwise changing. So the frame marks these pages
 * (`.site-checkout`) and `checkout-paper.css` repoints those palette names at
 * the Paper tokens inside that mark only. Nothing outside it — the other Paper
 * pages, the dashboard, which shares `PhoneField` — sees the remap.
 *
 * The inquiry wears the same mark (`wearsPaletteBridge`): it is built from the
 * same dark-era controls — `PhoneField`, `StepRail`, and the dashboard's
 * `AdminSelect` / `AdminDatePicker`, which read the ink ramp and
 * `--dash-panel-solid` the bridge already repoints.
 */
export function isCheckoutPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (/^\/events\/[^/]+\/register\/?$/.test(pathname)) return true;
  if (pathname === '/pay' || pathname.startsWith('/pay/')) return true;
  return false;
}

/** The pages whose frame carries `.site-checkout`, checkout-paper.css's scope. */
export function wearsPaletteBridge(pathname: string | null | undefined): boolean {
  return isCheckoutPath(pathname) || isInquiryPath(pathname);
}
