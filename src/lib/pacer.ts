import { DISCOUNT_TYPES } from '@/lib/discount';
import { randomCodeBlock } from '@/lib/voucher-codes';

/**
 * Pacer codes: what one is, what makes one valid, and when the dashboard has to
 * nag about it.
 *
 * A pacer code is a **free entry for one named pacer, in one category of one
 * race** — the person an organizer asks to run a steady 21K so the field has
 * somebody to follow. It is stored as a `PromoCode` whose `discountType` is
 * `PACER`, because everything a promo code already does is what a pacer code
 * needs: it is typed into the wizard's promo box, it is locked to an event, it
 * is locked to a category through `PromoCategory`, it is single-use, and it
 * holds a redemption the moment the order is placed.
 *
 * **It is not a promotion, and it is not on the marketing screen.** A
 * promotion is offered to whoever qualifies; this is given to a person by name.
 * Listing pacers among promotions would add their entries to *Given Away* and
 * *Times Redeemed* and put a per-person list into a table built for campaigns,
 * and a pacer is meaningless without an event and a category — which is why
 * the screen lives at `/admin/events/[id]/pacers`, beside Registrants and
 * Results. See `PACER_DISCOUNT_PLAN.md`.
 *
 * **Prisma-free on purpose**, like `discount.ts` beside it: the Pacers screen
 * is a client component and reads these same rules to decide what to draw, so
 * a check shown on screen and a check enforced by the route are one function
 * rather than two that can drift. The routes are still the last word — nothing
 * here is trusted because the browser sent it.
 */

/** A pacer code's kind, so nothing has to spell the string twice. */
export const PACER_DISCOUNT_TYPE = DISCOUNT_TYPES.PACER;

/**
 * The most a pacer's name may be.
 *
 * The same ceiling a runner's name gets, for the same reason: it is a name on a
 * row, not a paragraph, and a column with no bound is a column somebody pastes
 * a document into.
 */
export const MAX_PACER_NAME_LENGTH = 80;

/** Characters of randomness on the end of a pacer code. */
const PACER_CODE_RANDOM = 4;

/** How much of the category's name the code carries. */
const PACER_CODE_CATEGORY_MAX = 8;

/** Every pacer code starts here, so one is recognisable on sight. */
export const PACER_CODE_PREFIX = 'PACER';

/**
 * A pacer's name as it is stored: uppercase and trimmed, with runs of space
 * collapsed.
 *
 * Uppercase because every other stored name in this app is — a registrant, a
 * winner on the results board — and a pacer's name sits in a table beside
 * those. Collapsing the spaces means "JUAN  DELA CRUZ" and "JUAN DELA CRUZ"
 * are the same pacer rather than two rows nobody can tell apart.
 */
