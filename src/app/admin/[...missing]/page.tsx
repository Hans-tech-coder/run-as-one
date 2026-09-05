import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getAuthCookie } from '@/lib/auth';

// Set here rather than on ../not-found.tsx: a not-found file renders as a
// boundary, and Next.js takes the title from the route that matched.
export const metadata: Metadata = {
  title: 'Page Not Found | RunAsOne Admin',
};

/**
 * Every /admin address this app does not serve.
 *
 * Next.js routes unmatched URLs to the root not-found and to the root layout
 * only — nested layouts and nested not-found files are skipped entirely. That
 * left a wrong /admin address rendering the public 404 with the navbar and
 * footer suppressed, flush to the edges of the screen. Matching the URL here
 * first means the miss happens *inside* the admin layout, so notFound() lands
 * on ../not-found.tsx with the sidebar still around it.
 *
 * A catch-all is the lowest-priority match in the router, so this can never
 * shadow a real page — including ones added later.
 */
export default async function AdminCatchAll() {
  // A signed-out visitor guessing at URLs has no business seeing the shape of
  // the admin, 404 or not; they get the sign-in screen like anywhere else here.
  const auth = await getAuthCookie();
  if (!auth) {
    redirect('/admin/login');
  }

  notFound();
}
