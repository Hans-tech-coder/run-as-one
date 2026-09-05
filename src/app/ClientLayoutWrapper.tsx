"use client";

import { usePathname } from 'next/navigation';
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin') || pathname?.startsWith('/superadmin');

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      {/* The navbar is fixed, so it sits outside the column and contributes no
          height — the clearance under it comes from --nav-offset below. */}
      <Navbar />

      {/* A page shorter than the viewport used to be padded out by a
          min-h-screen on <main>, which pushed the footer to the very bottom of
          the screen and then added the footer's own top margin on top of that.
          On /events and /results, which set a second min-h-screen of their own,
          that stacked into hundreds of pixels of void above the footer.
          Growing the main instead lets the footer settle at the bottom of a
          short page and sit one margin below the content of a long one. */}
      <div className="flex min-h-[100dvh] flex-col">
        {/* The gutter comes from .container and the clearance under the
            floating navbar from --nav-offset, so this file never states either
            number: a phone gets 16px and a desktop 32px. */}
        <main className="container grow" style={{ paddingTop: 'var(--nav-offset)' }}>
          {children}
        </main>
        <Footer />
      </div>
    </>
  );
}
