import { Prisma } from '@prisma/client';
import db from '@/lib/db';

/**
 * Whether an event is taking registrations right now, and why not when it
 * isn't.
 *
 * Three separate things close sign-ups, and a runner turned away by one of
 * them needs to be told which:
 *
 * - **The race has already been run.** That line lives in event-schedule.ts,
 *   not here; this module only reports it so one call answers the whole
 *   question.
 * - **Every option is full.** A cap is per `Category`, because 500 singlets in
 *   the 10K says nothing about the 5K standing beside it. The event closes
 *   only once every option it sells has filled.
 * - **The organizer paused it.** A decision rather than a fact — slots remain
 *   and race day is still ahead — so it carries the organizer's own words.
 *
 * The rule lives here because six screens ask it: the event page, both
 * wizards' option pickers, the register page, the public listings, and both
 * checkout routes. Two of those are the last word — an open tab still POSTs —
 * so the checkout routes re-count inside their write transaction rather than
 * trusting anything computed for a page.
 */

/**
 * Which registrations hold a slot.
 *
 * PENDING counts. Counting only PAID would oversell every event that takes
 * bank transfers: those sit PENDING from the moment they are submitted until a
 * human has looked at the proof, which can be days. Selling that seat twice in
 * the meantime is exactly the failure a slot limit exists to prevent.
 */
export const SLOT_HOLDING_STATUSES = ['PAID', 'PENDING'] as const;

/**
 * When remaining slots stop being trivia and start being a decision.
 *
 * Under this, the picker says how many are left, because a group of four needs
 * to know that three remain *before* they fill in four forms. Above it, a
 * running count on a 500-slot race is noise that makes every option look like
 * it is about to close.
 */
export const LAST_CALL_SLOTS = 20;

/** What runners are told while a hold is on and the organizer wrote nothing. */
export const DEFAULT_PAUSE_NOTE =
  'The organizer has paused sign-ups for this event. Slots may open again — check back soon, or contact the organizer if you have already paid.';

/** The minimum shape of a category this module can reason about. */
export type SlotLimited = {
  id: string;
  slotLimit: number | null;
};

/** A category with its slot arithmetic already done. */
export type CategorySlots = {
  /** Runners already holding a slot in this option. */
  slotsTaken: number;
  /** How many are left, or null when the option is uncapped. */
  slotsLeft: number | null;
  isFull: boolean;
  /** Few enough left that the number is worth showing — see LAST_CALL_SLOTS. */
  isLastCall: boolean;
};

/** Why registration is closed, or OPEN when it isn't. */
export type RegistrationState = 'OPEN' | 'FINISHED' | 'PAUSED' | 'FULL';

/**
 * How many runners each of these categories has already taken.
 *
 * Grouped in one query rather than counted per category: an event page asking
 * five separate counts would be five round trips to Neon for a number that is
 * read on every page load.
 *
 * `client` is the transaction handle when a checkout route calls this, and the
 * plain client everywhere else. The count has to be taken *inside* the write
 * transaction to mean anything there, and the arithmetic must not fork into a
 * second copy for that.
 */
export async function takenSlotsByCategory(
  categoryIds: string[],
  client: { runner: { groupBy: any } } = db,
): Promise<Map<string, number>> {
  if (categoryIds.length === 0) return new Map();

  const rows = await client.runner.groupBy({
    by: ['categoryId'],
    where: {
      categoryId: { in: categoryIds },
      registration: { status: { in: [...SLOT_HOLDING_STATUSES] } },
    },
    _count: { _all: true },
  });

  return new Map(
    rows.map((row: any) => [row.categoryId as string, row._count._all as number]),
  );
}

/**
 * A slot limit as the database should hold it, from whatever the admin form
 * posted.
 *
 * An empty field means "no cap", which is null — and so does a 0 or a negative
 * number, because an option nobody can enter is not something an organizer can
 * have meant by typing in this box. Fractions are floored: half a slot is not a
 * thing, and the column is an Int.
 */
export function asSlotLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const limit = Math.floor(Number(value));
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return limit;
}

