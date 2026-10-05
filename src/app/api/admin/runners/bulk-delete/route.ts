import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { runnerRef } from '@/lib/order-ref';
import { cancelEmptiedOrders, emptiedOrderAudit } from '@/lib/pending-expiry';

/**
 * Removing several runners at once from the registrants table.
 *
 * Soft, like the single delete in `runners/[id]`: the rows stay with
 * `deletedAt` set, and the trail gets **one row per runner**, each naming the
 * person and their reference — "somebody deleted three runners" is not a line
 * anyone can act on, and it would give the activity screen no runner to link.
 *
 * A PENDING order left with no live runner is cancelled in the same
 * transaction, with its promo handed back, exactly as the single delete does
 * (`cancelEmptiedOrders`, UNPAID_ORDERS_PLAN.md Batch 5).
 */
export async function POST(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { runnerIds } = body;

    if (!Array.isArray(runnerIds) || runnerIds.length === 0) {
      return NextResponse.json({ error: 'Invalid runner IDs' }, { status: 400 });
    }

    // Verify the actor may remove runners on the events these belong to
    const runners = await db.runner.findMany({
      where: {
        id: { in: runnerIds },
        deletedAt: null,
      },
      include: {
        registration: {
          select: {
            orderRef: true,
            eventId: true,
            event: { select: { organizerId: true } },
            _count: { select: { runners: { where: { deletedAt: null } } } },
          },
        },
      },
    });

    if (runners.length === 0) {
      return NextResponse.json({ error: 'Runners not found' }, { status: 404 });
    }

    const unauthorizedRunners = runners.filter(
      runner =>
        !can(actor, 'registration:delete', {
          organizerId: runner.registration.event.organizerId,
          eventId: runner.registration.eventId,
        }),
    );
    if (unauthorizedRunners.length > 0) {
      return NextResponse.json({ error: 'Unauthorized to delete some runners' }, { status: 401 });
    }

    const removedAt = new Date();
    const cancelled = await db.$transaction(async tx => {
      await tx.runner.updateMany({
        where: { id: { in: runners.map(runner => runner.id) }, deletedAt: null },
        data: { deletedAt: removedAt, deletedById: actor.id },
      });
      const emptied = await cancelEmptiedOrders(
        tx,
        runners.map(runner => ({
          registrationId: runner.registrationId,
          categoryId: runner.categoryId,
          promoPrice: runner.promoPrice,
        })),
      );
      const orderOf = new Map(runners.map(runner => [runner.registrationId, runner.registration]));
      await recordAudit(tx, actor, [
        ...runners.map(runner => ({
          action: 'runner.deleted' as const,
          entityType: 'Runner' as const,
          entityId: runner.id,
          eventId: runner.registration.eventId,
          organizerId: runner.registration.event.organizerId,
          summary: `Deleted runner ${runner.firstName} ${runner.lastName} (${runnerRef(
            runner.registration.orderRef,
            runner.runnerNo,
            runner.registration._count.runners,
          )}) from order ${runner.registration.orderRef}.`,
          changes: { bulk: true },
        })),
        ...emptied.map(order => {
          const { eventId, event } = orderOf.get(order.registrationId)!;
          return emptiedOrderAudit(order, { eventId, organizerId: event.organizerId });
        }),
      ]);
      return emptied;
    });

    return NextResponse.json({
      success: true,
      deletedCount: runners.length,
      cancelledOrders: cancelled.map(order => order.orderRef),
    });
  } catch (error: any) {
    console.error('Bulk delete runner error:', error);
    return NextResponse.json({ error: 'Failed to delete runners', details: error.message }, { status: 500 });
  }
}
