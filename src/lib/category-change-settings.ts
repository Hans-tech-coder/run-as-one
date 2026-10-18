/**
 * **What the event form may save for category changes**
 * (CATEGORY_CHANGE_PLAN.md D5, D6, D12): the change fee, the downgrade refund
 * policy and the deadline, read from a posted body and refused in one
 * sentence when wrong — and which kind of change is offered at all
 * (`DOWNGRADES_ON_HOLD`), since that decides whether the refund policy is shown.
 *
 * Its own module so the create and edit routes refuse exactly the same values,
 * and so `category-change.ts`, which owns what a change costs and when it may
 * happen, stays about the change itself rather than about form input.
 * Client-safe (no Prisma), like `platform-fee.ts`.
 */
import { asDowngradeRefundPolicy, type DowngradeRefundPolicy } from './category-change';
import { formatPesos } from './money';
import { parsePesos } from './settlement';

/**
 * **Downgrades are on hold (owner, 2026-10-18)**: a quote whose `direction` is
 * DOWNGRADE is disabled in the modal and refused by `createCategoryChange`.
 * The refund flow stays built for rows already written; see ON_HOLD.md.
 */
export const DOWNGRADES_ON_HOLD = true;

/** What staff read when a downgrade is refused while they are on hold. */
export const DOWNGRADE_ON_HOLD_COPY =
  'Moving to a cheaper category is not offered yet. Only upgrades and same-price moves can be made.';

/**
 * The largest change fee accepted, ₱1,000.00. A figure past it is a typo (an
 * extra zero) on a fee every switching runner pays.
 */
export const MAX_CATEGORY_CHANGE_FEE = 100_000;

/** The change fee as typed, pesos → centavos, or the sentence saying what is wrong. */
export function readCategoryChangeFee(raw: unknown): { value: number | null; error: string | null } {
  const text = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
  // Blank is ₱0, the default: most races charge nothing to switch.
  if (!text) return { value: 0, error: null };
  const value = parsePesos(text);
  if (value === null) return { value: null, error: 'Enter the change fee in pesos, like 100 or 100.50' };
  if (value > MAX_CATEGORY_CHANGE_FEE) {
    return {
      value: null,
      error: `The change fee cannot be more than ₱${formatPesos(MAX_CATEGORY_CHANGE_FEE)}`,
    };
  }
  return { value, error: null };
}

/**
 * The posted deadline: an instant, null for "the default" (D12), or `undefined`
 * when what arrived is not a readable instant, which the routes refuse.
 */
export function readCategoryChangeUntil(raw: unknown): Date | null | undefined {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return undefined;
  const instant = new Date(raw);
  return Number.isNaN(instant.getTime()) ? undefined : instant;
}

/**
 * The three settings as the event form posts them, checked for both event
 * routes (create and edit) so they refuse the same values. Only the fields
 * present in the body are returned: a PUT from anywhere but the form keeps
 * what is stored rather than resetting a race's refund policy.
 */
export function readCategoryChangeSettings(body: Record<string, unknown>):
  | {
      ok: true;
      values: Partial<{
        categoryChangeUntil: Date | null;
        downgradeRefundPolicy: DowngradeRefundPolicy;
        categoryChangeFee: number;
      }>;
    }
  | { ok: false; field: string; error: string } {
  const values: Partial<{
    categoryChangeUntil: Date | null;
    downgradeRefundPolicy: DowngradeRefundPolicy;
    categoryChangeFee: number;
  }> = {};

  if (body.categoryChangeFee !== undefined) {
    const fee = readCategoryChangeFee(body.categoryChangeFee);
    if (fee.error || fee.value === null) {
      return { ok: false, field: 'categoryChangeFee', error: fee.error ?? 'Enter the change fee' };
    }
    values.categoryChangeFee = fee.value;
  }
  if (body.downgradeRefundPolicy !== undefined) {
    values.downgradeRefundPolicy = asDowngradeRefundPolicy(body.downgradeRefundPolicy);
  }
  if (body.categoryChangeUntil !== undefined) {
    const until = readCategoryChangeUntil(body.categoryChangeUntil);
    if (until === undefined) {
      return {
        ok: false,
        field: 'categoryChangeUntil',
        error: 'Pick the last day category changes are allowed, or leave it blank for the day before race day.',
      };
    }
    values.categoryChangeUntil = until;
  }
  return { ok: true, values };
}
