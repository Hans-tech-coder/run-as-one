import prisma from '@/lib/db';
import { formatPesos, toCentavos } from '@/lib/money';
import { CATEGORY_ORDER } from '@/lib/category-order';
import {
  DISCOUNT_TYPES,
  DISCOUNT_TYPE_LABELS,
  MAX_PERCENT_OFF,
  PromoCategoryPrice,
  asDiscountType,
  categoryPriceField,
  categorySeatsField,
  limitCountsRunners,
} from '@/lib/discount';

/**
 * Turning what the marketing form posted into what the `PromoCode` columns
 * should hold — and refusing it when it cannot.
 *
 * It lives apart from the routes because **two of them need exactly this**:
 * creating a promotion and editing one. A price typed as pesos and stored as
 * centavos, or a "buy 5 get 1" with no 5, is money the organizer did not mean
 * to give away, and a create route that caught it while an edit route quietly
 * let it through would be worse than neither checking.
 *
 * The route refuses rather than repairs, and every rejection names the field it
 * came from, per the project's rule that validation says exactly what is wrong.
 *
 * What caps a promotion depends on its kind. A repricing promotion is capped
 * per category on its own price rows, in runners. A group deal is bounded by
 * the group it needs. A percentage or fixed-amount code shared by everyone may
 * carry a **runner limit** in `usageLimit` (`limitCountsRunners`); a voucher is
 * a limit of 1, set by the create route. Any of them may also have dates.
 */

/** What the marketing form can say about a promotion. */
export interface PromoInput {
  discountType?: unknown;
  eventId?: unknown;
  validFrom?: unknown;
  validUntil?: unknown;
  buyQuantity?: unknown;
  getQuantity?: unknown;
  automatic?: unknown;
  /** CATEGORY_PRICE only: `{ [categoryId]: pesos }`, as the form posts it. */
  categoryPrices?: unknown;
  /**
   * CATEGORY_PRICE limited by uses: `{ [categoryId]: runners }`. Blank or
   * missing for a category means its price has no cap of its own.
   */
  categoryLimits?: unknown;
  /**
   * PERCENTAGE: the whole percent, as typed. FIXED: pesos, as typed — stored
   * as centavos.
   */
  discountValue?: unknown;
  /** PERCENTAGE and FIXED: the category ids it is restricted to. Empty = all. */
  categoryIds?: unknown;
  /**
   * PERCENTAGE and FIXED as one shared code: how many runners may get it in
   * total. Blank means no limit.
   */
  usageLimit?: unknown;
}

