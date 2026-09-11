/**
 * Who Run As One by: CRC is, and how a runner reaches it.
 *
 * The footer, the 404 page and the two legal pages all quote the same address
 * and the same channel list, so they read it from here instead of each
 * retyping it. These are constants today; the superadmin settings screen is
 * meant to own them later, and when it does this module is the only file that
 * has to change.
 */

/**
 * The brand, spelled the one way it is allowed to be spelled.
 *
 * Every surface that names the platform in prose — the footer's copyright, the
 * two legal pages, the Open Graph `siteName`, the sender name and footer on
 * every email — reads it from here, so the name cannot be half-changed. The
 * parent brand is part of it: "Run As One" alone is not the product's name on
 * any surface, the same rule the logo lockup follows by rendering "by: CRC" on
 * every variant that has a wordmark.
 */
export const SITE_NAME = 'Run As One by: CRC';

/**
 * Where the site lives on the open internet.
 *
 * Two things need an absolute URL rather than a path: the Open Graph card a
 * link preview scrapes, and the logo an email client fetches from outside the
 * app entirely. `NEXT_PUBLIC_SITE_URL` lets a preview deployment describe
 * itself correctly; production falls back to the real domain rather than to
 * `VERCEL_URL`, whose per-deployment hostname would put a URL that dies with
 * the deployment into an email a runner keeps.
 *
 * **This has to be a hostname the Vercel project actually serves.** The
 * fallback used to be `run-as-one.vercel.app`, which was never one of the
 * project's domains — the only production domain is the one below. Everything
 * on the page still rendered, so the mistake was invisible in a browser, but
 * `metadataBase` made `og:image` absolute against that dead host: Facebook's
 * crawler could not fetch the card, fell back to the largest image on the page,
 * and showed the featured event's poster instead of the Run As One by: CRC card, over a
 * `run-as-one.vercel.app` byline nobody could open.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  'https://run-as-one.cresendorunningcommunity.com';

/** The inbox a runner or an organizer actually reaches. */
export const CONTACT_EMAIL = 'info@cresendorunningcommunity.com';

export const SUPPORT_MAILTO = `mailto:${CONTACT_EMAIL}`;

/**
 * The date the Terms and the Privacy Policy were last rewritten.
 *
 * Both pages show it, because a legal page with no date tells a reader nothing
 * about whether the terms they agreed to are the ones on screen.
 */
export const LEGAL_LAST_UPDATED = 'September 5, 2026';

export type SocialChannelKey = 'facebook' | 'instagram' | 'tiktok' | 'youtube';

export type SocialChannel = {
  key: SocialChannelKey;
  name: string;
};

/**
 * The channels the footer shows.
 *
 * None of them has a URL yet, so every one points at /coming-soon rather than
 * at a `#` that goes nowhere or a guessed profile that may not be ours. When
 * the real links exist, give each entry an `href` and let the footer prefer it.
 */
export const SOCIAL_CHANNELS: readonly SocialChannel[] = [
  { key: 'facebook', name: 'Facebook' },
  { key: 'instagram', name: 'Instagram' },
  { key: 'tiktok', name: 'TikTok' },
  { key: 'youtube', name: 'YouTube' },
];

/** Where a social icon sends someone until that channel is live. */
export function socialChannelHref(name: string): string {
  return `/coming-soon?channel=${encodeURIComponent(name)}`;
}
