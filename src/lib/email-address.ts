/**
 * What counts as an email address, in one place.
 *
 * A runner's email is the only way an order ever reaches them again: the
 * "registration received" mail sent at checkout, the receipt when the payment
 * clears, and anything an organizer sends by hand afterwards
 * (`lib/email-delivery.ts`). An address with no `@` in it takes all of that
 * away silently — Resend refuses the send outright ("Invalid `to` field. The
 * email address needs to follow the `email@example.com` format"), the row
 * keeps a `lastEmailError` nobody reads for days, and the runner believes they
 * are registered because the wizard said so.
 *
 * That is not hypothetical: `roxymendoza025gmail.com` reached the database on
 * a live event. Both wizards mark the field `type="email"`, so a browser would
 * have caught it — but the step 1 "Next" button is a script, not a form
 * submit, and native constraint validation only runs on submit. Nothing else
 * looked. The wizards' own check (`app/events/[slug]/register/validation.ts`)
 * asked whether the box held *something*, and both checkout routes wrote
 * whatever arrived.
 *
 * So the rule lives here and every door imports it: the wizards' check, both
 * checkout routes, the runner PUT behind the admin's edit modal, staff
 * invitations and the organizer's own profile. A check on the client alone
 * would not do — a tab left open can POST straight at a route — and a check on
 * the server alone would tell the runner one screen too late, after they had
 * already uploaded a deposit slip.
 *
 * **The shape, and nothing beyond it.** `something@something.something`, with
 * no whitespace. Real addresses are far stranger than that in the
 * specification, and a regex that tries to honour all of RFC 5322 rejects
 * valid mail more often than it catches bad. This one catches the failure that
 * actually reaches us — a missing `@`, or a domain with no dot, from a phone
 * keyboard that ate a character — and leaves the rest to the mail server,
 * which is the only thing that truly knows whether an address exists.
 */

/** `something@something.something`, no whitespace anywhere. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The address every message ends on, matching the wizards' own placeholder. */
export const EMAIL_EXAMPLE = 'juan@example.com';

/**
 * An address reduced to what is stored: trimmed, and nothing else.
 *
 * Deliberately **not** lowercased. The local part of an address is
 * case-sensitive on some mail servers, so a runner's email is kept exactly as
 * they typed it — see `normalizeAccountEmail` in lib/text-case.ts for the one
 * address in the app that *is* cased, and why it is the exception.
 *
 * The trim is not cosmetic. A trailing space, pasted in from a contact card or
 * left by a phone keyboard, is enough on its own for Resend to refuse the
 * whole send.
 */
export function normalizeEmailAddress(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Whether an address has the shape of one. Trims first. */
export function looksLikeEmailAddress(value: unknown): boolean {
  return EMAIL_PATTERN.test(normalizeEmailAddress(value));
}

/** The one sentence to say about an address that will not deliver. */
export function invalidEmailMessage(example: string = EMAIL_EXAMPLE): string {
  return `Enter a valid email address, like ${example}`;
}

/**
 * What is wrong with this address, or nothing.
 *
 * Two failures, and each names itself rather than falling back on one
 * catch-all: the box is empty, or what is in it is not an address. Callers
 * that word the blank case differently — an invitation asks for "the email
 * address the invitation should go to" — pass their own `blank`, and callers
 * whose placeholder shows a different sample pass their own `example`, so the
 * hint under the field and the message above it agree.
 */
export function emailAddressError(
  value: unknown,
  options: { blank?: string; example?: string } = {}
): string | undefined {
  const address = normalizeEmailAddress(value);
  if (!address) return options.blank ?? 'Enter an email address';
  if (!EMAIL_PATTERN.test(address)) return invalidEmailMessage(options.example);
  return undefined;
}

/**
 * The first runner on an order whose address would not deliver, phrased for
 * the person who posted it.
 *
 * Both checkout routes ask this of the participants they were handed, because
 * a bad address is the one field error that cannot be discovered later: by the
 * time Resend refuses the send the money has moved, the slot is held, and the
 * runner has nothing telling them so. The runner number is only spoken when
 * there is more than one runner — "Runner 1" on a solo registration is noise.
 */
export function participantEmailError(participants: unknown): string | undefined {
  // Not an array is not this function's failure to report: the routes that ask
  // are about to read the same value as a list, and a shape complaint from the
  // email check would name the wrong problem.
  if (!Array.isArray(participants)) return undefined;

  for (const [index, participant] of participants.entries()) {
    const problem = emailAddressError((participant as { email?: unknown } | null)?.email);
    if (!problem) continue;

    if (participants.length === 1) return problem;

    // Lower-cased after the colon so the sentence reads as one — "Runner 2:
    // enter a valid email address" rather than two starts.
    return `Runner ${index + 1}: ${problem[0].toLowerCase()}${problem.slice(1)}`;
  }
  return undefined;
}
