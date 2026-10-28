/**
 * **Which add-ons a runner may buy, and what they cost** (ADD_ONS_PLAN.md).
 *
 * An add-on is an optional item sold with an entry — a commemorative shirt, a
 * cap — set by staff per event on Event edit › Add-ons (`EventAddOn`), and
 * bought per runner (`RunnerAddOn`, D3). This module owns every rule about
 * them that is not a database read:
 *  - which items a runner in a category may pick right now (`availableAddOns`)
 *    and what is left of an item's stock (`stockLeft`);
 *  - reading one runner's posted picks into priced lines, refusing anything
 *    the screen would not have offered (`readAddOnSelection`);
 *  - what those lines cost, and how much of it is Run As One's (D1) rather
 *    than owed to the organizer (`addOnLinesTotal`, `runAsOneShare`);
 *  - the admin form's field checks (`addOnFromInput`), shared by the panel and
 *    its route — like `platform-fee.ts` — so a refusal the form predicts and
 *    one the server gives are the same sentence under the same box.
 *
 * The money rules it leans on, from the owner's decisions: an add-on has no
 * platform fee (D2), promotions never touch it (D5), there is no extra
 * delivery fee (D6) and it costs one price whatever the size (D7). So a line's
 * cost is `unitPrice × quantity` and nothing else, ever.
 *
 * Prisma-free, so the panel can import it. What an item has sold is counted by
 * `add-on-stock.ts`, beside the slot count it mirrors.
 */
import { formatPesos } from './money';
import { parsePesos } from './settlement';
import { SHIRT_SIZES } from './shirt-size';

/**
 * What a runner chooses on an item: nothing, a size from the race shirt's
 * chart, or the staff's own list (BLACK, WHITE).
 */
export const ADD_ON_OPTION_KINDS = ['NONE', 'SHIRT_SIZES', 'CUSTOM'] as const;
export type AddOnOptionKind = (typeof ADD_ON_OPTION_KINDS)[number];

export const ADD_ON_OPTION_KIND_LABELS: Record<AddOnOptionKind, string> = { NONE: 'No options', SHIRT_SIZES: 'Shirt sizes', CUSTOM: 'Custom options' };

/**
 * Whose money the item is (D1). ORGANIZER is owed through the remittance like
 * an entry; RUN_AS_ONE is Run As One's own merch, kept and never owed.
 */
export const ADD_ON_SELLERS = ['ORGANIZER', 'RUN_AS_ONE'] as const;
export type AddOnSeller = (typeof ADD_ON_SELLERS)[number];

export const ADD_ON_SELLER_LABELS: Record<AddOnSeller, string> = { ORGANIZER: 'Organizer', RUN_AS_ONE: 'Run As One' };

export const MAX_ADD_ON_NAME_LENGTH = 60;
export const MAX_ADD_ON_DESCRIPTION_LENGTH = 500;
/** One option's text: a size or a colour, not a sentence. */
export const MAX_ADD_ON_OPTION_LENGTH = 20;
export const MAX_ADD_ON_OPTIONS = 12;
export const MAX_ADD_ON_IMAGES = 4;
/**
 * ₱10,000.00 — far past any shirt or cap. A figure over it is a typo (an extra
 * zero), and it would land on a runner's checkout, so it is refused here.
 */
export const MAX_ADD_ON_PRICE = 1_000_000;
/** The most of one item one runner may take: one runner's kit, not a reseller's. */
export const MAX_ADD_ON_PER_RUNNER = 10;
export const MAX_ADD_ON_STOCK = 100_000;

/** The fields of an item these rules read. Dates may arrive as JSON strings. */
export interface AddOnRule {
  id: string;
  name: string;
  price: number;
  optionKind: string;
  options: readonly string[];
  maxPerRunner: number;
  stockLimit: number | null;
  salesCloseAt: Date | string | null;
  categoryIds: readonly string[];
  soldBy: string;
  active: boolean;
}

/** One purchased line, as `RunnerAddOn` stores it: every field a snapshot. */
export interface AddOnLine {
  addOnId: string;
  name: string;
  unitPrice: number;
  option: string | null;
  soldBy: AddOnSeller;
  quantity: number;
}

