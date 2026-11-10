import { eventInstant } from '@/lib/event-schedule';
import { EVENT_TYPES } from '@/lib/event-type';
import { asInclusions } from '@/lib/inclusions';
import { toCentavos, toPesos } from '@/lib/money';
import { includesWearable } from '@/lib/shirt-size';

/**
 * What a Bib + Medal option is allowed to be: the cheaper, shirtless version of
 * a race category, stored as a second Category row linked by `bibMedalOfId`.
 *
 * Only race events offer one. A fun-run package is already defined by its
 * inclusions, and a results-only race sells nothing.
 *
 * The inclusions rule is the one that matters. `includesWearable` matches the
 * word, so "No shirt" would ask the runner a size, and an empty list asks one
 * too (empty means "not filled in"). Both are refused here, because a
 * Bib + Medal runner being asked a shirt size is the exact thing this option
 * exists to avoid.
 *
 * **It can be scheduled, and it replaces Full rather than joining it** (owner,
 * 2026-11-10, revising D1). `opensAt` on the Bib + Medal row is when it goes on
 * sale; null means as soon as it is saved. Until then runners are not shown it
 * and cannot buy it. From then on its parent stops selling by itself: the two
 * are never on sale together, so nobody has to come back and close Full when
 * the shirt order goes in. `closedNow` is that rule, read at request time with
 * no cron, and `CLOSED_NOW_SQL` is the same rule for the checkout's locked read.
 *
 * Pure, with no database import: the admin form reads it as well as the routes.
 */

type Instantish = Date | string | null | undefined;

/** What `closedNow` needs to know about one option. */
export type SaleFacts = {
  id: string;
  closed: boolean;
  bibMedalOfId: string | null;
  opensAt: Instantish;
};

/** Scheduled, and the moment has not come. A date already past is no schedule. */
export function saleOpensLater(option: { opensAt?: Instantish }, now: Date = new Date()): boolean {
  if (!option.opensAt) return false;
  const opens = new Date(option.opensAt).getTime();
  return Number.isFinite(opens) && opens > now.getTime();
}

/**
 * A Bib + Medal option runners are not told about yet. Hidden rather than
 * shown with its date, because a cheaper entry announced in advance is a
 * reason to hold off buying Full.
 */
export function awaitsOpening(option: Pick<SaleFacts, 'closed' | 'bibMedalOfId' | 'opensAt'>, now: Date = new Date()): boolean {
  return Boolean(option.bibMedalOfId) && !option.closed && saleOpensLater(option, now);
}

/**
 * Whether this option takes no new sign-ups right now: closed by the
 * organizer, not open yet, or a Full whose Bib + Medal has gone on sale.
 *
 * `all` must be the event's whole list, because a parent is closed by a row
 * other than its own.
 */
export function closedNow(option: SaleFacts, all: SaleFacts[], now: Date = new Date()): boolean {
  if (option.closed || saleOpensLater(option, now)) return true;
  return all.some(other => other.bibMedalOfId === option.id && !other.closed && !saleOpensLater(other, now));
}

/** Drops the options runners are not shown yet. For the public pages only. */
export function shownToRunners<T extends Pick<SaleFacts, 'closed' | 'bibMedalOfId' | 'opensAt'>>(
  categories: T[],
  now: Date = new Date(),
): T[] {
  return categories.filter(category => !awaitsOpening(category, now));
}

/**
 * `closedNow` as a SQL expression over an unaliased `"Category"` row, for the
 * reads taken under a lock (`reserveSlots`, `claimSeat`). Kept beside the
 * TypeScript rule so the two are changed together.
 *
 * `NOW() AT TIME ZONE 'UTC'`, not `NOW()`: Prisma stores a DateTime as a
 * timestamp without zone holding UTC, and comparing that to a timestamptz
 * would read it in the session's zone.
 */
export const CLOSED_NOW_SQL = `(
  "Category"."closed"
  OR ("Category"."opensAt" IS NOT NULL AND "Category"."opensAt" > (NOW() AT TIME ZONE 'UTC'))
  OR EXISTS (
    SELECT 1 FROM "Category" child
    WHERE child."bibMedalOfId" = "Category"."id"
      AND NOT child."closed"
      AND (child."opensAt" IS NULL OR child."opensAt" <= (NOW() AT TIME ZONE 'UTC'))
  )
)`;

