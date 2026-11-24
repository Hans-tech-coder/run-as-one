"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { SiteClient } from "@/lib/site-client";
import { isPaperPath, wearsPaletteBridge } from "@/lib/site-look";
import { useColorTheme } from "@/components/useColorTheme";

/**
 * `site` is the client whose subdomain this is, or null on the main site
 * (lib/site-client.ts). The layout drawing the frame (SiteFrame) reads it on
 * the server; the navbar and footer only wear it.
 *
 * Every public page (lib/site-look.ts) gets the Paper frame: `.site-paper`
 * with `data-theme` set to the visitor's light/dark theme, which site.css
 * explains, and `data-follows-theme`, the marker that lets paper-tokens.css
 * flip Paper's palette (lib/color-theme.ts). The palette itself is right on
 * the first paint (the <head> script); `data-theme` catches up on hydration
 * and only steers globals.css's older light-block leftovers. The checkout (the
 * register wizard and /pay) and the Our Services inquiry are also marked
 * `.site-checkout`, the scope checkout-paper.css repoints their older palette
 * utilities inside.
 *
 * `/admin` draws no frame of its own here — except the inquiry, a public page
 * that lives under `/admin` for its URL and renders this frame itself.
 */
export default function ClientLayoutWrapper({
  site,
  fontClass,
  children,
}: {
  site: SiteClient | null;
  fontClass: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const paper = isPaperPath(pathname);
  const { theme } = useColorTheme();

  // What a Paper page renders into <body> — the e-certificate, the alert and
  // toasts, the photo viewer — sits outside this frame, so it would not see
  // Archivo's variable. Carry the variable on <body> while a Paper page is up
  // (site.css, "Paper on portals"); the dashboard never gets it.
  useEffect(() => {
    if (!paper) return;
    const classes = fontClass.split(' ').filter(Boolean);
    document.body.classList.add(...classes);
    return () => document.body.classList.remove(...classes);
  }, [paper, fontClass]);

  if (isAdmin && !paper) {
    return <>{children}</>;
  }

  const checkout = paper && wearsPaletteBridge(pathname);

  return (
    <div
      className={paper ? `site-paper${checkout ? ' site-checkout' : ''} ${fontClass}` : fontClass}
      data-theme={paper ? theme : undefined}
      data-follows-theme={paper ? '' : undefined}
    >
      {/* The navbar is fixed, so it sits outside the column and contributes no
          height — the clearance under it comes from --nav-offset below. */}
      <Navbar site={site} />

      {/* A page shorter than the viewport used to be padded out by a
          min-h-screen on <main>, which pushed the footer to the very bottom of
          the screen and then added the footer's own top margin on top of that.
          On /events and /results, which set a second min-h-screen of their own,
          that stacked into hundreds of pixels of void above the footer.
          Growing the main instead lets the footer settle at the bottom of a
          short page and sit one margin below the content of a long one. */}
      <div className="flex min-h-[100dvh] flex-col">
        {/* The gutter comes from .container and the clearance under the
            navbar from --nav-offset, so this file never states either
            number. A Paper page's sections run edge to edge and carry their
            own .container, so its main drops the gutter. */}
        {/* `public-main` carries the page-arrival reveal — see the note on it
            in globals.css (switched off on Paper pages, site.css). */}
        <main
          className={`public-main grow ${paper ? 'w-full' : 'container'}`}
          style={{ paddingTop: 'var(--nav-offset)' }}
        >
          {children}
        </main>
        <Footer site={site} />
      </div>
    </div>
  );
}
