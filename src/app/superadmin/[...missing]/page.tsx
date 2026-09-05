import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getAuthCookie } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Page Not Found | RunAsOne Super Admin',
};

/**
 * Every /superadmin address this app does not serve — the twin of
 * ../admin/[...missing], for the same reason. See that file.
 */
export default async function SuperAdminCatchAll() {
  const auth = await getAuthCookie();
  if (!auth || auth.role !== 'SUPER_ADMIN') {
    redirect('/admin/login');
  }

  notFound();
}
