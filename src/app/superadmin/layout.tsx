"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, LogOut, Menu, X } from 'lucide-react';
import '../admin/Admin.css';

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/superadmin', icon: <LayoutDashboard size={20} /> },
    { name: 'Organizers', path: '/superadmin/organizers', icon: <Users size={20} /> },
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
          <img src="/logo.png" alt="StrideSync Logo" width="32" height="32" style={{ borderRadius: '8px' }} />
          StrideSync
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
          <div className="admin-user-avatar" style={{ background: 'var(--accent-blue)' }}>
            S
          </div>
          <div className="admin-user-info">
            <div className="admin-user-name">Super Admin</div>
            <div className="admin-user-role">System Owner</div>
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
