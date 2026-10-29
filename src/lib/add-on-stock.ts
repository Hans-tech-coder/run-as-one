import { Prisma } from '@prisma/client';
import db from '@/lib/db';
import { addOnSalesClosed, stockLeft, type AddOnLine, type PublicAddOn } from '@/lib/add-ons';
import { SlotsUnavailableError } from '@/lib/registration-gate';
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

/**
 * **The last word on whether an order's add-ons can be sold**, taken inside
 * the transaction that writes the order, beside `reserveSlots` and for the
 * same reason: a count read before the write is a count two runners buying
 * the last shirt both pass.
 *
 * The items are locked `FOR UPDATE`, ordered by id so two checkouts never
 * deadlock on each other, and then read again under the lock: switched off
 * or past its cutoff since `priceCheckout` read it is refused here too, so a
 * staff save and an order can never both land. Stock is then counted
 * (`takenAddOnStock`, on the transaction) against what this order wants.
 *
 * Refused with `SlotsUnavailableError`, the error both checkout routes already
 * answer as a 409 carrying its own sentence: "the order no longer fits" is
 * exactly what a sold-out shirt is, and its message says which item and what
 * is left. A stock shortfall is the subclass `AddOnStockError`, which also
 * carries the item and the counts, for a caller that words it for staff.
 *
 * `alreadySold` is for an order taking back what it bought
 * (`retakeAddOnStock`): only the stock can refuse it. An item switched off
 * or past its cutoff since was still on sale when the order bought it, and
 * one deleted since is no longer there to count.
 */
export async function reserveAddOnStock(
  tx: Prisma.TransactionClient,
  lines: readonly Pick<AddOnLine, 'addOnId' | 'quantity'>[],
  now: Date = new Date(),
  { alreadySold = false }: { alreadySold?: boolean } = {},
): Promise<void> {
  const wanted = new Map<string, number>();
  for (const line of lines) wanted.set(line.addOnId, (wanted.get(line.addOnId) ?? 0) + line.quantity);
  if (wanted.size === 0) return;

  const ids = [...wanted.keys()].sort();
  const items = await tx.$queryRaw<{ id: string; name: string; active: boolean; stockLimit: number | null; salesCloseAt: Date | null }[]>(
    Prisma.sql`SELECT "id", "name", "active", "stockLimit", "salesCloseAt" FROM "EventAddOn" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`,
  );

  for (const id of alreadySold ? [] : ids) {
    const item = items.find(row => row.id === id);
    if (!item || !item.active || addOnSalesClosed(item, now)) {
      throw new SlotsUnavailableError(
        `${item?.name ?? 'An add-on you picked'} is no longer on sale. Remove it from the order and try again.`,
      );
    }
  }

  const limited = items.filter(item => item.stockLimit !== null);
  if (limited.length === 0) return;
  const taken = await takenAddOnStock(limited.map(item => item.id), tx);
  for (const item of limited) {
    const left = stockLeft(item, taken.get(item.id) ?? 0) ?? 0;
    const want = wanted.get(item.id) ?? 0;
    if (want > left) {
      throw new AddOnStockError(
        left === 0
          ? `${item.name} has just sold out. Remove it from the order and try again.`
          : `Only ${left} ${item.name} ${left === 1 ? 'is' : 'are'} left. Lower the quantity and try again.`,
        item.name,
        left,
        want,
      );
    }
  }
}

/** `reserveAddOnStock`'s stock shortfall: which item, what is left, what the order wants. */
export class AddOnStockError extends SlotsUnavailableError {
  constructor(
    message: string,
    readonly item: string,
    readonly left: number,
    readonly wanted: number,
  ) {
    super(message);
    this.name = 'AddOnStockError';
  }
}

/**
 * **An order taking its add-ons back** — the status route moving an expired,
 * cancelled or refunded order to PAID or PENDING, right after `reserveSlots`
 * takes its seats back, under the same locks in the same order (categories,
 * then items by id). The order's lines stopped counting when it left PAID or
 * PENDING, and the pieces may have sold since; this is the locked count that
 * stops a late bank slip overselling them. Lines on removed runners and lines
 * whose item was deleted (`addOnId` null) take nothing.
 */
export async function retakeAddOnStock(tx: Prisma.TransactionClient, registrationId: string): Promise<void> {
  const lines = await tx.runnerAddOn.findMany({
    where: { addOnId: { not: null }, runner: { registrationId, deletedAt: null } },
    select: { addOnId: true, quantity: true },
  });
  await reserveAddOnStock(
    tx,
    lines.flatMap(line => (line.addOnId ? [{ addOnId: line.addOnId, quantity: line.quantity }] : [])),
    new Date(),
    { alreadySold: true },
  );
}

type PublicReadClient = Pick<Prisma.TransactionClient, 'runnerAddOn' | 'eventAddOn'>;

/**
 * One event's items for the runner side — the event page and the wizard —
 * with what is left of each (D9). Switched-off items are left out; a closed or
 * sold-out one is kept, marked, because it stays visible. Two queries
 * whatever the number of items. `client` is the cached public reader on the
 * event page (lib/public-db.ts), the plain client in the wizard.
 */
export async function publicAddOns(eventId: string, client: PublicReadClient = db): Promise<PublicAddOn[]> {
  const rows = await client.eventAddOn.findMany({
    where: { eventId, active: true },
    orderBy: ADD_ON_ORDER,
    select: {
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
    },
  });
  const taken = await takenAddOnStock(rows.map(row => row.id), client);
  return rows.map(row => {
    const left = stockLeft(row, taken.get(row.id) ?? 0);
    return { ...row, salesCloseAt: row.salesCloseAt?.toISOString() ?? null, left, soldOut: left === 0 };
  });
}
