"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { RunAsOneLogo } from './RunAsOneLogo';
import { ClientSiteLogo } from './ClientSiteLogo';
import { ThemeToggle } from './ThemeToggle';
import type { SiteClient } from '@/lib/site-client';

/**
 * On a client's site (`site` set, CLIENT_SUBDOMAIN_PLAN.md D2) the logo is the
 * client's and links to `/events`, which is that site's front page; the links
 * are the same three.
 */
export default function Navbar({ site }: { site: SiteClient | null }) {
  const pathname = usePathname();

  // Highlight exact match for home, startsWith for others to catch sub-routes
  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname?.startsWith(path);
  };

  const links = [
    { href: "/events", label: "Events" },
    { href: "/results", label: "Results" },
    // TRACK_PAGE_PLAN.md D8: "am I paid?" answered without messaging staff.
    // Named "Track Registration" beside Events and Results (owner, 2026-11-23).
    { href: "/track", label: "Track Registration" }
  ];

  // Below md the links have nowhere to sit in the bar, so they move into a
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

  // A solid strip across the top (site.css `.site-nav`), not the floating
  // glass pill it replaced; it reads the `--site-*` tokens, so it is paper on
  // a redesigned page and dark on one that is not.
  return (
    <div className="site-nav" ref={menuRef}>
      <header className="site-wrap site-nav__row">
        <Link href={site ? '/events' : '/'} className="flex min-w-0 items-center gap-3 no-underline">
          {site ? (
            <ClientSiteLogo site={site} />
          ) : (
            <RunAsOneLogo className="[--rao-logo-size:30px] md:[--rao-logo-size:34px]" />
          )}
        </Link>

        <div className="flex shrink-0 items-center gap-1 md:gap-3 lg:gap-4">
        <nav aria-label="Main" className="hidden md:flex shrink-0 items-center gap-6 lg:gap-8">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className="site-nav__link"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <ThemeToggle />

        <button
          type="button"
          onClick={toggle}
          aria-label={isOpen ? "Close menu" : "Open menu"}
          aria-expanded={isOpen}
          aria-controls="mobile-nav"
          className="site-nav__toggle md:hidden"
        >
          {isOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        </div>
      </header>

      <div
        id="mobile-nav"
        className={`site-nav__sheet t-dropdown md:hidden ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
        data-origin="top-center"
      >
        <nav aria-label="Main" className="flex flex-col">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={close}
              aria-current={isActive(link.href) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
