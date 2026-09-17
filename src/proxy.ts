import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/jwt';

/**
 * The admin pages somebody without a session has to reach. The invitation link
 * is one of them: the person opening it has no account yet — or has one but is
 * not signed in on this browser — and the page itself proves who they are with
 * the token in the link.
 */
const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/register', '/admin/invite'];

/**
 * Proves a session exists before any dashboard page renders; what the session
 * may open is each page's own `can()` check (lib/actor.ts).
 *
 * There is one dashboard (ADMIN_MERGE_PLAN.md, Batch 2). This used to split
 * sessions between two — a super admin sent to `/superadmin`, everyone else
 * kept out of it — and now sends nobody anywhere but the sign-in screen. The
 * old `/superadmin` addresses are permanent redirects in next.config.ts, which
 * run before this, so they never reach it.
 */
export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (PUBLIC_ADMIN_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('admin_token')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  try {
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  } catch {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
