import { isPublicAdminPath } from '@/lib/next-path';

/**
 * The pages under `/admin` that somebody reaches before they have a session:
 * sign in, register, an invitation link, and forgot / reset password — the
 * proxy's `PUBLIC_ADMIN_PATHS` (lib/next-path.ts), read from there so the two
 * lists cannot drift.
 *
 * They sit under `/admin` for the URL's sake, but they are not dashboard
 * screens — they have no sidebar, no header and no content area, just the
 * centred auth card on its own background. Two places need to know that and
 * must not drift apart: `AdminShell`, which draws them without the frame, and
 * `admin/loading.tsx`, which must answer a click on one of them without the
 * frame either. A fallback that draws the dashboard's header bar over a
 * sign-in page is a skeleton for furniture that never arrives.
 */

/** True for those pages and anything under them (an invitation's token). */
export function isBarePath(pathname: string | null) {
  return !!pathname && isPublicAdminPath(pathname);
}