export function asOptionKind(value: unknown): AddOnOptionKind {
  return ADD_ON_OPTION_KINDS.includes(value as AddOnOptionKind) ? (value as AddOnOptionKind) : 'NONE';
}

/** Anything but RUN_AS_ONE is the organizer's, the side that owes nobody less. */
export function asSeller(value: unknown): AddOnSeller {
  return value === 'RUN_AS_ONE' ? 'RUN_AS_ONE' : 'ORGANIZER';
}

/** The choices a runner is offered on this item, in order; empty for none. */
export function addOnChoices(addOn: Pick<AddOnRule, 'optionKind' | 'options'>): readonly string[] {
  const kind = asOptionKind(addOn.optionKind);
  if (kind === 'SHIRT_SIZES') return SHIRT_SIZES;
  if (kind === 'CUSTOM') return addOn.options;
  return [];
}

/** Whether the item's own sales cutoff has passed. Unset never closes (D9). */
export function addOnSalesClosed(addOn: Pick<AddOnRule, 'salesCloseAt'>, now: Date = new Date()): boolean {
  if (!addOn.salesCloseAt) return false;
  const closes = new Date(addOn.salesCloseAt);
  return !Number.isNaN(closes.getTime()) && closes.getTime() <= now.getTime();
}

/**
 * The items a runner in `categoryId` may be offered now: switched on, open to
 * that category (an empty list is every category), and before its cutoff.
 *
 * Stock is deliberately **not** filtered here. A sold-out item stays on the
 * screen marked *Sold out* (D9), so whether it can be *picked* is
 * `stockLeft`'s question, asked by the caller that holds the counts.
 */
export function availableAddOns<T extends AddOnRule>(
  addOns: readonly T[],
  categoryId: string,
  now: Date = new Date(),
): T[] {
  return addOns.filter(
    addOn =>
      addOn.active &&
      (addOn.categoryIds.length === 0 || addOn.categoryIds.includes(categoryId)) &&
      !addOnSalesClosed(addOn, now),
  );
}

/**
 * Pieces of this item still for sale, or null for no limit. `taken` is what
 * `add-on-stock.ts` counted: paid and still-holding pending orders. Never
 * negative — a limit lowered under what has sold reads as sold out, not as a
 * debt.
 */
export function stockLeft(addOn: Pick<AddOnRule, 'stockLimit'>, taken: number): number | null {
  if (addOn.stockLimit === null || addOn.stockLimit === undefined) return null;
  return Math.max(0, addOn.stockLimit - taken);
}

export type SelectionResult = { lines: AddOnLine[] } | { error: string };

/**
 * One runner's posted picks → priced lines, or the sentence saying which pick
 * is wrong.
 *
 * `offered` is what this runner may buy (`availableAddOns` for their
 * category), read fresh on the server: an id not in it is an item switched
 * off, closed or not open to this category since the page loaded, and is
 * refused rather than sold. Price, name and seller come from the item, never
 * from the post. One line per item: the screen picks one option and a
 * quantity per item, so a second line for the same item is a forged post.
 *
 * Stock is checked by the checkout under its lock, not here: a count read
 * outside the transaction is a count two runners both pass.
 */
export function readAddOnSelection(raw: unknown, offered: readonly AddOnRule[]): SelectionResult {
  if (raw === undefined || raw === null) return { lines: [] };
  if (!Array.isArray(raw)) return { error: 'The add-ons on this runner could not be read. Please pick them again.' };

  const lines: AddOnLine[] = [];
  for (const pick of raw) {
    const addOnId = typeof pick?.addOnId === 'string' ? pick.addOnId : '';
    const addOn = offered.find(item => item.id === addOnId);
    if (!addOn) {
      return { error: 'An add-on you picked is no longer on sale for this runner. Please review the add-ons.' };
    }
    if (lines.some(line => line.addOnId === addOnId)) {
      return { error: `${addOn.name} was picked twice for one runner. Please pick it once.` };
    }

    const quantity = Number(pick?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > addOn.maxPerRunner) {
      const limit = addOn.maxPerRunner;
      return { error: limit === 1 ? `${addOn.name} is limited to 1 per runner.` : `Choose 1 to ${limit} of ${addOn.name} per runner.` };
    }

    const choices = addOnChoices(addOn);
    let option: string | null = null;
    if (choices.length > 0) {
      const picked = typeof pick?.option === 'string' ? pick.option.trim().toUpperCase() : '';
      if (!choices.includes(picked)) {
        return { error: `Choose ${asOptionKind(addOn.optionKind) === 'SHIRT_SIZES' ? 'a size' : 'an option'} for ${addOn.name}.` };
      }
      option = picked;
    }

    lines.push({
      addOnId,
      name: addOn.name,
      unitPrice: addOn.price,
      option,
      soldBy: asSeller(addOn.soldBy),
      quantity,
    });
  }
  return { lines };
}

