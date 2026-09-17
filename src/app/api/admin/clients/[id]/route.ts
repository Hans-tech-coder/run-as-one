import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { clientStatusAfter, clientStatusLabel } from '@/lib/client';
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
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor, refusal } = await platformActor();
    if (refusal) return refusal;

    const { id } = await params;
    const body = await request.json().catch(() => null);
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