/** The switch in the event form is shown, and honoured, only when this is true. */
export function offersBibMedal(eventType: unknown, resultsOnly: boolean): boolean {
  return eventType === EVENT_TYPES.RACE && !resultsOnly;
}

/** Generated, never typed, and re-synced on every save so a rename carries over. */
export function bibMedalName(parentName: string): string {
  return `${parentName} - BIB + MEDAL`;
}

export type BibMedalField = 'price' | 'inclusions' | 'opensOn';

/** A refusal the form can put under the one field it concerns. */
export type BibMedalFault = { index: number; field: BibMedalField; message: string };

export type BibMedalValues = {
  price: number;
  slotLimit: unknown;
  inclusions: string[];
  /** When it goes on sale; null for as soon as it is saved. */
  opensAt: Date | null;
};

type IncomingOption = {
  name?: unknown;
  price?: unknown;
  bibMedal?: {
    enabled?: unknown;
    price?: unknown;
    slotLimit?: unknown;
    inclusions?: unknown;
    /**
     * The schedule as the date picker holds it: Manila wall time,
     * `YYYY-MM-DDTHH:mm`. Converted here by `eventInstant`, like the event's
     * own dates, so the zone is named in one place.
     */
    opensOn?: unknown;
  };
};

/**
 * One answer per option, in the order sent: the values to save, null to switch
 * the option off, or undefined when the body did not mention it (a form opened
 * before this feature shipped must not delete anything).
 */
export function readBibMedalOptions(
  categories: IncomingOption[],
  offered: boolean,
):
  | { ok: true; choices: (BibMedalValues | null | undefined)[] }
  | { ok: false; error: string; fault: BibMedalFault } {
  const choices: (BibMedalValues | null | undefined)[] = [];

  for (const [index, category] of categories.entries()) {
    const input = category.bibMedal;
    // Not offered wins over whatever the draft still holds: staff may have
    // switched the event to packages with the sub-form filled in.
    if (!offered) {
      choices.push(null);
      continue;
    }
    if (input === undefined) {
      choices.push(undefined);
      continue;
    }
    if (input.enabled !== true) {
      choices.push(null);
      continue;
    }

    const refuse = (field: BibMedalField, message: string) => ({
      ok: false as const,
      error: message,
      fault: { index, field, message },
    });
    const label = typeof category.name === 'string' && category.name.trim() ? category.name.trim() : `Category ${index + 1}`;

    const price = toCentavos(input.price as number | string | null | undefined);
    const fullPrice = toCentavos(category.price as number | string | null | undefined);
    if (price <= 0) {
      return refuse('price', `Enter a Bib + Medal price above ₱0 for ${label}.`);
    }
    if (price >= fullPrice) {
      return refuse(
        'price',
        `The Bib + Medal price for ${label} must be below its full price of ₱${toPesos(fullPrice).toLocaleString('en-PH')}.`,
      );
    }

    const inclusions = asInclusions(input.inclusions);
    if (inclusions.length === 0) {
      return refuse('inclusions', `List what the Bib + Medal entry for ${label} includes.`);
    }
    if (includesWearable(inclusions)) {
      return refuse(
        'inclusions',
        `Remove the garment from the Bib + Medal inclusions for ${label}. Even "No shirt" counts, because naming one asks runners for a size.`,
      );
    }

    // A blank day is "on sale once saved". A date already past is allowed and
    // means the same, so an option that has opened can be saved again untouched.
    const opensOn = typeof input.opensOn === 'string' ? input.opensOn.trim() : '';
    const opensAt = opensOn ? eventInstant(opensOn.slice(0, 10), opensOn.slice(11, 16)) : null;
    if (opensOn && !opensAt) {
      return refuse('opensOn', `Pick a real date for when Bib + Medal goes on sale for ${label}, or clear it to start now.`);
    }

    choices.push({ price, slotLimit: input.slotLimit, inclusions, opensAt });
  }

  return { ok: true, choices };
}
