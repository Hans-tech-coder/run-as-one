import type { Prisma } from '@prisma/client';
import db from '@/lib/db';
import { SLOT_HOLDING_STATUSES } from '@/lib/slot-holds';

/**
 * **How many pieces of each add-on have been taken** (ADD_ONS_PLAN.md).
 *
 * A piece is taken by a line on a live order: PAID, or PENDING — the same
 * reading `slot-holds.ts` gives a category's seats, and for the same reason. A
 * bank transfer sits PENDING until a human has looked at the proof, and
 * selling its shirt twice in the meantime is what a stock limit exists to
 * prevent. Reading `SLOT_HOLDING_STATUSES` rather than a copy of it is what
 * gives an expired checkout's stock back through the existing sweep, with no
 * code of its own: the sweep moves the order out of PENDING, and its lines
 * stop counting.
 *
 * A runner an organizer removed takes nothing, as they hold no seat.
 *
 * `client` is the transaction handle when a checkout counts under its lock,
 * the plain client everywhere else, so the two readings never fork.
 */

type StockCountClient = Pick<Prisma.TransactionClient, 'runnerAddOn'>;

/** Pieces taken per add-on id. An id with none taken is absent (read as 0). */
export async function takenAddOnStock(
  addOnIds: string[],
  client: StockCountClient = db,
): Promise<Map<string, number>> {
  if (addOnIds.length === 0) return new Map();

  const rows = await client.runnerAddOn.groupBy({
    by: ['addOnId'],
    where: {
      addOnId: { in: addOnIds },
      runner: {
        deletedAt: null,
        registration: { status: { in: [...SLOT_HOLDING_STATUSES] } },
      },
    },
    _sum: { quantity: true },
  });

  return new Map(rows.flatMap(row => (row.addOnId ? [[row.addOnId, row._sum.quantity ?? 0] as const] : [])));
}

/**
 * Whether any order, of any status, ever bought this item. Not the stock
 * count: a cancelled order's line no longer takes stock, but it is still a
 * receipt that names the item, so the item can be switched off and not
 * deleted.
 */
export async function addOnHasSales(addOnId: string, client: StockCountClient = db): Promise<boolean> {
  const line = await client.runnerAddOn.findFirst({ where: { addOnId }, select: { id: true } });
  return line !== null;
}

/** The columns the admin panel and its route read back for an item. */
export const ADD_ON_SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  imageUrls: true,
  optionKind: true,
  options: true,
  maxPerRunner: true,
  stockLimit: true,
  salesCloseAt: true,
  categoryIds: true,
  soldBy: true,
  active: true,
  sortOrder: true,
} satisfies Prisma.EventAddOnSelect;

export type AdminAddOn = Prisma.EventAddOnGetPayload<{ select: typeof ADD_ON_SELECT }> & {
  /** Pieces taken by live orders — the `sold` of the panel's `sold / limit`. */
  sold: number;
  /** Whether any order ever bought it, which is what bars deleting it. */
  hasSales: boolean;
};

/** Every add-on is listed in this order, by the panel and (later) the runner side. */
export const ADD_ON_ORDER = [{ sortOrder: 'asc' }, { createdAt: 'asc' }] satisfies Prisma.EventAddOnOrderByWithRelationInput[];

/**
 * One event's add-ons for the admin panel, each with what it has sold.
 * Three queries whatever the number of items: the rows, the live count, and
 * which items any line ever named.
 */
export async function addOnsForEvent(eventId: string): Promise<AdminAddOn[]> {
  const rows = await db.eventAddOn.findMany({ where: { eventId }, orderBy: ADD_ON_ORDER, select: ADD_ON_SELECT });
  const ids = rows.map(row => row.id);
  const [taken, everSold] = await Promise.all([
    takenAddOnStock(ids),
    ids.length === 0
      ? Promise.resolve([])
      : db.runnerAddOn.groupBy({ by: ['addOnId'], where: { addOnId: { in: ids } }, _count: { _all: true } }),
  ]);
  const withSales = new Set(everSold.map(row => row.addOnId));
  return rows.map(row => ({ ...row, sold: taken.get(row.id) ?? 0, hasSales: withSales.has(row.id) }));
}
