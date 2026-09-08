import prisma from '@/lib/db';
import { toCentavos } from '@/lib/money';
import { DISCOUNT_TYPES, asDiscountType } from '@/lib/discount';

/**
 * Turning what the marketing form posted into what the `PromoCode` columns
 * should hold — and refusing it when it cannot.
 *
 * It lives apart from the routes because **two of them need exactly this**:
 * creating a promotion and editing one. A percentage read as centavos, or a
 * "buy 5 get 1" with no 5, is money the organizer did not mean to give away,
 * and a create route that caught it while an edit route quietly let it through
 * would be worse than neither checking.
 *
 * The route refuses rather than repairs, and every rejection names the field it
 * came from, per the project's rule that validation says exactly what is wrong.
 */

/** Percentages are stored as basis points; 100% is the ceiling. */
export const MAX_PERCENTAGE = 100;

/** What the marketing form can say about a promotion. */
export interface PromoInput {
  discountType?: unknown;
  discountValue?: unknown;
  eventId?: unknown;
  validFrom?: unknown;
  validUntil?: unknown;
  minSubtotal?: unknown;
  minRunners?: unknown;
  buyQuantity?: unknown;
  getQuantity?: unknown;
  automatic?: unknown;
}

/** The columns every promotion carries, whatever shape it is claimed in. */
export interface PromoTermsData {
  discountType: string;
  discountValue: number;
  eventId: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  minSubtotal: number | null;
  minRunners: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  automatic: boolean;
}

/** A refusal the route hands straight back, field and all. */
export interface PromoInputError {
  error: string;
  field: string;
}

/**
 * The terms as the database should hold them, or the reason they cannot be.
 *
 * `organizerId` is the signed-in organizer, and the event is checked against it
 * — an id from the browser is not proof that the browser may spend against it,
 * which is the same rule every other admin route follows.
 */
export async function promoTermsFromInput(
  input: PromoInput,
  organizerId: string,
): Promise<{ data: PromoTermsData } | { problem: PromoInputError }> {
  const type = asDiscountType(input.discountType);
  if (!type) {
    return problem('Choose what kind of discount this gives.', 'discountType');
  }

  let scopedEventId: string | null = null;
  if (input.eventId) {
    const event = await prisma.event.findFirst({
      where: { id: String(input.eventId), organizerId },
      select: { id: true },
    });
    if (!event) return problem('That event is not one of yours.', 'eventId');
    scopedEventId = event.id;
  }

  // discountValue is an integer whose unit depends on discountType:
  // PERCENTAGE -> basis points (10% is sent as 10, stored as 1000)
  // FIXED      -> centavos    (₱500 is sent as 500, stored as 50000)
  // Both scale by 100, but they are different units — keep them
  // distinguishable. FREE_DELIVERY takes its amount from the order's own
  // delivery fee and BUY_X_GET_Y from the quantities below, so neither stores a
  // value here at all.
  let storedDiscountValue = 0;
  if (type === DISCOUNT_TYPES.PERCENTAGE) {
    const percent = Number(input.discountValue);
    if (!Number.isFinite(percent) || percent <= 0 || percent > MAX_PERCENTAGE) {
      return problem(
        `Enter the percentage to take off, between 1 and ${MAX_PERCENTAGE}.`,
        'discountValue',
      );
    }
    storedDiscountValue = Math.round(percent * 100);
  } else if (type === DISCOUNT_TYPES.FIXED) {
    const centavos = toCentavos(input.discountValue as number);
    if (centavos <= 0) {
      return problem('Enter the amount in pesos to take off.', 'discountValue');
    }
    storedDiscountValue = centavos;
  }

  let buy: number | null = null;
  let get: number | null = null;
  if (type === DISCOUNT_TYPES.BUY_X_GET_Y) {
    buy = wholeNumber(input.buyQuantity);
    get = wholeNumber(input.getQuantity);
    if (!buy) {
      return problem('Say how many runners must register at full price.', 'buyQuantity');
    }
    if (!get) return problem('Say how many runners go free.', 'getQuantity');
  }

  const from = startOfManilaDay(input.validFrom);
  // The end of the day, not its start: an organizer typing a single date as the
  // last day means the whole of it.
  const until = endOfManilaDay(input.validUntil);
  if (from && until && from.getTime() > until.getTime()) {
    return problem('The end date is before the start date.', 'validUntil');
  }

  return {
    data: {
      discountType: type,
      discountValue: storedDiscountValue,
      eventId: scopedEventId,
      validFrom: from,
      validUntil: until,
      minSubtotal: input.minSubtotal ? toCentavos(input.minSubtotal as number) || null : null,
      minRunners: wholeNumber(input.minRunners),
      buyQuantity: buy,
      getQuantity: get,
      automatic: input.automatic === true,
    },
  };
}

/** A count or a limit as the column should hold it: a positive int, or null. */
export function wholeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function problem(error: string, field: string): { problem: PromoInputError } {
  return { problem: { error, field } };
}

/**
 * A date field from the form, or null.
 *
 * The form sends `YYYY-MM-DD`, which `new Date()` reads as midnight **UTC** —
 * eight hours behind Manila, so a code set to start today would already be live
 * yesterday evening and one set to end today would expire at 8am. Both ends are
 * therefore pinned to Manila explicitly, the same timezone `event-schedule.ts`
 * insists on for the same reason.
 */
function manilaDay(value: unknown, timeOfDay: string): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const calendarDay = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = new Date(calendarDay ? `${raw}T${timeOfDay}+08:00` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The first moment of a Manila day, for `validFrom`. */
function startOfManilaDay(value: unknown): Date | null {
  return manilaDay(value, '00:00:00');
}

/** The last moment of a Manila day, for `validUntil`. */
function endOfManilaDay(value: unknown): Date | null {
  return manilaDay(value, '23:59:59');
}