/** What these lines cost: unit price × quantity, nothing else (D2, D5–D7). */
export function addOnLinesTotal(lines: readonly Pick<AddOnLine, 'unitPrice' | 'quantity'>[]): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}

/**
 * The part of these lines Run As One keeps (D1) — `Registration`'s
 * `addOnRunAsOneTotal`. Read off each line's own snapshot, so changing an
 * item's seller later never moves an order already taken.
 */
export function runAsOneShare(lines: readonly Pick<AddOnLine, 'unitPrice' | 'quantity' | 'soldBy'>[]): number {
  return addOnLinesTotal(lines.filter(line => line.soldBy === 'RUN_AS_ONE'));
}

// ── The admin form ──────────────────────────────────────────────────────────

/** The fields an item is saved with, checked and normalised. */
export interface AddOnInput {
  name: string;
  description: string;
  price: number;
  imageUrls: string[];
  optionKind: AddOnOptionKind;
  options: string[];
  maxPerRunner: number;
  stockLimit: number | null;
  salesCloseAt: Date | null;
  categoryIds: string[];
  soldBy: AddOnSeller;
  active: boolean;
}

/** Every field the form has a box for: the input's own keys, bar the switch. */
export type AddOnField = Exclude<keyof AddOnInput, 'active'>;

export type AddOnProblem = { field: AddOnField; error: string };

/**
 * An item's name as stored: spaces collapsed, uppercased, capped. Uppercase
 * under the category-name exception in `text-case.ts` — it is printed beside
 * uppercase runner data in the registrants table, the CSV and the emails.
 */
export function normalizeAddOnName(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, MAX_ADD_ON_NAME_LENGTH)
    : '';
}

/**
 * The CUSTOM options as typed — an array, or one comma-separated line — each
 * uppercased, blanks and repeats dropped, in the order given.
 */
export function normalizeAddOnOptions(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const seen: string[] = [];
  for (const part of parts) {
    if (typeof part !== 'string') continue;
    const option = part.replace(/\s+/g, ' ').trim().toUpperCase();
    if (option && !seen.includes(option)) seen.push(option);
  }
  return seen;
}

/** A whole number typed or posted, or null when blank, or NaN when not one. */
function wholeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : 'x';
  if (!text) return null;
  return /^\d+$/.test(text) ? Number(text) : NaN;
}

/**
 * The add/edit form's fields → what is saved, or the first problem with the
 * field it belongs to. `eventCategoryIds` is the event's own categories: a
 * category id from anywhere else is refused, not stored.
 *
 * The price is pesos as typed ("350" or "350.00"), like every money box on the
 * dashboard; `salesCloseAt` is an ISO instant or blank.
 */