/** Attaches the slot arithmetic to each category, leaving the rest untouched. */
export function withSlotCounts<T extends SlotLimited>(
  categories: T[],
  taken: Map<string, number>,
): (T & CategorySlots)[] {
  return categories.map(category => {
    const slotsTaken = taken.get(category.id) ?? 0;
    const limit = category.slotLimit;
    // A limit of zero or less would mean an option nobody can ever enter,
    // which is not something the admin form offers. Treated as uncapped rather
    // than as a permanently full row, because an empty field means "no cap".
    const capped = typeof limit === 'number' && limit > 0;
    const slotsLeft = capped ? Math.max(0, limit - slotsTaken) : null;
    return {
      ...category,
      slotsTaken,
      slotsLeft,
      isFull: slotsLeft !== null && slotsLeft === 0,
      isLastCall: slotsLeft !== null && slotsLeft > 0 && slotsLeft <= LAST_CALL_SLOTS,
    };
  });
}

/**
 * Whether nothing on this event can be entered any more.
 *
 * One uncapped option keeps the whole event open, which is the point of
 * putting the cap on the category: an organizer capping only their 10K has
 * said nothing about the 5K.
 */
export function everyOptionIsFull(categories: CategorySlots[]): boolean {
  return categories.length > 0 && categories.every(category => category.isFull);
}

/**
 * The one answer every screen asks for. `finished` comes from
 * `hasFinished(event)` in event-schedule.ts — passed in rather than computed
 * here, so this module stays about slots and holds.
 *
 * Order matters: a race that has been run is over whether or not its organizer
 * also paused it, and a deliberate hold outranks a count.
 */
export function registrationState(
  event: { registrationPaused?: boolean | null },
  categories: CategorySlots[],
  finished: boolean,
): RegistrationState {
  if (finished) return 'FINISHED';
  if (event.registrationPaused) return 'PAUSED';
  if (everyOptionIsFull(categories)) return 'FULL';
  return 'OPEN';
}

/** The organizer's own wording for a hold, or the standard sentence. */
export function pauseNote(event: { registrationPauseNote?: string | null }): string {
  const written = event.registrationPauseNote?.trim();
  return written ? written : DEFAULT_PAUSE_NOTE;
}

/** What a runner is told when every option has sold out. */
export const EVENT_FULL_MESSAGE =
  'Every option on this race has reached its slot limit, so registration is closed. Slots occasionally free up when an unpaid transfer expires — it is worth checking back.';

/** One option that cannot take everyone who was entered into it. */
export type SlotShortfall = {
  name: string;
  /** Runners on this order who chose it. */
  wanted: number;
  /** Slots actually left when the write was attempted. */
  available: number;
};

/**
 * Which options this order asks more of than they have left.
 *
 * Returns the shortfalls rather than a boolean because the runner has to be
 * told which option and by how much — "the event is full" is exactly the
 * generic failure this project does not ship. A group of four picking an
 * option with three slots left is the case this exists for, and it is
 * invisible to the picker's own FULL chip: that option was open when they
 * started filling the forms in.
 */
export function slotShortfalls(
  participants: { categoryId?: string }[],
  categories: (CategorySlots & { id: string; name: string })[],
): SlotShortfall[] {
  const wantedPerCategory = new Map<string, number>();
  for (const participant of participants) {
    const id = participant.categoryId;
    if (!id) continue;
    wantedPerCategory.set(id, (wantedPerCategory.get(id) ?? 0) + 1);
  }

  const shortfalls: SlotShortfall[] = [];
  for (const category of categories) {
    const wanted = wantedPerCategory.get(category.id) ?? 0;
    if (wanted === 0 || category.slotsLeft === null) continue;
    if (wanted > category.slotsLeft) {
      shortfalls.push({ name: category.name, wanted, available: category.slotsLeft });
    }
  }
  return shortfalls;
}

