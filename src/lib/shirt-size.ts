/**
 * Shirt sizing: the chart, when to ask for a size at all, and what the large
 * sizes cost extra.
 *
 * "Shirt" rather than "singlet" throughout the interface. A package may include
 * either, or both, and when it includes both the runner wears the same size in
 * each — so one generic question is the honest one to ask.
 */

/** One row of the printed size chart. Inches, as supplied by the organizer. */
export interface ShirtSizeRow {
  size: string;
  width: number;
  length: number;
}

/** The chart runners are measured against. Order is the order they see. */
export const SHIRT_SIZE_CHART: readonly ShirtSizeRow[] = [
  { size: '2XS', width: 17, length: 24 },
  { size: 'XS', width: 18, length: 25 },
  { size: 'S', width: 19, length: 26 },
  { size: 'M', width: 20, length: 27 },
  { size: 'L', width: 21, length: 28 },
  { size: 'XL', width: 22, length: 29 },
  { size: '2XL', width: 23, length: 30 },
  { size: '3XL', width: 24, length: 31 },
  { size: '4XL', width: 25, length: 32 },
];

export const SHIRT_SIZES: readonly string[] = SHIRT_SIZE_CHART.map(r => r.size);

/** Sizes at or above this many X's carry the upcharge. */
export const UPCHARGE_FROM_XL = 4;

/** A typed size is a size, not an essay. */
export const MAX_SHIRT_SIZE_LENGTH = 12;

/**
 * A size as it gets stored.
 *
 * Uppercased because sizes are conventionally written that way and because the
 * upcharge test below has to recognise what the runner typed. Runners may type
 * a size the chart does not list — a 5XL, or a supplier's own code — so nothing
 * is rejected here.
 */
export function normalizeShirtSize(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, MAX_SHIRT_SIZE_LENGTH);
}

/**
 * How many X's a size carries: XL is 1, 2XL and XXL are both 2, 4XL is 4.
 *
 * Both spellings are accepted because runners type both, and a 4XL written as
 * "XXXXL" costs the same as one written "4XL". Anything that is not an XL size
 * — M, 2XS, or a supplier code nobody here can parse — returns 0, so it is
 * never charged extra by accident.
 */
export function shirtSizeXlCount(size: string): number {
  const cleaned = normalizeShirtSize(size).replace(/[\s\-_]/g, '');
  if (!cleaned) return 0;

  const numbered = cleaned.match(/^(\d{1,2})X(?:L)?$/);
  if (numbered) return Number(numbered[1]);

  const repeated = cleaned.match(/^(X+)L$/);
  if (repeated) return repeated[1].length;

  return 0;
}

/** Whether this size costs the runner the event's large-size upcharge. */
export function isUpchargeShirtSize(size: string): boolean {
  return shirtSizeXlCount(size) >= UPCHARGE_FROM_XL;
}

/**
 * The part of a category these rules care about. Deliberately narrow: the
 * wizards hand over untyped rows straight from Prisma, and asking for the whole
 * Category here would make every caller cast.
 */
export interface SizableCategory {
  id: string;
  inclusions?: readonly string[] | null;
}

/** Words in an inclusions list that mean the runner is getting something to wear. */
const WEARABLE = /\b(?:singlet|shirt|jersey)\b/i;

/**
 * Whether a category's inclusions promise something the runner needs to be
 * sized for.
 *
 * An empty inclusions list means "the organizer has not filled this in", not
 * "there is no shirt" — the column was added after these events existed and
 * still defaults to empty. Treating empty as "no shirt" would quietly stop
 * collecting sizes for races that hand out singlets, so empty asks the
 * question, and only a filled-in list with nothing wearable in it hides it.
 */
export function includesWearable(inclusions: readonly string[] | null | undefined): boolean {
  const list = (inclusions ?? []).filter(item => typeof item === 'string' && item.trim());
  if (list.length === 0) return true;
  return list.some(item => WEARABLE.test(item));
}

/**
 * Whether the runner who picked this category should be asked for a shirt size.
 *
 * Driven by the chosen category rather than the event, because an event can
 * sell a band-only package next to one that includes a shirt — the Tarlac Meet
 * and Run does exactly that. Nothing chosen yet means nothing to size.
 */
