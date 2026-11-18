import type { Prisma } from '@prisma/client';
import type { MoneyRunner } from './runner-money';
import type { SizableCategory } from './shirt-size';
import { MOVED_CHANGE_STATUSES } from './settlement-store';

/**
 * **Who an order charged for, at the price they checked out at**: the one input
 * `splitOrderMoney` is given, so the registrants table, its CSV export and the
 * refund quote cannot split the same order two ways (2026-11-18).
 *
 *  - **Every runner the order charged for goes in**, refunded and staff-removed
 *    ones included: the stored `subtotal` still counts them, and leaving one
 *    out makes the split rescale everyone left (REFUND_PLAN.md trap 1). Read
 *    the order's runners with no `deletedAt` filter; who gets a row is the
 *    screen's business, not the split's.
 *  - **Each runner is priced at the category they checked out in**: the
 *    `fromCategory` of their first move (`FIRST_MOVE`), else their current
 *    one. A free move to a dearer category would otherwise read as money the
 *    order never took.
 */

/** A runner's first applied move, for the category they checked out in. Put under `categoryChanges`. */
export const FIRST_MOVE = {
  where: { status: { in: [...MOVED_CHANGE_STATUSES] } },
  orderBy: { createdAt: 'asc' },
  take: 1,
  include: { fromCategory: true },
} satisfies Prisma.Runner$categoryChangesArgs;

type PricedCategory = SizableCategory & { price: number };

/** The fields `paidMoneyRunner` reads off a runner fetched with `categoryChanges: FIRST_MOVE`. */
export interface PaidRunnerRead<C extends PricedCategory, A extends MoneyRunner['addOns'][number]> {
  id: string;
  promoPrice: number | null;
  singletSize: string;
  category: C;
  categoryChanges: { fromCategory: C }[];
  addOns: A[];
}

/** One runner as the split reads them: the checked-out category's price, and whether they moved since. */
export function paidMoneyRunner<C extends PricedCategory, A extends MoneyRunner['addOns'][number]>(
  runner: PaidRunnerRead<C, A>,
) {
  const paidCategory = runner.categoryChanges[0]?.fromCategory ?? runner.category;
  return {
    id: runner.id,
    listPrice: paidCategory.price,
    promoPrice: runner.promoPrice,
    category: paidCategory,
    singletSize: runner.singletSize,
    addOns: runner.addOns,
    /** Moved category since checkout: `listPrice` is the old category's, and `promoPrice` was cleared. */
    moved: runner.categoryChanges.length > 0,
  };
}