/** The columns every promotion carries, whatever shape it is claimed in. */
export interface PromoTermsData {
  discountType: string;
  discountValue: number;
  eventId: string | null;
  /**
   * The runner limit a shared percentage or fixed code was given, and null
   * for every other kind. The batch branch of the create route sets 1.
   */
  usageLimit: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
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
 * A validated promotion: the `PromoCode` columns, and the price list that goes
 * in the rows beside them.
 *
 * `categoryPrices` is always present, and empty for every kind but
 * CATEGORY_PRICE — so an edit that changed a promotion's kind clears the rows
 * the old one left behind rather than leaving them for a later query that has
 * no reason to expect them.
 */
export interface PromoData {
  data: PromoTermsData;
  categoryPrices: PromoCategoryPrice[];
  /**
   * The PromoCategory rows to write, as category ids. Always present and empty
   * for every kind but PERCENTAGE and FIXED — and empty for those too when the
   * promotion is for every category — so an edit that changed the kind or
   * widened it back to everyone clears the rows the old terms left behind.
   */
  categoryIds: string[];
}

/** What an edit knows about the promotion it is changing. */
export interface PromoCurrent {
  /**
   * Runners (or orders, for the older kinds) already counted against the cap.
   * A new limit may not go below it, the same rule the seat caps follow.
   */
  usageCount: number;
}

/**
 * The terms as the database should hold them, or the reason they cannot be.
 *
 * `organizerId` is the signed-in organizer, and the event is checked against it
 * — an id from the browser is not proof that the browser may spend against it,
 * which is the same rule every other admin route follows. The categories of a
 * CATEGORY_PRICE promotion are checked the same way and against that same
 * event, for the same reason twice over: an id is not ownership, and a price
 * list naming another race's 10K is a promotion that could never apply.
 */
export async function promoTermsFromInput(
  input: PromoInput,
  organizerId: string,
  /** The promotion being edited, or undefined when creating one. */
  current?: PromoCurrent,
): Promise<PromoData | { problem: PromoInputError }> {
  const type = asDiscountType(input.discountType);
  if (!type) {
    return problem('Choose what kind of discount this gives.', 'discountType');
  }

  const automatic = input.automatic === true;

  // Not offered for these kinds yet (owner, 2026-09-19): an automatic
  // percentage would be on every order with no limit anybody set, and the
  // early bird it would be used for is what CATEGORY_PRICE already is. The
  // form disables the option; this is the same rule where it cannot be
  // walked past.
  if (automatic && limitCountsRunners(type)) {
    return problem(
      `${DISCOUNT_TYPE_LABELS[type]} is given with a shared code or single-use vouchers, not automatically. Choose one of those under "How runners get it".`,
      'automatic',
    );
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

  let categoryPrices: PromoCategoryPrice[] = [];
  if (type === DISCOUNT_TYPES.CATEGORY_PRICE) {
    const priced = await categoryPricesFromInput(input, scopedEventId, automatic);
    if ('problem' in priced) return priced;
    categoryPrices = priced.categoryPrices;
  }

  let discountValue = 0;
  let categoryIds: string[] = [];
  let usageLimit: number | null = null;
  if (limitCountsRunners(type)) {
    const value = discountValueFromInput(type, input.discountValue);
    if ('problem' in value) return value;
    discountValue = value.discountValue;

    const scoped = await categoryIdsFromInput(input.categoryIds, scopedEventId);
    if ('problem' in scoped) return scoped;
    categoryIds = scoped.categoryIds;

    const limit = runnerLimitFromInput(input.usageLimit, current);
    if ('problem' in limit) return limit;
    usageLimit = limit.usageLimit;
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
      // 0 for the two kinds that read their amounts from elsewhere.
      discountValue,
      eventId: scopedEventId,
      // The runner limit of a shared percentage or fixed code, and null for
      // everything else. Written as null rather than omitted so an edit clears
      // a cap the promotion no longer has; the create route's batch branch and
      // the edit route override it with 1 for vouchers, which is what makes a
      // voucher single-use.
      usageLimit,
      validFrom: from,
      validUntil: until,
      buyQuantity: buy,
      getQuantity: get,
      automatic,
    },
    categoryPrices,
    categoryIds,
  };
}

/**
 * What a percentage or fixed-amount promotion is worth, as the column holds it.
 *
 * A percentage is a whole number from 1 to 100 — "12.5%" is refused rather
 * than rounded, because rounding is the app choosing a discount the organizer
 * did not type. A fixed amount is pesos, stored as centavos, and must be above
 * zero; there is no ceiling, since each runner's discount is capped at their
 * own entry anyway.
 */
function discountValueFromInput(
  type: string,
  raw: unknown,
): { discountValue: number } | { problem: PromoInputError } {
  const typed = String(raw ?? '').trim();

  if (type === DISCOUNT_TYPES.PERCENTAGE) {
    if (!typed) return problem('Enter the percentage off, from 1 to 100.', 'discountValue');
    const percent = Number(typed);
    if (!Number.isInteger(percent) || percent < 1 || percent > MAX_PERCENT_OFF) {
      return problem('The percentage off has to be a whole number from 1 to 100.', 'discountValue');
    }
    return { discountValue: percent };
  }

  if (!typed) return problem('Enter how many pesos come off each runner.', 'discountValue');
  const centavos = toCentavos(typed);
  if (!Number.isFinite(Number(typed)) || centavos <= 0) {
    return problem('The amount off has to be more than ₱0.', 'discountValue');
  }
  return { discountValue: centavos };
}

/**
 * The categories a percentage or fixed-amount promotion is restricted to.
 *
 * Empty is the default and means every category. Otherwise every id has to be
 * a category of the one event the promotion is scoped to: categories belong to
 * a race, so "all my events" has none to name, and an id from the browser is
 * not proof that it belongs to this organizer's race.
 */
async function categoryIdsFromInput(
  raw: unknown,
  eventId: string | null,
): Promise<{ categoryIds: string[] } | { problem: PromoInputError }> {
  const wanted = Array.isArray(raw)
    ? [...new Set(raw.map(id => String(id ?? '').trim()).filter(Boolean))]
    : [];
  if (wanted.length === 0) return { categoryIds: [] };

  if (!eventId) {
    return problem(
      'Categories belong to one race, so pick the event first, or leave this on All categories.',
      'categoryIds',
    );
  }

  const found = await prisma.category.findMany({
    where: { eventId, id: { in: wanted } },
    select: { id: true },
    orderBy: CATEGORY_ORDER,
  });
  if (found.length !== wanted.length) {
    return problem(
      'One of those categories is not part of this event any more. Choose them again.',
      'categoryIds',
    );
  }

  return { categoryIds: found.map(category => category.id) };
}

/**
 * The runner limit of a shared percentage or fixed-amount code.
 *
 * Blank means no limit. Otherwise a positive whole number, and never below the
 * runners already counted: those places were promised to people who have
 * registered, and a cap under them would read as oversold for ever. The same
 * rule the per-category seat caps follow.
 */
function runnerLimitFromInput(
  raw: unknown,
  current: PromoCurrent | undefined,
): { usageLimit: number | null } | { problem: PromoInputError } {
  const typed = String(raw ?? '').trim();
  if (!typed) return { usageLimit: null };

  const limit = Number(typed);
  if (!Number.isInteger(limit) || limit < 1) {
    return problem(
      'Enter how many runners can get this discount as a whole number, or leave it blank for no limit.',
      'usageLimit',
    );
  }

  const counted = current?.usageCount ?? 0;
  if (limit < counted) {
    return problem(
      `${counted} runner${counted === 1 ? ' has' : 's have'} already got this discount, so the limit cannot go below ${counted}.`,
      'usageLimit',
    );
  }

  return { usageLimit: limit };
}

/**
 * The price list of a CATEGORY_PRICE promotion, checked against the race it
 * names.
 *
 * Four things have to be true, and each is refused by name rather than
 * repaired, because every one of them is a number an organizer will publish:
 *
 * 1. **It names one race.** Prices belong to categories and categories belong
 *    to an event, so "all my events" has no list to set. This is the only kind
 *    of promotion that cannot be organizer-wide.
 * 2. **It needs no code.** A price list is the most public thing a promotion
 *    can be — it is drawn straight onto the option a runner is choosing
 *    between — and a struck-through price nobody can claim without a code they
 *    were never given would be the event page lying about what the race costs.
 * 3. **At least one category is repriced.** A promotion that reprices nothing
 *    is a badge on the event page promising a discount of zero.
 * 4. **Every price is below the category's own.** A "discount" that costs more
 *    is a price rise, and the checkout would decline to apply it anyway — so it
 *    is turned away here, where the organizer can still see which one it was.
 */
async function categoryPricesFromInput(
  input: PromoInput,
  eventId: string | null,
  automatic: boolean,
): Promise<{ categoryPrices: PromoCategoryPrice[] } | { problem: PromoInputError }> {
  if (!eventId) {
    return problem(
      'A discounted category price applies to one race, so pick the event it is for.',
      'eventId',
    );
  }
  if (!automatic) {
    return problem(
      'A discounted category price is shown on the event page, so it cannot need a code. Choose Automatic under "How runners get it".',
      'discountType',
    );
  }

  // In the event's own order, so when two boxes are wrong the one refused is
  // the one higher up the form.
  const categories = await prisma.category.findMany({
    where: { eventId },
    select: { id: true, name: true, price: true },
    orderBy: CATEGORY_ORDER,
  });

  const entries = asMap(input.categoryPrices);
  const limits = asMap(input.categoryLimits);

  // What each category has already sold at this promotion's price. An edit may
  // not cap a category below the number of runners already holding it — that
  // cap is a promise those people were given, and lowering it under them would
  // make the count read as oversold for ever.
  const sold = new Map<string, number>();
  const existing = await prisma.promoCategoryPrice.findMany({
    where: { promo: { eventId } },
    select: { categoryId: true, usageCount: true },
  });
  for (const row of existing) sold.set(row.categoryId, row.usageCount);

  const categoryPrices: PromoCategoryPrice[] = [];
  for (const category of categories) {
    const raw = entries[category.id];
    // Blank means "leave this one at its own price", which is the whole point
    // of a per-category promotion: an early bird on the 10K should not have to
    // invent a number for the 5K.
    if (raw === null || raw === undefined || String(raw).trim() === '') continue;

    const price = toCentavos(raw as number);
    if (!Number.isFinite(price) || price < 0) {
      return problem(
        `Enter a discounted price for ${category.name}, or leave it blank to keep its own price.`,
        categoryPriceField(category.id),
      );
    }
    if (price >= category.price) {
      return problem(
        `${category.name} already costs ₱${formatPesos(category.price)}. Its promotion price has to be lower than that.`,
        categoryPriceField(category.id),
      );
    }
    // The seats, where the promotion is limited by them. Blank is a real
    // answer: that category's price simply has no cap.
    let usageLimit: number | null = null;
    const rawLimit = limits[category.id];
    if (rawLimit !== null && rawLimit !== undefined && String(rawLimit).trim() !== '') {
      usageLimit = wholeNumber(rawLimit);
      if (!usageLimit) {
        return problem(
          `Enter how many runners get the ${category.name} promotion price, or leave it blank for no limit.`,
          categorySeatsField(category.id),
        );
      }
      const taken = sold.get(category.id) ?? 0;
      if (usageLimit < taken) {
        return problem(
          `${taken} runner${taken === 1 ? ' has' : 's have'} already taken the ${category.name} promotion price, so it cannot be capped below ${taken}.`,
          categorySeatsField(category.id),
        );
      }
    }

    categoryPrices.push({ categoryId: category.id, price, usageLimit });
  }

  if (categoryPrices.length === 0) {
    return problem(
      'Set a discounted price on at least one category — a promotion that reprices nothing takes nothing off.',
      categories[0] ? categoryPriceField(categories[0].id) : 'discountType',
    );
  }

  return { categoryPrices };
}

/** A posted `{ [categoryId]: value }` object, or an empty one. */
function asMap(posted: unknown): Record<string, unknown> {
  return posted && typeof posted === 'object' && !Array.isArray(posted)
    ? (posted as Record<string, unknown>)
    : {};
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
