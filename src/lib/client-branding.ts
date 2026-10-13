import { invalidEmailMessage, looksLikeEmailAddress, normalizeEmailAddress } from './email-address';
import { normalizeLink } from './organizer-application';
import { parseE164, phoneNumberError } from './phone';
import { SOCIAL_CHANNELS, socialLinkError, type SocialChannelKey } from './site-contact';
import { subdomainError } from './site-host';

/**
 * What a client's own site may hold (CLIENT_SUBDOMAIN_PLAN.md D7, D8): its
 * subdomain, logo, the hero on its /events page, and the public contacts and
 * socials its footer shows. One rule, read by the **Site & branding** section
 * on /admin/clients as a person types and by `PATCH /api/admin/clients/[id]`
 * before it writes, so the two can never disagree.
 *
 * Every field is optional, and empty means "not set" (null in the database).
 * The images must be uploads to the public blob store (`/api/upload`,
 * `folder: clients`), never an address from somewhere else, so a client's page
 * cannot be made to load a third party's image. Only staff with
 * `platform:manage` edit any of it.
 */

export interface ClientBranding {
  subdomain: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  heroHeadline: string | null;
  heroTagline: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
}

export type BrandingField = keyof ClientBranding;

export const BRANDING_FIELDS: readonly BrandingField[] = [
  'subdomain',
  'logoUrl',
  'heroImageUrl',
  'heroHeadline',
  'heroTagline',
  'publicEmail',
  'publicPhone',
  'facebookUrl',
  'instagramUrl',
  'tiktokUrl',
  'youtubeUrl',
];

/** The column each social channel is kept in, as on SiteSettings. */
export const SOCIAL_COLUMN: Record<SocialChannelKey, BrandingField> = {
  facebook: 'facebookUrl',
  instagram: 'instagramUrl',
  tiktok: 'tiktokUrl',
  youtube: 'youtubeUrl',
};

export const MAX_HERO_HEADLINE = 80;
export const MAX_HERO_TAGLINE = 160;
const MAX_IMAGE_URL = 500;

/** The form's copy of the branding: every field a string, empty when unset. */
export type BrandingDraft = Record<BrandingField, string>;

export function brandingDraft(branding: ClientBranding): BrandingDraft {
  return Object.fromEntries(BRANDING_FIELDS.map(field => [field, branding[field] ?? ''])) as BrandingDraft;
}

/** An upload to the public blob store, which is the only place an image may come from. */
function isPublicBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

/** What is wrong with one field's value, or null when it will do. */
export function brandingFieldError(field: BrandingField, value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  switch (field) {
    case 'subdomain':
      return subdomainError(raw);
    case 'logoUrl':
    case 'heroImageUrl':
      return raw.length <= MAX_IMAGE_URL && isPublicBlobUrl(raw)
        ? null
        : 'Upload the image here rather than linking to one.';
    case 'heroHeadline':
      return raw.length > MAX_HERO_HEADLINE
        ? `Keep the headline to ${MAX_HERO_HEADLINE} characters.`
        : null;
    case 'heroTagline':
      return raw.length > MAX_HERO_TAGLINE
        ? `Keep the tagline to ${MAX_HERO_TAGLINE} characters.`
        : null;
    case 'publicEmail':
      return looksLikeEmailAddress(raw) ? null : invalidEmailMessage();
    case 'publicPhone':
      // The phone field hands back "" once its digits are cleared.
      return parseE164(raw).national ? phoneNumberError(raw) : null;
    default: {
      const channel = SOCIAL_CHANNELS.find(c => SOCIAL_COLUMN[c.key] === field);
      return channel ? socialLinkError(channel, raw) : null;
    }
  }
}

/** The value a field is stored as: trimmed, lowercased or given its scheme, null when empty. */
function storedValue(field: BrandingField, value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (field === 'subdomain') return raw.toLowerCase();
  if (field === 'publicEmail') return normalizeEmailAddress(raw);
  if (field === 'publicPhone') return parseE164(raw).national ? raw : null;
  if (Object.values(SOCIAL_COLUMN).includes(field)) return normalizeLink(raw);
  return raw;
}

/**
 * A request body's branding, checked: what to store, or each wrong field's
 * message. A field the body leaves out, or sends as something other than a
 * string, is treated as empty, so a save always describes the whole section.
 */
export function readBranding(input: unknown): {
  branding: ClientBranding;
  errors: Partial<Record<BrandingField, string>>;
} {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const branding = {} as ClientBranding;
  const errors: Partial<Record<BrandingField, string>> = {};

  for (const field of BRANDING_FIELDS) {
    const raw = typeof source[field] === 'string' ? (source[field] as string) : '';
    const problem = brandingFieldError(field, raw);
    if (problem) errors[field] = problem;
    branding[field] = storedValue(field, raw);
  }
  return { branding, errors };
}
