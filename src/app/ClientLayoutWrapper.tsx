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
      <Navbar />
      {/* The gutter and the clearance under the floating navbar both come from
          .container / --nav-offset, so a phone gets 16px and a desktop 32px
          without this file knowing the numbers. */}
      <main className="pb-16 min-h-screen container" style={{ paddingTop: 'var(--nav-offset)' }}>
        {children}
      </main>
      <Footer />
    </>
  );
}
