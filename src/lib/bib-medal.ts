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
 * Pure, with no database import: the admin form reads it as well as the routes.
 */

/** The switch in the event form is shown, and honoured, only when this is true. */
export function offersBibMedal(eventType: unknown, resultsOnly: boolean): boolean {
  return eventType === EVENT_TYPES.RACE && !resultsOnly;
}

/** Generated, never typed, and re-synced on every save so a rename carries over. */
export function bibMedalName(parentName: string): string {
  return `${parentName} - BIB + MEDAL`;
}

export type BibMedalField = 'price' | 'inclusions';

/** A refusal the form can put under the one field it concerns. */
export type BibMedalFault = { index: number; field: BibMedalField; message: string };

export type BibMedalValues = { price: number; slotLimit: unknown; inclusions: string[] };

type IncomingOption = {
  name?: unknown;
  price?: unknown;
  bibMedal?: { enabled?: unknown; price?: unknown; slotLimit?: unknown; inclusions?: unknown };
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

    choices.push({ price, slotLimit: input.slotLimit, inclusions });
  }

  return { ok: true, choices };
}
