import { NextResponse } from 'next/server';
import type { SignInErrorCode } from '@/lib/sign-in-errors';

/**
 * Back to the sign-in page with a refusal's code (never its text — see
 * lib/sign-in-errors.ts), keeping the page the person was headed for.
 */
export function backToSignIn(request: Request, code: SignInErrorCode, next = '/admin') {
  const url = new URL('/admin/login', request.url);
  url.searchParams.set('error', code);
  if (next !== '/admin') url.searchParams.set('next', next);
  return NextResponse.redirect(url);
}
