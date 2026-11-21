/**
 * **Which public pages wear the Paper look** (site.css, docs/conventions.md
 * §9). The redesign covered the pages a runner browses — home, the event
 * listing and an event's page, results, track — and then the checkout behind
 * them: the register wizard and the three `/pay` pages, so a runner no longer
 * walks off the light event page into a dark checkout at the step where they
 * pay. The legal and feedback pages, /coming-soon and the 404 stay in the dark
 * glass look until they are redesigned too. One list, read by the frame, so
 * the navbar, the footer and the page under them can never disagree about
 * which look a page is in.
 *
 * Paths are the browser's (a client subdomain's `/events` is rewritten to
 * `/s/crc/events` on the server, but the URL a runner sees keeps `/events`).
 */
export function isPaperPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/') return true;
  if (pathname === '/events') return true;
  // An event's own page.
  if (/^\/events\/[^/]+\/?$/.test(pathname)) return true;
  if (isCheckoutPath(pathname)) return true;
  if (pathname === '/results' || pathname.startsWith('/results/')) return true;
  if (pathname === '/track' || pathname.startsWith('/track/')) return true;
  return false;
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
 */
export function isCheckoutPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (/^\/events\/[^/]+\/register\/?$/.test(pathname)) return true;
  if (pathname === '/pay' || pathname.startsWith('/pay/')) return true;
  return false;
}