export function categoryNeedsShirtSize(
  category: SizableCategory | null | undefined
): boolean {
  if (!category) return false;
  return includesWearable(category.inclusions);
}

/** The chosen category out of an event, or null when nothing is chosen yet. */
export function findCategory(
  categories: readonly SizableCategory[] | null | undefined,
  categoryId: string
): SizableCategory | null {
  if (!categoryId) return null;
  return (categories ?? []).find(c => c.id === categoryId) ?? null;
}

/**
 * Whether every option this event sells includes something to wear.
 *
 * An event with no categories is not "all wearable" — there is nothing to size
 * and nothing to choose, so it answers false.
 */
export function everyCategoryNeedsShirtSize(
  categories: readonly SizableCategory[] | null | undefined
): boolean {
  const list = categories ?? [];
  if (list.length === 0) return false;
  return list.every(category => categoryNeedsShirtSize(category));
}

/**
 * Whether the shirt size question belongs on screen for this runner.
 *
 * Once a category is chosen, that category decides it. Before then the answer
 * depends on what the event sells: when every option includes something to
 * wear, the size is going to be asked no matter which one the runner picks, so
 * hiding it until they pick only makes the form grow under them. It stays
 * hidden up front only when the event sells at least one option with nothing to
 * wear — there the question is genuinely undecided, and showing it early would
 * ask a band-only runner for a size they will never need.
 */
export function shouldAskShirtSize(
  categories: readonly SizableCategory[] | null | undefined,
  categoryId: string
): boolean {
  const chosen = findCategory(categories, categoryId);
  if (chosen) return categoryNeedsShirtSize(chosen);
  return everyCategoryNeedsShirtSize(categories);
}

/**
 * The large-size upcharge owed for one runner, in centavos.
 *
 * Zero unless the runner is actually being sized (a band-only package is never
 * charged for a shirt they are not getting) and the size is 4XL or above.
 */
export function shirtSizeUpchargeFor(
  participant: { categoryId: string; singletSize: string },
  categories: readonly SizableCategory[] | null | undefined,
  upchargePerRunner: number
): number {
  if (!upchargePerRunner) return 0;
  const category = findCategory(categories, participant.categoryId);
  if (!categoryNeedsShirtSize(category)) return 0;
  return isUpchargeShirtSize(participant.singletSize) ? upchargePerRunner : 0;
}

/** The whole order's large-size upcharge, in centavos. */
export function totalShirtSizeUpcharge(
  participants: readonly { categoryId: string; singletSize: string }[],
  categories: readonly SizableCategory[] | null | undefined,
  upchargePerRunner: number
): number {
  return participants.reduce(
    (sum, p) => sum + shirtSizeUpchargeFor(p, categories, upchargePerRunner),
    0
  );
}

/**
 * The size to store for one runner.
 *
 * Blank when the chosen package has nothing to wear, so a band-only runner
 * never carries a size they were never asked for — the wizard clears it when
 * the category changes, and this makes sure of it even if a stale value is
 * posted anyway.
 */
export function storedShirtSize(
  participant: { categoryId: string; singletSize?: unknown },
  categories: readonly SizableCategory[] | null | undefined
): string {
  const category = findCategory(categories, participant.categoryId);
  if (!categoryNeedsShirtSize(category)) return '';
  return normalizeShirtSize(participant.singletSize);
}

/** A category priced for sale. */
export interface PricedCategory extends SizableCategory {
  /** Centavos. */
  price: number;
}

/**
 * What the runners' goods come to, in centavos: the category prices plus the
 * large-size surcharge.
 *
 * The wizard and the checkout route both derive the subtotal from this, so a
 * payload that disagrees is a stale page or a tampered one, and checkout can
 * refuse it rather than bill whatever number it was handed.
 */
export function subtotalWithUpcharge(
  participants: readonly { categoryId: string; singletSize: string }[],
  categories: readonly PricedCategory[] | null | undefined,
  upchargePerRunner: number
): number {
  const categoryTotal = participants.reduce((total, p) => {
    const category = (categories ?? []).find(c => c.id === p.categoryId);
    return total + (category ? category.price : 0);
  }, 0);
  return categoryTotal + totalShirtSizeUpcharge(participants, categories, upchargePerRunner);
}
