"use client";

import { usePathname } from 'next/navigation';
import Footer from './Footer';

export default function ConditionalFooter() {
  const pathname = usePathname();

  // Hide the footer on all admin pages
  if (pathname.startsWith('/admin')) {
    return null;
  }

  return <Footer />;
}
