import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { formatPesos } from '@/lib/money';
import { readPlatformFee } from '@/lib/platform-fee';

/**
 * The **Default Platform Fee** panel on /admin/settings (SETTINGS_PLAN.md
 * Batch 4): `{ adminFee }` in pesos as typed.
 *
 * `org:settings` — the Super Admin alone. The value is `Organizer.adminFee` on
 * the actor's own tenant, and it only seeds the create-event form: every
 * existing event keeps its own `Event.adminFee`, so nothing already on sale is
 * repriced by this write.
 */
export async function PATCH(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(actor, 'org:settings', { organizerId: actor.orgId })) {
      return NextResponse.json(
        { error: 'Only the Super Admin can change the default platform fee.' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const { value, error } = readPlatformFee(body?.adminFee);
    if (error || value === null) {
      return NextResponse.json({ errors: { adminFee: error } }, { status: 400 });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { id: actor.orgId },
      select: { adminFee: true },
    });
    if (!organizer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // An unchanged value writes nothing, and so leaves no trail row.
    if (organizer.adminFee !== value) {
      await prisma.$transaction(async tx => {
        await tx.organizer.update({ where: { id: actor.orgId }, data: { adminFee: value } });
        await recordAudit(tx, actor, {
          action: 'settings.platform_fee.changed',
          entityType: 'Organizer',
          entityId: actor.orgId,
          summary: `Changed the default platform fee from ₱${formatPesos(organizer.adminFee)} to ₱${formatPesos(value)} per runner.`,
          changes: { adminFee: [organizer.adminFee, value] },
        });
      });
    }

    return NextResponse.json({ adminFee: value });
  } catch (error) {
    console.error('Failed to save the default platform fee:', error);
    return NextResponse.json(
      { error: 'Could not save the default platform fee. Try again.' },
      { status: 500 },
    );
  }
}
