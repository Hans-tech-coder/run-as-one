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
 */
export function runnerRef(orderRef: string, runnerNo: number): string {
  return `${orderRef}-${runnerNo}`;
}
