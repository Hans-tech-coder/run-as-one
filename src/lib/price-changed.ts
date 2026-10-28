/**
 * The "Prices have changed" refusal (PROMO_PRICE_LOCK_PLAN.md Batch 2): **when
 * a checkout refuses an order because the amounts it was posted are not the
 * server's, the 409 says so in a shape the wizard can read, and carries the
 * server's own figures.**
 *
 * Both checkout routes recompute every amount from the database and refuse a
 * posted figure that disagrees (Strix vuln-0014). That refusal used to be a
 * bare sentence, so the wizard could only `alert()` it and the runner — who
 * may already have sent money by GCash or bank transfer — was never told what
 * the amount had become. Now it is `{ error, code: 'PRICE_CHANGED', ...figures }`:
 *
 * - `error` is the same sentence as before, so a tab that still does
 *   `alert(data.error)` reads exactly what it always did.
 * - `code` is how a wizard tells this 409 apart from the others (registration
 *   closed, paused, not open yet), which also carry only `error`.
 * - The figures are centavos, each the server's own, and present only when
 *   the route had computed it at the point it refused. A refusal on the
 *   subtotal or delivery fee comes before the promotions are read, so it
 *   carries just those two and **no `total`**: the wizard should then show
 *   the sentence and ask for a reload rather than guess a total. The admin-fee
 *   and total refusals carry everything, `total` included.
 *
 * No server imports, so a wizard can import the type and `isPriceChanged`
 * from here to read the response.
 */

export const PRICE_CHANGED_CODE = 'PRICE_CHANGED';

export const PRICE_CHANGED_MESSAGE = 'Prices have changed. Please reload the page and try again.';

/** The server's own figures for the order, in centavos. */
export interface PriceChangedFigures {
  subtotal: number;
  deliveryFee: number;
  /** The discount the order gets now, promotions and any price lock weighed. */
  discount?: number;
  platformFee?: number;
  /** Every add-on line on the order, at its listed price (ADD_ONS_PLAN.md D5). */
  addOnTotal?: number;
  /** Zero on a bank transfer, which carries none. */
  transactionFee?: number;
  /** What the runner would pay. Absent when the refusal came before it was known. */
  total?: number;
}

export interface PriceChangedBody extends PriceChangedFigures {
  error: string;
  code: typeof PRICE_CHANGED_CODE;
}

/** The 409 body for a posted amount that is not the server's. */
export function priceChangedBody(figures: PriceChangedFigures): PriceChangedBody {
  return { error: PRICE_CHANGED_MESSAGE, code: PRICE_CHANGED_CODE, ...figures };
}

/** Whether a checkout's error response is this refusal. */
export function isPriceChanged(data: unknown): data is PriceChangedBody {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { code?: unknown }).code === PRICE_CHANGED_CODE
  );
}
