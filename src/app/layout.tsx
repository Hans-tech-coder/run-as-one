import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { getSiteSettings } from "@/lib/site-settings";
import { siteMetadata } from "@/lib/site-metadata";
import { deploymentOrigin } from "@/lib/site-host";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" });

/**
 * What every page shares: the document, the fonts, the platform settings.
 *
 * **No request API here** (PUBLIC_PAGE_CACHE_PLAN.md §2). One `headers()` call
 * in the root layout makes every route in the app dynamic, so which site a
 * page is on is read further down: `s/[site]/layout.tsx` from the route
 * param, `RequestSiteLayout` from the proxy's header. Those also draw the
 * navbar and footer (SiteFrame) and say the site's metadata, over this
 * main-site default — which is what the dashboard, the one part of the app on
 * the main host alone, keeps (lib/site-metadata.ts).
 */
export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata(null, deploymentOrigin());
}

import { AlertProvider } from "@/components/ui/AlertProvider";
import { SiteContactProvider } from "@/components/SiteContactProvider";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Platform settings (lib/site-settings.ts), read once here so every client
  // component under the layout gets the saved address from useContactEmail()
  // and the footer's links from useSocialLinks().
  const { contactEmail, socialLinks } = await getSiteSettings();

  return (
    <html lang="en">
      <body className={`${inter.variable} ${outfit.variable} antialiased bg-[var(--bg-primary)] text-primary`} suppressHydrationWarning>
        {/* Outside the site frame: that is drawn by the layouts below this
            one, and skipped for /admin, so a provider mounted inside it would
            cover only part of the app. */}
        <SiteContactProvider contactEmail={contactEmail} socialLinks={socialLinks}>
          <AlertProvider>
            {children}
          </AlertProvider>
        </SiteContactProvider>
      </body>
    </html>
  );
}
