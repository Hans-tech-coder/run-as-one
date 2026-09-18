import { unstable_cache } from 'next/cache';
import prisma from './db';
import { DEFAULT_CONTACT_EMAIL, NO_SOCIAL_LINKS, type SocialLinks } from './site-contact';

/**
 * Site-wide settings Run As One's staff edit at /admin/settings, read from the
 * one `SiteSettings` row (`id = "site"`).
 *
 * Today that is the admin email and the footer's social links.
 *
 * **Cached, and cleared on save.** The footer is on every public page and every
 * email carries the address, so this is read far more often than it changes.
 * The read is cached under `SITE_SETTINGS_TAG`, and the settings route expires
 * that tag the moment a form is saved, so the new value is on the next page
 * anybody opens rather than after a timeout.
 *
 * **Never fails the page.** No row yet, or a database that is not reachable
 * (or not migrated) at this moment, falls back to the defaults in
 * lib/site-contact.ts. A footer or a receipt email is never worth an error
 * page.
 */

export const SITE_SETTINGS_ID = 'site';
export const SITE_SETTINGS_TAG = 'site-settings';

export type SiteSettingsValues = {
  contactEmail: string;
  /** Null for a channel with no saved link; the footer hides its icon. */
  socialLinks: SocialLinks;
};

const DEFAULTS: SiteSettingsValues = {
  contactEmail: DEFAULT_CONTACT_EMAIL,
  socialLinks: NO_SOCIAL_LINKS,
};

const readSiteSettings = unstable_cache(
  async (): Promise<SiteSettingsValues> => {
    const row = await prisma.siteSettings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: {
        contactEmail: true,
        facebookUrl: true,
        instagramUrl: true,
        tiktokUrl: true,
        youtubeUrl: true,
      },
    });
    if (!row) return DEFAULTS;
    return {
      contactEmail: row.contactEmail || DEFAULT_CONTACT_EMAIL,
      socialLinks: {
        facebook: row.facebookUrl || null,
        instagram: row.instagramUrl || null,
        tiktok: row.tiktokUrl || null,
        youtube: row.youtubeUrl || null,
      },
    };
  },
  // Versioned with the value's shape, so an entry cached before the social
  // links existed is never served as one that has them.
  ['site-settings', 'v2'],
  { tags: [SITE_SETTINGS_TAG] },
);

export async function getSiteSettings(): Promise<SiteSettingsValues> {
  try {
    return await readSiteSettings();
  } catch (error) {
    console.error('Could not read site settings; using the defaults:', error);
    return DEFAULTS;
  }
}

/** The address the app shows and mails from. See `SiteSettings.contactEmail`. */
export async function getContactEmail(): Promise<string> {
  return (await getSiteSettings()).contactEmail;
}