export function addOnFromInput(
  raw: Record<string, unknown>,
  { eventCategoryIds }: { eventCategoryIds: readonly string[] },
): { data: AddOnInput } | { problem: AddOnProblem } {
  const name = normalizeAddOnName(raw.name);
  if (!name) return { problem: { field: 'name', error: 'Enter the item’s name, like COMMEMORATIVE SHIRT.' } };

  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (description.length > MAX_ADD_ON_DESCRIPTION_LENGTH) {
    const error = `Keep the description under ${MAX_ADD_ON_DESCRIPTION_LENGTH} characters (it is ${description.length}).`;
    return { problem: { field: 'description', error } };
  }

  const priceText = typeof raw.price === 'number' ? String(raw.price) : raw.price;
  const price = parsePesos(priceText);
  if (price === null || price <= 0) {
    return { problem: { field: 'price', error: 'Enter the price in pesos, like 350 or 350.00. It must be more than ₱0.' } };
  }
  if (price > MAX_ADD_ON_PRICE) {
    return { problem: { field: 'price', error: `The price cannot be more than ₱${formatPesos(MAX_ADD_ON_PRICE)}.` } };
  }

  const imageUrls = Array.isArray(raw.imageUrls)
    ? raw.imageUrls.filter((url): url is string => typeof url === 'string' && url.trim() !== '').map(url => url.trim())
    : [];
  if (imageUrls.length > MAX_ADD_ON_IMAGES) {
    return { problem: { field: 'imageUrls', error: `An item can have up to ${MAX_ADD_ON_IMAGES} images.` } };
  }
  // Only the app's own uploads: a pasted link to anywhere would be drawn on
  // the public event page.
  if (imageUrls.some(url => !/^https:\/\//.test(url))) {
    return { problem: { field: 'imageUrls', error: 'Upload the poster again; that image link could not be used.' } };
  }

  if (!ADD_ON_OPTION_KINDS.includes(raw.optionKind as AddOnOptionKind)) {
    return { problem: { field: 'optionKind', error: 'Choose what a runner picks on this item.' } };
  }
  const optionKind = raw.optionKind as AddOnOptionKind;
  const options = optionKind === 'CUSTOM' ? normalizeAddOnOptions(raw.options) : [];
  if (optionKind === 'CUSTOM') {
    if (options.length < 2) {
      return { problem: { field: 'options', error: 'List at least two options, separated by commas, like BLACK, WHITE.' } };
    }
    if (options.length > MAX_ADD_ON_OPTIONS) {
      return { problem: { field: 'options', error: `List up to ${MAX_ADD_ON_OPTIONS} options.` } };
    }
    const long = options.find(option => option.length > MAX_ADD_ON_OPTION_LENGTH);
    if (long) {
      const error = `Keep each option under ${MAX_ADD_ON_OPTION_LENGTH} characters; "${long}" is longer.`;
      return { problem: { field: 'options', error } };
    }
  }

  const maxPerRunner = wholeNumber(raw.maxPerRunner) ?? 1;
  if (!Number.isInteger(maxPerRunner) || maxPerRunner < 1 || maxPerRunner > MAX_ADD_ON_PER_RUNNER) {
    const error = `Enter how many one runner may buy, from 1 to ${MAX_ADD_ON_PER_RUNNER}.`;
    return { problem: { field: 'maxPerRunner', error } };
  }

  const stockLimit = wholeNumber(raw.stockLimit);
  if (stockLimit !== null && (!Number.isInteger(stockLimit) || stockLimit < 1 || stockLimit > MAX_ADD_ON_STOCK)) {
    const error = 'Enter the pieces on hand as a whole number, or leave it blank for no limit.';
    return { problem: { field: 'stockLimit', error } };
  }

  let salesCloseAt: Date | null = null;
  if (typeof raw.salesCloseAt === 'string' && raw.salesCloseAt.trim()) {
    salesCloseAt = new Date(raw.salesCloseAt);
    if (Number.isNaN(salesCloseAt.getTime())) {
      return { problem: { field: 'salesCloseAt', error: 'Choose the day and time sales of this item close.' } };
    }
  }

  const categoryIds = Array.isArray(raw.categoryIds)
    ? [...new Set(raw.categoryIds.filter((id): id is string => typeof id === 'string'))]
    : [];
  if (categoryIds.some(id => !eventCategoryIds.includes(id))) {
    return { problem: { field: 'categoryIds', error: 'A category picked is not on this event any more. Please pick again.' } };
  }

  if (!ADD_ON_SELLERS.includes(raw.soldBy as AddOnSeller)) {
    return { problem: { field: 'soldBy', error: 'Choose who sells this item.' } };
  }

  const soldBy = raw.soldBy as AddOnSeller;
  const active = raw.active === undefined ? true : raw.active === true;
  return {
    data: { name, description, price, imageUrls, optionKind, options, maxPerRunner, stockLimit, salesCloseAt, categoryIds, soldBy, active },
  };
}

/**
 * The refusal for lowering an item's stock under what it has already sold.
 * Not a pure field check — it needs the count — so the route asks it with the
 * number in hand, and the sentence stays here with the others.
 */
export function stockBelowSoldProblem(stockLimit: number | null, sold: number): AddOnProblem | null {
  if (stockLimit === null || stockLimit >= sold) return null;
  return {
    field: 'stockLimit',
    error: `${sold} ${sold === 1 ? 'piece has' : 'pieces have'} already been sold, so the stock cannot be lower than ${sold}.`,
  };
}

/**
 * One line as the runner reads it on the summary and the PayMongo page:
 * `Runner 2 · COMMEMORATIVE SHIRT (M) × 1`. One spelling for both, so the bill
 * the runner pays reads exactly like the summary they agreed to.
 */
export function addOnLineLabel(line: {
  runnerNo: number;
  name: string;
  option: string | null;
  quantity: number;
}): string {
  return `Runner ${line.runnerNo} · ${addOnItemLabel(line)}`;
}

// ── After checkout: the read side ───────────────────────────────────────────

/**
 * What every screen that reads an order after checkout takes of a stored line
 * (ADD_ONS_PLAN.md Batch 4): the registrants screen, the receipt emails, the
 * client runner list and Track. Oldest first, which is the order the runner
 * picked them in, so a runner's lines read the same everywhere. One `include`
 * for all of them, so none can forget the order or a field another prints.
 */
export const ADD_ON_LINES_READ = {
  select: { name: true, option: true, quantity: true, unitPrice: true, soldBy: true },
  orderBy: { createdAt: 'asc' },
} as const;

/** A stored line as the read side prints it: what, which option, how many. */
export type AddOnItemLine = Pick<AddOnLine, 'name' | 'option' | 'quantity'>;

/**
 * `COMMEMORATIVE SHIRT (M) × 1`: one line without its runner, for a screen
 * that already shows whose it is. `addOnLineLabel` is this with the runner in
 * front, so the summary, PayMongo and every screen after spell an item alike.
 */
export function addOnItemLabel(line: AddOnItemLine): string {
  return `${line.name}${line.option ? ` (${line.option})` : ''} × ${line.quantity}`;
}

/** One runner's lines on one line — `COMMEMORATIVE SHIRT (M) × 1, CAP × 1` — blank for none. */
export function addOnItemsText(lines: readonly AddOnItemLine[]): string {
  return lines.map(addOnItemLabel).join(', ');
}

/** One item to order and pack: its pieces per option, and in all. */
export type AddOnTally = {
  name: string;
  /** Chart order for sizes, then alphabetical; one row with a null option for an item without one. */
  options: { option: string | null; pieces: number }[];
  total: number;
};

/**
 * Pieces per item and option, from counted lines (the Race Report's Add-ons,
 * read in `client-race-report.ts`). An item is matched by its snapshotted
 * name, not its id: a line keeps its name when the item is deleted
 * (`addOnId` goes null), and that shirt was still sold and still has to be
 * packed. Items in name order, so the block reads like a supplier's list.
 */
export function tallyAddOns(groups: readonly { name: string; option: string | null; pieces: number }[]): AddOnTally[] {
  const items = new Map<string, Map<string | null, number>>();
  for (const group of groups) {
    if (group.pieces <= 0) continue;
    const options = items.get(group.name) ?? new Map<string | null, number>();
    options.set(group.option || null, (options.get(group.option || null) ?? 0) + group.pieces);
    items.set(group.name, options);
  }
  const rank = (option: string | null) => {
    if (option === null) return -1;
    const at = SHIRT_SIZES.indexOf(option);
    return at === -1 ? SHIRT_SIZES.length : at;
  };
  return [...items]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, options]) => {
      const rows = [...options]
        .map(([option, pieces]) => ({ option, pieces }))
        .sort((a, b) => rank(a.option) - rank(b.option) || (a.option ?? '').localeCompare(b.option ?? ''));
      return { name, options: rows, total: rows.reduce((sum, row) => sum + row.pieces, 0) };
    });
}

