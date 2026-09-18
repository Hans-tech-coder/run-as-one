import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import prisma from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { EMAIL_EXAMPLE, invalidEmailMessage, looksLikeEmailAddress, normalizeEmailAddress } from '@/lib/email-address';
import { SITE_SETTINGS_ID, SITE_SETTINGS_TAG, getSiteSettings } from '@/lib/site-settings';
import { platformActor } from '../platform-actor';

/**
 * The site-wide settings at /admin/settings — today, the admin email the whole
 * app shows and sends from (lib/site-settings.ts).
 *
 * Only `platform:manage` (platform-actor.ts): this address is on every public
 * page and every runner's receipt, so it is Run As One's to change, never a
 * client viewer's or a per-event staff member's.
 *
 * The save expires the settings cache immediately rather than marking it stale,
 * so the page that reloads after the save — and the next email — already carry
 * the new address.
 */
export async function PATCH(request: Request) {
  try {
    const { actor, refusal } = await platformActor();
    if (refusal) return refusal;

    const body = await request.json().catch(() => null);
    const contactEmail = normalizeEmailAddress(body?.contactEmail);

    if (!contactEmail) {
      return NextResponse.json(
        { errors: { contactEmail: 'Enter the email address the site should use' } },
        { status: 400 },
      );
    }
    if (!looksLikeEmailAddress(contactEmail)) {
      return NextResponse.json(
        { errors: { contactEmail: invalidEmailMessage(EMAIL_EXAMPLE) } },
        { status: 400 },
      );
    }

    const before = (await getSiteSettings()).contactEmail;

    if (before !== contactEmail) {
      await prisma.$transaction(async tx => {
        await tx.siteSettings.upsert({
          where: { id: SITE_SETTINGS_ID },
          create: { id: SITE_SETTINGS_ID, contactEmail },
          update: { contactEmail },
        });
        await recordAudit(tx, actor, {
          action: 'settings.contact_email.changed',
          entityType: 'SiteSettings',
          entityId: SITE_SETTINGS_ID,
          summary: `Changed the admin email from ${before} to ${contactEmail}.`,
          changes: { contactEmail: [before, contactEmail] },
        });
      });
      revalidateTag(SITE_SETTINGS_TAG, { expire: 0 });
    }

    return NextResponse.json({ settings: { contactEmail } });
  } catch (error) {
    console.error('Failed to save site settings:', error);
    return NextResponse.json({ error: 'Could not save the admin email. Try again.' }, { status: 500 });
  }
}
