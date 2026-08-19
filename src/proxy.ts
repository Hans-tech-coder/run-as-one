import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/jwt';

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
  if (request.nextUrl.pathname.startsWith('/admin') && !request.nextUrl.pathname.startsWith('/admin/login') && !request.nextUrl.pathname.startsWith('/admin/register')) {
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
