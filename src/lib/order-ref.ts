/**
 * The reference a runner quotes back at us.
 *
 * An order gets one reference — `RM-D918005C` — and every runner on it gets
 * that reference plus their position: `RM-D918005C-1`, `-2`, `-3`. Both halves
 * matter and they answer different questions. The order reference is what was
 * paid for and what the organizer reconciles against their bank; the runner
 * reference is one person inside it, which is what a group of colleagues who
 * registered together actually need when they ask about *their* singlet.
 *
 * The format lives here rather than being spelled out at each call site
 * because it appears in the registrants table, the runner detail modal, the
 * CSV export and both registration emails. A reference printed one way on
 * screen and another in an email is not the same reference to the person
 * reading it.
 *
 * `newOrderRef` uses Web Crypto rather than node's `crypto` module so this
 * file stays importable from a client component — the registrants table is
 * one, and pulling a node built-in into the browser bundle to format a string
 * would be a poor trade. Node has had `globalThis.crypto` since 18.
 */

/** Four random bytes, uppercase hex. Short enough to read down a phone line. */
export function newOrderRef(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `RM-${hex.toUpperCase()}`;
}

/**
 * One runner's own reference. `runnerNo` is their position on the order, which
 * the checkout routes assign at creation and never recompute.
 *
 * **A solo registration keeps the bare order reference.** The suffix exists to
 * tell members of a group apart, so on an order of one it distinguishes
 * nothing and only makes the reference longer to read down a phone line and
 * easier to mistype. `RM-11FDE818` is that runner's reference *and* their
 * order's, because for them the two are the same thing.
 *
 * `runnersOnOrder` is required rather than optional so both call sites have to
 * answer the question. Note it is the order's *current* size: a group of two
 * whose second runner is later deleted by the organizer leaves the first
 * holding a bare reference, where their email said `-1`. That is the price of
 * deciding it from the order rather than storing a second column for it, and
 * removing a runner from an order already changes what that order is.
 */
export function runnerRef(
  orderRef: string,
  runnerNo: number,
  runnersOnOrder: number
): string {
  return runnersOnOrder > 1 ? `${orderRef}-${runnerNo}` : orderRef;
}
