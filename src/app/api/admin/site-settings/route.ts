import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import prisma from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { EMAIL_EXAMPLE, invalidEmailMessage, looksLikeEmailAddress, normalizeEmailAddress } from '@/lib/email-address';
import { normalizeLink } from '@/lib/organizer-application';
import { SOCIAL_CHANNELS, socialLinkError, type SocialLinks } from '@/lib/site-contact';
import { SITE_SETTINGS_ID, SITE_SETTINGS_TAG, getSiteSettings } from '@/lib/site-settings';
import { platformActor } from '../platform-actor';

/**
 * The site-wide settings at /admin/settings (lib/site-settings.ts): the admin
 * email the whole app shows and sends from, and the footer's social links.
 *
 * Only `platform:manage` (platform-actor.ts): both are on every public page,
 * so they are Run As One's to change, never a client viewer's or a per-event
 * staff member's.
 *
 * **Each panel saves on its own.** The body carries `contactEmail`, or
 * `socialLinks`, and only what it carries is validated and written — the Admin
 * Email panel's Save can never overwrite a link, nor the reverse.
 *
 * The save expires the settings cache immediately rather than marking it stale,
 * so the page that reloads after the save — and the next email — already carry
 * the new values.
 */

/** The column each channel is stored in. */
const COLUMN = {
  facebook: 'facebookUrl',
  instagram: 'instagramUrl',
  tiktok: 'tiktokUrl',
  youtube: 'youtubeUrl',
} as const;

export async function PATCH(request: Request) {
  try {
    const { actor, refusal } = await platformActor();
    if (refusal) return refusal;

    const body = await request.json().catch(() => null);
    const hasEmail = body != null && 'contactEmail' in body;
    const hasLinks = body?.socialLinks != null && typeof body.socialLinks === 'object';

    if (!hasEmail && !hasLinks) {
      return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
    }

    const errors: Record<string, string> = {};

    let contactEmail: string | null = null;
    if (hasEmail) {
      contactEmail = normalizeEmailAddress(body.contactEmail);
      if (!contactEmail) {
        errors.contactEmail = 'Enter the email address the site should use';
      } else if (!looksLikeEmailAddress(contactEmail)) {
        errors.contactEmail = invalidEmailMessage(EMAIL_EXAMPLE);
      }
    }

    let links: SocialLinks | null = null;
    if (hasLinks) {
      const next = {} as SocialLinks;
      for (const channel of SOCIAL_CHANNELS) {
        const raw = body.socialLinks[channel.key];
        const value = typeof raw === 'string' ? raw.trim() : '';
        const problem = socialLinkError(channel, value);
        if (problem) errors[channel.key] = problem;
        next[channel.key] = value ? normalizeLink(value) : null;
      }
      links = next;
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const before = await getSiteSettings();
    const after = {
      contactEmail: contactEmail ?? before.contactEmail,
      socialLinks: links ?? before.socialLinks,
    };

    const emailChanged = contactEmail !== null && contactEmail !== before.contactEmail;
    const changedChannels = links
      ? SOCIAL_CHANNELS.filter(c => links[c.key] !== before.socialLinks[c.key])
      : [];

    if (emailChanged || changedChannels.length > 0) {
      const columns = {
        contactEmail: after.contactEmail,
        ...Object.fromEntries(
          SOCIAL_CHANNELS.map(c => [COLUMN[c.key], after.socialLinks[c.key]]),
        ),
      };

      await prisma.$transaction(async tx => {
        // The row may not exist yet; creating it writes the email in use now
        // (the default until somebody saved one), which changes nothing seen.
        await tx.siteSettings.upsert({
          where: { id: SITE_SETTINGS_ID },
          create: { id: SITE_SETTINGS_ID, ...columns },
          update: columns,
        });

        if (emailChanged) {
          await recordAudit(tx, actor, {
            action: 'settings.contact_email.changed',
            entityType: 'SiteSettings',
            entityId: SITE_SETTINGS_ID,
            summary: `Changed the admin email from ${before.contactEmail} to ${after.contactEmail}.`,
            changes: { contactEmail: [before.contactEmail, after.contactEmail] },
          });
        }

        if (changedChannels.length > 0) {
          await recordAudit(tx, actor, {
            action: 'settings.social_links.changed',
            entityType: 'SiteSettings',
            entityId: SITE_SETTINGS_ID,
            summary: `Changed the ${changedChannels.map(c => c.name).join(', ')} link${
              changedChannels.length === 1 ? '' : 's'
            }.`,
            changes: Object.fromEntries(
              changedChannels.map(c => [
                COLUMN[c.key],
                [before.socialLinks[c.key], after.socialLinks[c.key]],
              ]),
            ),
          });
        }
      });
      revalidateTag(SITE_SETTINGS_TAG, { expire: 0 });
    }

    return NextResponse.json({ settings: after });
  } catch (error) {
    console.error('Failed to save site settings:', error);
    return NextResponse.json({ error: 'Could not save the settings. Try again.' }, { status: 500 });
  }
}