export function normalizePacerName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * A new code for a pacer in this category: `PACER-21KM-7KQ4`.
 *
 * The category is in the code because a pacer code is locked to one, and a
 * staff member sending five codes out by hand should be able to see at a
 * glance that the 21K pacer got the 21K code.
 *
 * **The distance is what goes in, not the name** (the owner's call, 2026-09-22).
 * A distance is already the short, universal way a runner refers to a race —
 * `21KM`, `10KM`, `5KM` — while a name is whatever the organizer typed, so
 * "HALF-MARATHON" shortened to fit came out as `PACER-HALFMARA-RFGG`: longer to
 * retype and uglier for no gain. The name is the fallback for a category that
 * has no distance recorded, which is the only case where it says more than
 * nothing.
 *
 * Anything that is not a letter or a digit comes out either way (so "10 km /
 * Fun Run" is `10KMFUNR` once cut), and the result is capped at
 * `PACER_CODE_CATEGORY_MAX`, because the readable part of a code is the part
 * somebody has to retype.
 *
 * The random tail is what makes it unguessable, and it comes from
 * `voucher-codes.ts`' alphabet — no O against 0, no I or L against 1 — since
 * this code is read off a chat message exactly like a voucher. Four characters
 * of 27 is ~531,000 combinations per category, against a handful of pacers per
 * race; uniqueness is still enforced by the database's
 * `[organizerId, code]` index, and the route retries rather than trusting the
 * odds.
 *
 * A category with neither a usable distance nor a usable name (it happens:
 * "—") leaves the middle section out rather than producing `PACER--7KQ4`.
 */
export function pacerCodeFor(category: { name: string; distance?: string | null }): string {
  // The distance first, the name only when the distance gives us nothing. Both
  // go through the same cleaning, so the choice is "which label", never "which
  // rules".
  const slug = codeSlug(category.distance) || codeSlug(category.name);

  const middle = slug ? `${slug}-` : '';
  return `${PACER_CODE_PREFIX}-${middle}${randomCodeBlock(PACER_CODE_RANDOM)}`;
}

/** A label as a code can carry it: uppercase, letters and digits only, cut to fit. */
function codeSlug(label: unknown): string {
  return String(label ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, PACER_CODE_CATEGORY_MAX);
}

/** The shape this module reasons about — the pacer-facing half of a `PromoCode`. */
export interface PacerTerms {
  /** The pacer's name, as stored. Null only for a row written before this feature. */
  assigneeName: string | null;
  /** When staff marked the code as sent, or null. ISO once it has crossed the wire. */
  codeSentAt: string | Date | null;
  /** Redemptions taken. A pacer code's limit is 1, so anything above 0 means used. */
  usageCount: number;
}

/**
 * Whether this pacer has actually used their code.
 *
 * One redemption is the whole of it: a pacer code is single-use by
 * construction (`usageLimit` 1), and `redeemPromoCode` spends it the moment
 * the order is placed. So "used" here means "there is a registration behind
 * this code", which is exactly what the screen's *Registered* status claims.
 */
export function isPacerRegistered(pacer: Pick<PacerTerms, 'usageCount'>): boolean {
  return pacer.usageCount > 0;
}

/**
 * Whether this pacer still needs their code sent to them.
 *
 * **The app emails no pacer.** Staff copy the code and send it themselves,
 * which is the owner's decision and a reasonable one — a pacer is somebody the
 * organizer is already talking to. The cost of that decision is that a pacer
 * can be created and then forgotten, so the dashboard has to be able to say
 * so, and this is the one rule that decides it: the code has not been marked
 * as sent **and** nobody has registered with it.
 *
 * The second half matters. Once a pacer has registered they plainly received
 * the code, whatever the mark says, so the reminder goes away on the evidence
 * rather than waiting for somebody to tidy up a flag.
 *
 * Written once because three places show it and must agree: the amber chip on
 * the row and the card, the amber line in the screen's header, and the count on
 * the event action menu's *Pacers* item. A count that disagreed with the chips
 * under it would send staff hunting for a pacer that is not there.
 */
export function needsCodeSent(pacer: PacerTerms): boolean {
  return !pacer.codeSentAt && !isPacerRegistered(pacer);
}

/** How many of these pacers have not been sent their code. */
export function pacersNeedingCodeSent(pacers: PacerTerms[]): number {
  return pacers.filter(needsCodeSent).length;
}

/**
 * The amber line the Pacers screen prints in its header, or null when there is
 * nothing to chase.
 *
 * A sentence rather than a bare number, because it is read on its own above a
 * list and "3" above a table of pacers says nothing about which three.
 */
export function codeSentReminder(pacers: PacerTerms[]): string | null {
  const waiting = pacersNeedingCodeSent(pacers);
  if (waiting === 0) return null;
  return waiting === 1
    ? '1 pacer has not been sent their code yet.'
    : `${waiting} pacers have not been sent their code yet.`;
}

/**
 * The *Pacers* item's label on an event's action menu: the count is there so a
 * forgotten pacer is visible without opening the screen.
 */
export function pacerMenuLabel(notSent: number): string {
  return notSent > 0 ? `Pacers · ${notSent} not sent` : 'Pacers';
}

/** A refusal, naming the field that caused it — the shape every admin route answers with. */
export interface PacerInputError {
  error: string;
  field: string;
}

/** What a valid Add Pacer input becomes. */
export interface PacerInputData {
  assigneeName: string;
  categoryId: string;
  waiveAdminFee: boolean;
}

/** What the Pacers screen can say about a pacer. */
export interface PacerInput {
  assigneeName?: unknown;
  categoryId?: unknown;
  waiveAdminFee?: unknown;
}

/** What the caller knows that this module cannot work out for itself. */
export interface PacerInputContext {
  /** The ids of the categories **of this event**, so a category cannot be borrowed from another race. */
  eventCategoryIds: readonly string[];
  /** Whether this actor holds `promo:waive-fee` — the Super Admin alone. */
  canWaiveAdminFee: boolean;
}

/**
 * The refusal an admin gets for asking to waive the fee, and the hint the
 * disabled toggle shows them before they ask. One sentence in one place: a
 * control explaining itself one way and a route refusing in another reads as a
 * bug in the screen rather than as a decision about money.
 */
export const WAIVE_REFUSAL = {
  error: 'Only the Super Admin can waive the admin fee.',
  field: 'waiveAdminFee',
} as const;

/**
 * The posted pacer, turned into the columns it becomes — or refused by name.
 *
 * Every refusal carries the field that caused it, per the project's rule that
 * validation says exactly what is missing rather than showing one catch-all
 * sentence over a form with four boxes.
 *
 * Three things are checked, and each is a way of getting a free entry wrong:
 *
 *  - **A name is required.** A pacer code with no pacer is a free entry nobody
 *    is accountable for, and the whole point of the screen is being able to say
 *    whose code this is.
 *  - **The category must belong to this event.** A pacer code takes a slot in
 *    the category it names, so an id from another race would hold a place in a
 *    race the code cannot be used for.
 *  - **The fee waiver needs `promo:waive-fee`.** The admin fee is Run As One's
 *    money, so an admin asking for it is refused here rather than silently
 *    saved as `false` — quietly dropping a field somebody ticked is how a
 *    pacer ends up being charged a fee the organizer promised to cover.
 *
 * The rename path calls this too, through `pacerNameFromInput`, so the one
 * name rule covers creating and renaming alike.
 */
export function pacerFromInput(
  input: PacerInput,
  context: PacerInputContext,
): { data: PacerInputData } | { problem: PacerInputError } {
  const name = pacerNameFromInput(input.assigneeName);
  if ('problem' in name) return name;

  const categoryId = String(input.categoryId ?? '').trim();
  if (!categoryId) {
    return {
      problem: {
        error: 'Choose the category this pacer will run.',
        field: 'categoryId',
      },
    };
  }
  if (!context.eventCategoryIds.includes(categoryId)) {
    return {
      problem: {
        error: 'That category is not one of this event’s.',
        field: 'categoryId',
      },
    };
  }

  const waiveAdminFee = input.waiveAdminFee === true;
  if (waiveAdminFee && !context.canWaiveAdminFee) {
    return { problem: { ...WAIVE_REFUSAL } };
  }

  return { data: { assigneeName: name.name, categoryId, waiveAdminFee } };
}

/**
 * A pacer's name on its own, for the rename path.
 *
 * Separate from `pacerFromInput` because a rename posts nothing else: a pacer
 * already has their category (which is not editable — it is what their code is
 * locked to) and their waiver is its own request.
 */
export function pacerNameFromInput(
  value: unknown,
): { name: string } | { problem: PacerInputError } {
  const name = normalizePacerName(value);
  if (!name) {
    return {
      problem: {
        error: 'Enter the pacer’s name, so this code can be told whose it is.',
        field: 'assigneeName',
      },
    };
  }
  if (name.length > MAX_PACER_NAME_LENGTH) {
    return {
      problem: {
        error: `A name can be at most ${MAX_PACER_NAME_LENGTH} characters.`,
        field: 'assigneeName',
      },
    };
  }
  return { name };
}