// ── The runner side ─────────────────────────────────────────────────────────

/**
 * An item as the event page and the wizard draw it: the rules' fields, what
 * the card shows, and whether any is left. Built on the server
 * (`publicAddOns`, add-on-stock.ts), so the stock count is never the
 * browser's.
 */
export interface PublicAddOn extends AddOnRule {
  description: string;
  imageUrls: string[];
  /** ISO instant, or null for no cutoff of its own. */
  salesCloseAt: string | null;
  /** Pieces left, or null for no limit (D9). */
  left: number | null;
  soldOut: boolean;
}

/** One runner's pick on one item, as the wizard holds and posts it. */
export interface AddOnPick {
  addOnId: string;
  /** The size or option; '' until one is chosen on an item that has them. */
  option: string;
  quantity: number;
}

/**
 * The items a runner in `categoryId` is *shown*: switched on and open to that
 * category. A closed or sold-out one stays on the card marked so (D9), which
 * is why the cutoff is not filtered here as `availableAddOns` filters it —
 * whether it can be *picked* is `addOnPickable`.
 */
export function addOnsShownFor<T extends AddOnRule>(addOns: readonly T[], categoryId: string): T[] {
  return addOns.filter(
    addOn => addOn.active && (addOn.categoryIds.length === 0 || addOn.categoryIds.includes(categoryId)),
  );
}

