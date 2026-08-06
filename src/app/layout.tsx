import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "StrideSync | Premium Running Event Registration",
  description: "Join the best running events in the Philippines. Register, run, and track your results in one place.",
};

import ConditionalFooter from "@/components/ConditionalFooter";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${outfit.variable}`} suppressHydrationWarning>
        {children}
        <ConditionalFooter />
      </body>
    </html>
  );
}
