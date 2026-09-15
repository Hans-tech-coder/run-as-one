/**
 * Whether the desktop sidebar is collapsed to its icon rail.
 *
 * It is remembered in a cookie rather than localStorage because the layouts
 * render on the server: only a cookie reaches them in time to draw the right
 * width on the first paint. From localStorage the page would arrive with the
 * full sidebar and snap shut once it hydrated, on every page load.
 *
 * It is a display preference and nothing else — not httpOnly, not signed, and
 * nothing reads it but the two dashboard layouts. One cookie serves both
 * dashboards, so a person who works the rail keeps it wherever they go.
 */

export const SIDEBAR_COOKIE = 'dash_sidebar';

const COLLAPSED = 'collapsed';

export function isSidebarCollapsed(value: string | undefined) {
  return value === COLLAPSED;
}

/** Client only. A year, so the choice outlives the one-day session. */
export function rememberSidebar(collapsed: boolean) {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? COLLAPSED : 'expanded'}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