/** Whether a runner may add this item now: some left and still on sale. */
export function addOnPickable(addOn: Pick<PublicAddOn, 'soldOut' | 'salesCloseAt'>, now: Date = new Date()): boolean {
  return !addOn.soldOut && !addOnSalesClosed(addOn, now);
}

/**
 * The picks a runner keeps after moving to `categoryId`: only those the new
 * category is offered. The wizard says which were dropped.
 */
export function picksAllowedIn(
  picks: readonly AddOnPick[],
  addOns: readonly AddOnRule[],
  categoryId: string,
): { kept: AddOnPick[]; dropped: string[] } {
  const shown = addOnsShownFor(addOns, categoryId);
  const kept: AddOnPick[] = [];
  const dropped: string[] = [];
  for (const pick of picks) {
    if (shown.some(addOn => addOn.id === pick.addOnId)) kept.push(pick);
    else dropped.push(addOns.find(addOn => addOn.id === pick.addOnId)?.name ?? 'An add-on');
  }
  return { kept, dropped };
}

/**
 * A runner's picks as priced lines for the summary and the total, priced from
 * the item like the server prices them. Lenient where `readAddOnSelection` is
 * strict: a pick still waiting for its size is counted at its price, so the
 * total moves the moment Add is pressed; the step's validation asks for the
 * size before the order can be sent.
 */
export function pickedAddOnLines(picks: readonly AddOnPick[], addOns: readonly AddOnRule[]): AddOnLine[] {
  return picks.flatMap(pick => {
    const addOn = addOns.find(item => item.id === pick.addOnId);
    if (!addOn) return [];
    return [{
      addOnId: addOn.id,
      name: addOn.name,
      unitPrice: addOn.price,
      option: pick.option || null,
      soldBy: asSeller(addOn.soldBy),
      quantity: pick.quantity,
    }];
  });
}

/**
 * A runner's picks once their race shirt size is set: a shirt-size item still
 * waiting for its size takes that one, as it would have had it been added
 * after the size was chosen. A size already picked on the item is left alone.
 */
export function withRaceSizeFilled(
  picks: readonly AddOnPick[],
  addOns: readonly AddOnRule[],
  raceShirtSize: string,
): AddOnPick[] {
  if (!SHIRT_SIZES.includes(raceShirtSize)) return [...picks];
  return picks.map(pick => {
    const addOn = addOns.find(item => item.id === pick.addOnId);
    return !pick.option && addOn && asOptionKind(addOn.optionKind) === 'SHIRT_SIZES'
      ? { ...pick, option: raceShirtSize }
      : pick;
  });
}
