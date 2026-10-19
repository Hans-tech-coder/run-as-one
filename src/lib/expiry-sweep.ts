import 'server-only';
import { expirePendingRegistrations, type SweepResult } from '@/lib/pending-expiry';
import { expireCategoryChanges } from '@/lib/category-change-expiry';
import { expireLogisticsChanges } from '@/lib/logistics-change-expiry';

/**
 * **The one daily sweep: everything that waited out its hold unpaid lets go
 * on the same run** — abandoned checkouts and bank transfers
 * (`pending-expiry.ts`), upgrades (`category-change-expiry.ts`,
 * CATEGORY_CHANGE_PLAN.md D11) and delivery switches
 * (`logistics-change-expiry.ts`, LOGISTICS_CHANGE_PLAN.md L12). One trigger, so
 * no second schedule can disagree about when a hold ends.
 *
 * Kept apart from `pending-expiry.ts`, which owns the orders' rule and is read
 * by the payment-link token: composing the change sweeps there made it import
 * the payment modules that import it back.
 */

export type ExpirySweepResult = SweepResult & {
  /** Upgrades expired unpaid, and their references. */
  changesExpired: number;
  changeRefs: string[];
  /** Delivery switches expired unpaid, and their references. */
  switchesExpired: number;
  switchRefs: string[];
};

export async function runExpirySweep(now: Date = new Date()): Promise<ExpirySweepResult> {
  const orders = await expirePendingRegistrations(now);
  const changes = await expireCategoryChanges(now);
  const switches = await expireLogisticsChanges(now);
  return {
    ...orders,
    changesExpired: changes.expired,
    changeRefs: changes.changeRefs,
    switchesExpired: switches.expired,
    switchRefs: switches.changeRefs,
  };
}
