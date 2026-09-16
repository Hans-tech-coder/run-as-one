"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Users, Flag, MessageSquare } from 'lucide-react';
import type { SignedInUser } from '@/lib/signed-in-user';
import DashboardShell from '../admin/DashboardShell';
import '../admin/Admin.css';

/**
 * The platform owner's frame: its four links and the blue avatar that tells
 * the two dashboards apart at a glance. Everything else, the phone's drawer
 * included, is `DashboardShell`, shared with `/admin`.
 */

const NAV_ITEMS = [
  { name: 'Dashboard', path: '/superadmin', icon: <LayoutDashboard size={20} /> },
  { name: 'Organizers', path: '/superadmin/organizers', icon: <Users size={20} /> },
  { name: 'Communities', path: '/superadmin/communities', icon: <Flag size={20} /> },
  { name: 'Feedback', path: '/superadmin/feedback', icon: <MessageSquare size={20} /> },
];

export default function SuperAdminShell({
  user,
  initialCollapsed,
  children,
}: {
  user: SignedInUser | null;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
    // And drop the cached layout that still names the person who just left,
    // so the next sign-in in this browser cannot inherit their sidebar.
    router.refresh();
  };

  return (
    <DashboardShell
      navItems={NAV_ITEMS}
      initialCollapsed={initialCollapsed}
      userBlock={{
        name: user?.name ?? 'Super Admin',
        initial: user?.initial ?? 'S',
        roleLine: 'Super Admin',
        avatarStyle: { background: 'var(--accent-blue)' },
      }}
      onLogout={handleLogout}
    >
      {children}
    </DashboardShell>
  );
}
