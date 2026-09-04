import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "StrideSync | Premium Running Event Registration",
  description: "Join the best running events in the Philippines. Register, run, and track your results in one place.",
};

import ClientLayoutWrapper from "./ClientLayoutWrapper";
import { AlertProvider } from "@/components/ui/AlertProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${outfit.variable} antialiased bg-[var(--bg-primary)] text-white`} suppressHydrationWarning>
        {/* Outside ClientLayoutWrapper: that component returns early for
            /admin and /superadmin, so a provider mounted inside it would
            cover only half the app. */}
        <AlertProvider>
          <ClientLayoutWrapper>
            {children}
          </ClientLayoutWrapper>
        </AlertProvider>
      </body>
    </html>
  );
}
