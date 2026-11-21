/**
 * **Which public pages wear the Paper look** (site.css, docs/conventions.md
 * §9). The redesign covered the pages a runner browses — home, the event
 * listing and an event's page, results, track — and left the register wizard,
 * /pay, the legal and feedback pages and the 404 in the dark glass look until
 * they are redesigned too. One list, read by the frame, so the navbar, the
 * footer and the page under them can never disagree about which look a page
 * is in.
 *
 * Paths are the browser's (a client subdomain's `/events` is rewritten to
 * `/s/crc/events` on the server, but the URL a runner sees keeps `/events`).
 */
export function isPaperPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/') return true;
  if (pathname === '/events') return true;
  // An event's own page, not its register wizard below it.
  if (/^\/events\/[^/]+\/?$/.test(pathname)) return true;
  if (pathname === '/results' || pathname.startsWith('/results/')) return true;
  if (pathname === '/track' || pathname.startsWith('/track/')) return true;
  return false;
}
