import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { SITE_NAME } from "@/lib/site-contact";
import { getSiteSettings } from "@/lib/site-settings";
import { getSiteClient, siteOrigin } from "@/lib/site-client";

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
 *
 * On a client's site (CLIENT_SUBDOMAIN_PLAN.md) the base is the client's own
 * host and the title carries the client's name, so a shared link reads as
 * that client's page (lib/site-client.ts).
 */
export async function generateMetadata(): Promise<Metadata> {
  const [site, origin] = await Promise.all([getSiteClient(), siteOrigin()]);
  const title = site ? `${site.name} | Events & Results` : TITLE;
  const description = site
    ? `Register for ${site.name}'s races and look up your results. Powered by ${SITE_NAME}.`
    : DESCRIPTION;

  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: {
      type: "website",
      siteName: site?.name ?? SITE_NAME,
      title,
      description,
      url: origin,
      locale: "en_PH",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

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
  // The client whose site this is, or null on the main site. Its branding
  // replaces Run As One's in the navbar and footer; an unknown subdomain is
  // sent to the main site from inside this call.
  const site = await getSiteClient();

  return (
    <html lang="en">
      <body className={`${inter.variable} ${outfit.variable} antialiased bg-[var(--bg-primary)] text-primary`} suppressHydrationWarning>
        {/* Outside ClientLayoutWrapper: that component returns early for
            /admin, so a provider mounted inside it would
            cover only half the app. */}
        <ThemedFavicon />
        <SiteContactProvider contactEmail={contactEmail} socialLinks={socialLinks}>
          <AlertProvider>
            <ClientLayoutWrapper site={site}>
              {children}
            </ClientLayoutWrapper>
          </AlertProvider>
        </SiteContactProvider>
      </body>
    </html>
  );
}
