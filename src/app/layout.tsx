import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { SITE_NAME, SITE_URL } from "@/lib/site-contact";
import { getSiteSettings } from "@/lib/site-settings";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" });

const TITLE = `${SITE_NAME} | Premium Running Event Registration`;
const DESCRIPTION =
  "Join the best running events. Register, run, and track your results in one place.";

/**
 * `metadataBase` is what turns `app/opengraph-image.png` into the absolute URL
 * a link preview needs: Messenger, Viber, Facebook, X and Slack all scrape
 * `og:image` and none of them will resolve a relative path. The favicon has
 * nothing to do with this — it is the browser tab only — so without a card
 * here a shared link showed no image at all. `openGraph` and `twitter` are
 * declared even though Next fills the image in on its own, because the title
 * and description a preview shows are otherwise the page title tag alone.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_PH",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

import ClientLayoutWrapper from "./ClientLayoutWrapper";
import ThemedFavicon from "@/components/ThemedFavicon";
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
        {/* Outside ClientLayoutWrapper: that component returns early for
            /admin, so a provider mounted inside it would
            cover only half the app. */}
        <ThemedFavicon />
        <SiteContactProvider contactEmail={contactEmail} socialLinks={socialLinks}>
          <AlertProvider>
            <ClientLayoutWrapper>
              {children}
            </ClientLayoutWrapper>
          </AlertProvider>
        </SiteContactProvider>
      </body>
    </html>
  );
}