/** The sentence a runner reads when their order no longer fits. */
export function shortfallMessage(shortfalls: SlotShortfall[]): string {
  const parts = shortfalls.map(({ name, wanted, available }) =>
    available === 0
      ? `${name} has just filled up`
      : `${name} has only ${available} slot${available === 1 ? '' : 's'} left and you entered ${wanted} runner${wanted === 1 ? '' : 's'}`,
  );

  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

  return `${capitalise(list)}. Nothing has been charged — go back to step 1 and adjust your runners.`;
}

function capitalise(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Thrown by `reserveSlots` when the order no longer fits. Its message is
 * already the sentence the runner should read, so a route can hand it straight
 * back with a 409.
 */
export class SlotsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlotsUnavailableError';
  }
}

/**
 * The last word on slots, taken inside the transaction that writes the
 * registration.
 *
 * A check made before the write is a check made against a number that can
 * change before the write lands: two groups submitting the last three slots
 * within the same second would both read three and both be allowed. So the
 * capped category rows are locked first — `FOR UPDATE` holds them for the rest
 * of the transaction — and only then counted. The second group waits on the
 * lock, and by the time it counts, the first group's runners are there.
 *
 * Only capped options are locked, so an event with no limits pays nothing for
 * this: no lock, no count, no round trip.
 */
export async function reserveSlots(
  tx: any,
  categories: (SlotLimited & { name: string })[],
  participants: { categoryId?: string }[],
): Promise<void> {
  const capped = categories.filter(category => (category.slotLimit ?? 0) > 0);
  if (capped.length === 0) return;

  const ids = capped.map(category => category.id);
  // Ordered by id so two transactions locking the same event's options always
  // take them in the same order, which is what stops them deadlocking on each
  // other.
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Category" WHERE "id" IN (${Prisma.join(
      [...ids].sort(),
    )}) ORDER BY "id" FOR UPDATE`,
  );

  const taken = await takenSlotsByCategory(ids, tx);
  const shortfalls = slotShortfalls(participants, withSlotCounts(capped, taken));
  if (shortfalls.length > 0) {
    throw new SlotsUnavailableError(shortfallMessage(shortfalls));
  }
}

/**
 * Which of these events cannot take another runner in any option.
 *
 * For the public listings, which render many events at once and need one badge
 * per card. A single grouped count across every category on the page, for the
 * same reason takenSlotsByCategory groups: one query, not one per card.
 */
export async function fullEventIds(
  events: { id: string; categories: SlotLimited[] }[],
): Promise<Set<string>> {
  // An event with an uncapped option can never be full, so it is not worth
  // counting. On a platform where nobody uses limits, this leaves nothing to
  // ask the database at all.
  const capped = events.filter(
    event =>
      event.categories.length > 0 &&
      event.categories.every(category => (category.slotLimit ?? 0) > 0),
  );
  if (capped.length === 0) return new Set();

  const taken = await takenSlotsByCategory(
    capped.flatMap(event => event.categories.map(category => category.id)),
  );

  return new Set(
    capped
      .filter(event => everyOptionIsFull(withSlotCounts(event.categories, taken)))
      .map(event => event.id),
  );
}

/** Why a listing card cannot be registered on, or null when it can. */
export type ListingClosure = 'PAUSED' | 'FULL' | null;

/**
 * Tags each event for a public listing card and drops the categories it needed
 * to work that out.
 *
 * Dropped deliberately: `EventGrid` is a client component, so everything left
 * on these objects is serialized into the page for the browser to download, and
 * the slot limits were only ever needed on the server. A card that says FULL is
 * the whole of what the listing has to know.
 */
export async function forListing<
  T extends {
    id: string;
    registrationPaused?: boolean | null;
    categories: SlotLimited[];
  },
>(events: T[]): Promise<(Omit<T, 'categories'> & { registrationClosed: ListingClosure })[]> {
  const full = await fullEventIds(events);

  return events.map(event => {
    const { categories: _categories, ...card } = event;
    return {
      ...card,
      registrationClosed: event.registrationPaused
        ? 'PAUSED'
        : full.has(event.id)
          ? 'FULL'
          : null,
    };
  });
}
