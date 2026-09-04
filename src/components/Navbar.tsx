"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

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

  // Below md the links have nowhere to sit in a 70px pill, so they move into a
  // sheet under it. Same open/close idiom as every other menu in the app —
  // .t-dropdown with an is-closing pass — so it reads as the same control.
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => {
    if (!isOpen) return;
    setIsOpen(false);
    setIsClosing(true);
    setTimeout(() => setIsClosing(false), 150); // Matches --dropdown-close-dur
  };

  const toggle = () => {
    if (isOpen) {
      close();
    } else {
      setIsClosing(false);
      setIsOpen(true);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        close();
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  });

  return (
    <div className="fixed top-4 sm:top-6 w-full z-[100] px-4 sm:px-6 lg:px-8 flex justify-center pointer-events-none">
      <div className="w-full max-w-7xl relative pointer-events-auto" ref={menuRef}>
        <header className="w-full h-[70px] flex items-center rounded-full bg-white/5 backdrop-blur-xl border border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
          <div className="flex justify-between items-center w-full px-5 sm:px-12">
            <Link href="/" className="flex items-center gap-3 no-underline">
              <img src="/run-as-one-logo.png" alt="RunAsOne" width={1536} height={1024} className="h-9 sm:h-11 w-auto" />
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

            <button
              type="button"
              onClick={toggle}
              aria-label={isOpen ? "Close menu" : "Open menu"}
              aria-expanded={isOpen}
              aria-controls="mobile-nav"
              className="md:hidden flex items-center justify-center w-11 h-11 -mr-1.5 shrink-0 rounded-full bg-white/5 border border-white/10 text-white transition-colors hover:bg-white/15"
            >
              {isOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </header>

        <div
          id="mobile-nav"
          className={`t-dropdown md:hidden absolute top-full right-0 left-0 mt-3 rounded-3xl bg-[#101014]/95 backdrop-blur-xl border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.5)] overflow-hidden ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
          data-origin="top-center"
        >
          <nav className="flex flex-col p-2">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className={`font-sans font-medium text-[1.05rem] px-4 py-3.5 rounded-2xl no-underline transition-colors ${
                  isActive(link.href)
                    ? 'text-white bg-white/10'
                    : 'text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
