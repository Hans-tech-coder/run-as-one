import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import type { Actor } from '@/lib/actor';
import { changedFields, listFields, recordAudit } from '@/lib/audit';
import { clientStatusAfter, clientStatusLabel } from '@/lib/client';
import { BRANDING_FIELDS, readBranding, type BrandingField } from '@/lib/client-branding';
import { platformActor } from '../../platform-actor';

/**
 * Archiving a client submission, or bringing one back (ADMIN_MERGE_PLAN.md,
 * Batch 3).
 *
 * `{ status: 'ARCHIVED' }` takes it out of the queue; `{ status: 'NEW' }`
 * restores an archived one. **A status, never a delete**: the submission is a
 * record of somebody who asked to work with Run As One, and an archived
 * client's viewers are simply refused on their next request
 * (`clientViewersCanSignIn`). Restoring lands on NEW rather than on whatever
 * it was before, so a sign-in comes back only when somebody sends an invite
 * again (lib/client.ts).
 *
 * Inviting has its own route (`[id]/invite`), because it creates an account
 * and sends an email. The write is conditional on the status the screen saw,
 * so two staff members acting at once cannot both win, and it shares its
 * transaction with the trail row.
 *
 * `{ branding: {…} }` instead saves the client's own site — its subdomain and
 * branding (CLIENT_SUBDOMAIN_PLAN.md D7), checked by lib/client-branding.ts —
 * and never touches the status.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor, refusal } = await platformActor();
    if (refusal) return refusal;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (body?.branding != null) return await saveBranding(actor, id, body.branding);

    const wanted = typeof body?.status === 'string' ? body.status.trim().toUpperCase() : '';
    const move = wanted === 'ARCHIVED' ? 'archive' : wanted === 'NEW' ? 'restore' : null;

    if (!move) {
      return NextResponse.json(
        { error: 'A client can only be archived or restored here.' },
        { status: 400 },
      );
    }

    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
    if (!client) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    const next = clientStatusAfter(client.status, move);
    if (!next) {
      return NextResponse.json(
        {
          error: `${client.name} is ${clientStatusLabel(client.status).toLowerCase()}, so it cannot be ${
            move === 'archive' ? 'archived' : 'restored'
          }.`,
        },
        { status: 409 },
      );
    }

    const moved = await prisma.$transaction(async tx => {
      const claim = await tx.client.updateMany({
        where: { id, status: client.status },
        data: { status: next },
      });
      if (claim.count === 0) return false;

      await recordAudit(tx, actor, {
        action: move === 'archive' ? 'client.archived' : 'client.restored',
        entityType: 'Client',
        entityId: id,
        summary:
          move === 'archive'
            ? `Archived the client ${client.name}.`
            : `Restored the client ${client.name} to the submissions list.`,
        changes: { status: [client.status, next] },
      });
      return true;
    });

    if (!moved) {
      return NextResponse.json(
        { error: `${client.name} changed while you were looking at it. The list has been refreshed.` },
        { status: 409 },
      );
    }

    return NextResponse.json({ id, status: next });
  } catch (error) {
    console.error('Client status error:', error);
    return NextResponse.json({ error: 'Something went wrong while saving the client.' }, { status: 500 });
  }
}

/** How each field is named in the trail's summary. */
const FIELD_NAMES: Record<BrandingField, string> = {
  subdomain: 'subdomain',
  logoUrl: 'logo',
  heroImageUrl: 'hero image',
  heroHeadline: 'headline',
  heroTagline: 'tagline',
  publicEmail: 'public email',
  publicPhone: 'public phone',
  facebookUrl: 'Facebook',
  instagramUrl: 'Instagram',
  tiktokUrl: 'TikTok',
  youtubeUrl: 'YouTube',
};

const TAKEN = (label: string) => `Another client already uses ${label}. Choose a different subdomain.`;

/**
 * The **Site & branding** save. The whole section arrives each time; only the
 * fields that moved are written to the trail. A subdomain is unique, so one
 * already held by another client is refused by name — by the check first, and
 * by the index if two saves race.
 */
async function saveBranding(actor: Actor, id: string, input: unknown) {
  const { branding, errors } = readBranding(input);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true, ...Object.fromEntries(BRANDING_FIELDS.map(f => [f, true])) },
  });
  if (!client) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }

  const before = client as unknown as Record<string, unknown>;
  if (branding.subdomain && branding.subdomain !== before.subdomain) {
    const holder = await prisma.client.findUnique({
      where: { subdomain: branding.subdomain },
      select: { id: true },
    });
    if (holder) {
      return NextResponse.json({ errors: { subdomain: TAKEN(branding.subdomain) } }, { status: 409 });
    }
  }

  const changes = changedFields(before, { ...branding }, BRANDING_FIELDS);
  const moved = Object.keys(changes) as BrandingField[];
  if (moved.length === 0) {
    return NextResponse.json({ id, branding });
  }

  try {
    await prisma.$transaction(async tx => {
      await tx.client.update({ where: { id }, data: branding });
      await recordAudit(tx, actor, {
        action: 'client.branding.changed',
        entityType: 'Client',
        entityId: id,
        summary: `Changed the ${listFields(moved.map(f => FIELD_NAMES[f]))} of ${client.name}'s site.`,
        changes,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && branding.subdomain) {
      return NextResponse.json({ errors: { subdomain: TAKEN(branding.subdomain) } }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ id, branding });
}
