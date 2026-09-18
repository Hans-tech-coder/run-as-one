/**
 * The **default platform fee** — what a new event's Admin Fee box starts at
 * (SETTINGS_PLAN.md Batch 4).
 *
 * It is stored on Run As One's Organizer row as `Organizer.adminFee`
 * (centavos), set by the Super Admin (`org:settings`) on /admin/settings and
 * read by the create-event form. **It is only a starting value**: every order
 * is charged its own event's `Event.adminFee`, so changing the default never
 * moves a price on an event that already exists.
 *
 * Client-safe (no Prisma), so the settings panel and its route run the same
 * check and word a refusal the same way.
 */
import { formatPesos } from './money';
import { parsePesos } from './settlement';

/** The ₱60.00 every event used back when the fee lived on the organizer. */
export const DEFAULT_PLATFORM_FEE = 6000;

/**
 * The largest default accepted, ₱1,000.00 per runner — several times any fee
 * this platform has charged. A figure past it is a typo (an extra zero), and a
 * default is copied into every new event, so it is refused here rather than
 * discovered on a race's checkout.
 */
export const MAX_PLATFORM_FEE = 100_000;

/**
 * The fee as typed, in pesos → centavos, or the one sentence saying what is
 * wrong with it. ₱0.00 is allowed: a race Run As One runs for free.
 */
export function readPlatformFee(raw: unknown): { value: number | null; error: string | null } {
  const text = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
  if (!text) return { value: null, error: 'Enter the fee charged per runner, like 60 or 60.00' };

  const value = parsePesos(text);
  if (value === null) {
    return { value: null, error: 'Enter the fee in pesos, like 60 or 60.50' };
  }
  if (value > MAX_PLATFORM_FEE) {
    return { value: null, error: `The fee cannot be more than ₱${formatPesos(MAX_PLATFORM_FEE)} per runner` };
  }
  return { value, error: null };
}
