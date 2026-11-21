"use client";

import { usePathname } from 'next/navigation';
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { SiteClient } from "@/lib/site-client";
import { isCheckoutPath, isPaperPath } from "@/lib/site-look";

/**
 * `site` is the client whose subdomain this is, or null on the main site
 * (lib/site-client.ts). The layout drawing the frame (SiteFrame) reads it on
 * the server; the navbar and footer only wear it.
 *
 * A redesigned page (lib/site-look.ts) gets the Paper frame: `.site-paper`
 * with `data-theme="light"`, which site.css explains. Every other public page
 * keeps the dark look it was built in. The checkout (the register wizard and
 * /pay) is Paper as well and is also marked `.site-checkout`, the scope
 * checkout-paper.css repoints its older palette utilities inside.
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

  if (isAdmin) {
    return <>{children}</>;
  }

  const paper = isPaperPath(pathname);
  const checkout = paper && isCheckoutPath(pathname);

  return (
    <div
      className={paper ? `site-paper${checkout ? ' site-checkout' : ''} ${fontClass}` : fontClass}
      data-theme={paper ? 'light' : undefined}
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
