"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Calendar, Users, Settings, LogOut, Menu, X, Megaphone } from 'lucide-react';
import './Admin.css';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [organizerName, setOrganizerName] = useState('Organizer');

  // Hide the sidebar for login/register pages
  if (pathname.includes('/login') || pathname.includes('/register')) {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    // We can clear the cookie directly or hit an API route. 
    // For now, we'll just delete the cookie on client side if possible, 
    // but HTTP-only cookies need an API route. Let's redirect to a logout route or clear it.
    // We'll just call an API to clear the cookie.
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: <LayoutDashboard size={20} /> },
    { name: 'Events', path: '/admin/events', icon: <Calendar size={20} /> },
    { name: 'Marketing Tools', path: '/admin/marketing', icon: <Megaphone size={20} /> },
    { name: 'Settings', path: '/admin/settings', icon: <Settings size={20} /> },
  ];

  return (
    <div className="admin-layout">
      {/* Mobile Menu Toggle */}
      <div className="mobile-menu-toggle">
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="mobile-menu-btn"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`admin-sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="admin-brand flex items-center gap-3 font-bold text-xl px-6 py-4">
          <img src="/run-as-one-logo.png" alt="RunAsOne" width={1536} height={1024} style={{ height: '48px', width: 'auto' }} />
        </div>

        <nav className="admin-nav">
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              className={`admin-nav-item ${pathname === item.path ? 'active' : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {item.icon}
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="admin-user">
          <div className="admin-user-avatar">
            {organizerName.charAt(0).toUpperCase()}
          </div>
          <div className="admin-user-info">
            <div className="admin-user-name">{organizerName}</div>
            <div className="admin-user-role">Organizer Admin</div>
          </div>
          <button onClick={handleLogout} className="admin-logout" title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
