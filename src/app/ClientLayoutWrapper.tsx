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
      <main className="pb-16 min-h-screen container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl" style={{ paddingTop: '160px' }}>
        {children}
      </main>
      <Footer />
    </>
  );
}
