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

export default async function proxy(request: NextRequest) {
  // Check if trying to access superadmin routes
  if (request.nextUrl.pathname.startsWith('/superadmin')) {
    const token = request.cookies.get('admin_token')?.value;
    
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    try {
      const payload = await verifyToken(token);
      if (!payload || payload.role !== 'SUPER_ADMIN') {
        // Not a super admin, redirect to regular admin dashboard
        return NextResponse.redirect(new URL('/admin', request.url));
      }
    } catch (error) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // Check if trying to access regular admin routes (but not login)
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/admin') && !PUBLIC_ADMIN_PATHS.some(path => pathname.startsWith(path))) {
    const token = request.cookies.get('admin_token')?.value;
    
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    
    try {
      const payload = await verifyToken(token);
      if (!payload) {
        return NextResponse.redirect(new URL('/admin/login', request.url));
      }
      
      // If super admin tries to access regular admin, redirect to superadmin dashboard
      if (payload.role === 'SUPER_ADMIN') {
        return NextResponse.redirect(new URL('/superadmin', request.url));
      }
    } catch (error) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/superadmin/:path*', '/admin/:path*'],
};
