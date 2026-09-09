/**
 * Who RunAsOne is, and how a runner reaches it.
 *
 * The footer, the 404 page and the two legal pages all quote the same address
 * and the same channel list, so they read it from here instead of each
 * retyping it. These are constants today; the superadmin settings screen is
 * meant to own them later, and when it does this module is the only file that
 * has to change.
 */

export const SITE_NAME = 'RunAsOne';

/**
 * Where the site lives on the open internet.
 *
 * Two things need an absolute URL rather than a path: the Open Graph card a
 * link preview scrapes, and the logo an email client fetches from outside the
 * app entirely. `NEXT_PUBLIC_SITE_URL` lets a preview deployment describe
 * itself correctly; production falls back to the real domain rather than to
 * `VERCEL_URL`, whose per-deployment hostname would put a URL that dies with
 * the deployment into an email a runner keeps.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://run-as-one.vercel.app';

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
