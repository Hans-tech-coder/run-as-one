/**
 * Who Run As One is, and how a runner reaches it.
 *
 * The footer, the 404 page and the two legal pages all quote the same address
 * and the same channel list, so they read it from here instead of each
 * retyping it. The contact address and the social links have moved to platform
 * settings staff edit at /admin/settings (lib/site-settings.ts); what stays
 * here is their defaults and the rules around them, because client components import this module and the
 * settings module reads the database.
 */

import { looksLikeLink, normalizeLink } from './organizer-application';

/**
 * The brand, spelled the one way it is allowed to be spelled.
 *
 * Every surface that names the platform in prose — the footer's copyright, the
 * two legal pages, the Open Graph `siteName`, the sender name and footer on
 * every email — reads it from here, so the name cannot be half-changed. The
 * logo lockup's wordmark is the one other copy, because it is separately styled
 * DOM text; change the two together.
 */
export const SITE_NAME = 'Run As One';

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
 * and showed the featured event's poster instead of the Run As One card, over a
 * `run-as-one.vercel.app` byline nobody could open.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  'https://run-as-one.cresendorunningcommunity.com';

/**
 * The inbox a runner or an organizer reaches until somebody saves a different
 * one at /admin/settings. Never read this to *show* the address — read
 * `getContactEmail()` in lib/site-settings.ts (server) or `useContactEmail()`
 * in components/SiteContactProvider.tsx (client), which return the saved one.
 */
export const DEFAULT_CONTACT_EMAIL = 'info@cresendorunningcommunity.com';

/**
 * The one domain Resend is verified to send from.
 *
 * Resend refuses a `from` address on any other domain, so the contact email
 * can only be the sender while it is on this domain. Set to a Gmail or any
 * other address, it still becomes the reply-to and every address the app
 * shows, and mail goes out from `DEFAULT_CONTACT_EMAIL` instead — a runner's
 * receipt must never stop because of a settings change. Verifying a new
 * domain in Resend is what moves the sender; change this constant with it.
 * The API key is send-only, so the app cannot ask Resend which domains are
 * verified and has to be told here.
 */
export const EMAIL_SENDING_DOMAIN = 'cresendorunningcommunity.com';

/** Whether mail can go out *from* this address, not only reply to it. */
export function canSendFrom(email: string): boolean {
  return email.split('@').pop()?.toLowerCase() === EMAIL_SENDING_DOMAIN;
}

/** A `mailto:` link for the contact address. */
export function supportMailto(email: string): string {
  return `mailto:${email}`;
}

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
  /** Hostnames a link to this channel lives on; a subdomain of one counts. */
  hosts: readonly string[];
  /** A sample address for the settings field and its error message. */
  example: string;
};

/**
 * The channels the footer can show, in the order it shows them.
 *
 * The links themselves are platform settings (lib/site-settings.ts), saved at
 * /admin/settings. A channel with no saved link is **left out of the footer**
 * — never pointed at `#`, a guessed profile, or a placeholder page.
 */
export const SOCIAL_CHANNELS: readonly SocialChannel[] = [
  { key: 'facebook', name: 'Facebook', hosts: ['facebook.com', 'fb.com', 'fb.me'], example: 'facebook.com/runasone' },
  { key: 'instagram', name: 'Instagram', hosts: ['instagram.com', 'instagr.am'], example: 'instagram.com/runasone' },
  { key: 'tiktok', name: 'TikTok', hosts: ['tiktok.com'], example: 'tiktok.com/@runasone' },
  { key: 'youtube', name: 'YouTube', hosts: ['youtube.com', 'youtu.be'], example: 'youtube.com/@runasone' },
];

/** Each channel's saved link, or null when it has none. */
export type SocialLinks = Record<SocialChannelKey, string | null>;

export const NO_SOCIAL_LINKS: SocialLinks = {
  facebook: null,
  instagram: null,
  tiktok: null,
  youtube: null,
};

/** Longer than any real profile address, short enough to stop a pasted essay. */
export const MAX_SOCIAL_LINK = 300;

/**
 * What is wrong with a typed link for this channel, or null when it will do.
 *
 * Empty is fine — it clears the link and hides the icon. Otherwise the value
 * has to be a web address (`looksLikeLink`, the rule the organizer application
 * uses for its website) *on that channel's site*, because the likeliest slip on
 * a form of four look-alike boxes is pasting the Instagram link into the
 * Facebook one.
 */
export function socialLinkError(channel: SocialChannel, value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (raw.length > MAX_SOCIAL_LINK) {
    return `That link is longer than ${MAX_SOCIAL_LINK} characters.`;
  }
  if (!looksLikeLink(raw)) {
    return `That does not look like a web address. Paste the full link, like ${channel.example}.`;
  }
  let host: string;
  try {
    host = new URL(normalizeLink(raw)).hostname.toLowerCase();
  } catch {
    return `That does not look like a web address. Paste the full link, like ${channel.example}.`;
  }
  const onChannel = channel.hosts.some(h => host === h || host.endsWith(`.${h}`));
  if (!onChannel) {
    return `That is not a ${channel.name} link. Paste the address of the ${channel.name} page, like ${channel.example}.`;
  }
  return null;
}
