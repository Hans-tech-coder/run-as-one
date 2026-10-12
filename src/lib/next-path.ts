/**
 * Where a sign-in sends a person afterwards: back to the admin page they were
 * trying to open, and nowhere else.
 *
 * `src/proxy.ts` puts that page in `/admin/login?next=…`, which makes `next`
 * something anyone can write into a link. So a value is used only when it is a
 * path inside `/admin` on this site. `//evil.com` and `/\evil.com` are refused
 * because a browser reads both as another host; a full URL is refused because
 * it does not start with `/admin`; and the public admin pages (sign-in,
 * register, invite, forgot / reset password, the code step) are refused because landing back on the sign-in form after
 * signing in is a loop, not a destination. Anything refused becomes `/admin`.
 */

/**
 * The admin pages somebody without a session has to reach. The proxy lets
 * them through, and a sign-in never returns to one.
 */
export const PUBLIC_ADMIN_PATHS = [
  '/admin/login',
  '/admin/register',
  '/admin/invite',
  '/admin/forgot-password',
  '/admin/reset-password',
  // The second sign-in step: the person has no session yet, only the
  // pending cookie (lib/two-factor-pending.ts).
  '/admin/two-factor',
];

/** Whether `pathname` is one of the public admin pages, or beneath one. */
export function isPublicAdminPath(pathname: string): boolean {
  return PUBLIC_ADMIN_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

export function safeNextPath(raw: string | string[] | null | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return '/admin';

  if (value.startsWith('//') || value.startsWith('/\\')) return '/admin';
  // Control characters and backslashes anywhere: a browser drops tabs and
  // newlines from a URL and turns `\` into `/`, so `/admin\..\..` or
  // `/\t/evil.com` would not mean what this check saw.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return '/admin';

  // `/admin`, `/admin/…`, `/admin?…` and `/admin#…`, never `/administrator`.
  if (!/^\/admin(?:[/?#]|$)/.test(value)) return '/admin';

  const pathname = value.split(/[?#]/)[0];
  if (isPublicAdminPath(pathname)) return '/admin';

  return value;
}
