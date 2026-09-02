"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

  // Highlight exact match for home, startsWith for others to catch sub-routes
  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname?.startsWith(path);
  };

  const links = [
    { href: "/events", label: "Events" },
    { href: "/results", label: "Results" }
  ];

  return (
    <div className="fixed top-6 w-full z-[100] px-4 sm:px-6 lg:px-8 flex justify-center pointer-events-none">
      <header className="w-full max-w-7xl h-[70px] flex items-center rounded-full bg-white/5 backdrop-blur-xl border border-white/5 pointer-events-auto shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
        <div className="flex justify-between items-center w-full px-8 sm:px-12">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <img src="/logo.png" alt="StrideSync Logo" width="32" height="32" className="rounded-lg" />
            <span className="font-sans font-bold text-2xl text-white tracking-tight hidden sm:block">StrideSync</span>
          </Link>

          <nav className="hidden md:flex gap-8 lg:gap-10">
            {links.map(link => (
              <Link 
                key={link.href}
                href={link.href} 
                className={`font-sans font-medium transition-colors relative py-2 text-[1.05rem] ${
                  isActive(link.href) 
                    ? 'text-white after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-gradient-to-r after:from-accent-orange after:to-accent-blue after:rounded-sm' 
                    : 'text-secondary hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
    </div>
  );
}
