/**
 * The dashboard's light/dark choice, set from the account menu's Dark Mode row.
 *
 * A cookie rather than localStorage for the same reason as the sidebar's
 * (`dashboard-sidebar.ts`): the layout renders on the server, and only a cookie
 * reaches it in time to draw the chosen theme on the first paint instead of
 * flashing dark and snapping to light once it hydrates.
 *
 * Dark is the default, because it is what the dashboard has always been; only
 * an explicit "light" changes it. It is a display preference and nothing
 * else — not httpOnly, not signed, read by the admin layout alone. The public
 * site does not read it: the choice is made inside the dashboard and scoped to
 * it (`DashboardShell` puts `data-theme` on the root only while it is mounted).
 */

export type DashboardTheme = 'dark' | 'light';

export const THEME_COOKIE = 'dash_theme';

export function readDashboardTheme(value: string | undefined): DashboardTheme {
  return value === 'light' ? 'light' : 'dark';
}

/** Client only. A year, so the choice outlives the one-day session. */
export function rememberDashboardTheme(theme: DashboardTheme) {
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
