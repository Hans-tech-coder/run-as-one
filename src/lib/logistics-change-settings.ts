/**
 * **What the event form may save for delivery switches**
 * (LOGISTICS_CHANGE_PLAN.md L11): the *Delivery switch deadline*, read from a
 * posted body and refused in one sentence when it is not a readable instant.
 *
 * Its own module beside `category-change-settings.ts`, for that module's
 * reason: the create and edit routes refuse exactly the same values, and
 * `logistics-change.ts` stays about the switch rather than about form input.
 * Client-safe (no Prisma).
 */
import { readCategoryChangeUntil } from './category-change-settings';

/**
 * The deadline as the event form posts it: an ISO instant, or null for the
 * default (7 days before race day). Returned only when present in the body,
 * so a PUT from anywhere but the form keeps what is stored.
 */
export function readLogisticsChangeSettings(body: Record<string, unknown>):
  | { ok: true; values: Partial<{ logisticsChangeUntil: Date | null }> }
  | { ok: false; field: string; error: string } {
  if (body.logisticsChangeUntil === undefined) return { ok: true, values: {} };
  // The same reader as the category change deadline: both are an instant or blank.
  const until = readCategoryChangeUntil(body.logisticsChangeUntil);
  if (until === undefined) {
    return {
      ok: false,
      field: 'logisticsChangeUntil',
      error: 'Pick the last day orders may switch between pickup and delivery, or leave it blank for 7 days before race day.',
    };
  }
  return { ok: true, values: { logisticsChangeUntil: until } };
}
