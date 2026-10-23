/**
 * **What Track My Registration accepts as a lookup** (TRACK_PAGE_PLAN.md D1):
 * a reference and an email, read the same way by the form and by
 * `/api/track`, so the form never lets through what the route refuses and the
 * route names a bad field in the form's own words.
 *
 * Only a value that cannot be a reference or an email at all is named back on
 * its field. Everything else that misses — no such order, the wrong email — is
 * the one `TRACK_NOT_FOUND`, decided in lib/track.ts, so the answer never says
 * which half was wrong. Client-safe: no database here.
 */

import { looksLikeEmailAddress } from './email-address';

export const TRACK_NOT_FOUND =
  'We could not find a registration with that reference and email. Check both against your registration email and try again.';

/** A typed reference, read: the order's and, for `RM-…-2`, the runner number. */
export type TrackRef = { orderRef: string; runnerNo: number | null };

/** Spaces dropped and upper-cased, so `rm-d918005c - 2` reads as typed on paper. */
export function readTrackRef(raw: string): TrackRef | null {
  const value = raw.replace(/\s+/g, '').toUpperCase();
  const match = /^(RM-[A-Z0-9]{4,16})(?:-(\d{1,3}))?$/.exec(value);
  if (!match) return null;
  return { orderRef: match[1], runnerNo: match[2] ? Number(match[2]) : null };
}

/** Each field's own complaint, or null when the pair can be looked up. */
export function trackInputErrors(ref: unknown, email: unknown): { ref?: string; email?: string } | null {
  const errors: { ref?: string; email?: string } = {};
  const refText = typeof ref === 'string' ? ref.trim() : '';
  const emailText = typeof email === 'string' ? email.trim() : '';
  if (!refText) errors.ref = 'Enter your registration reference, like RM-D918005C';
  else if (!readTrackRef(refText)) {
    errors.ref = 'A reference starts with RM- followed by letters and numbers, like RM-D918005C or RM-D918005C-2';
  }
  if (!emailText) errors.email = 'Enter the email you registered with';
  else if (!looksLikeEmailAddress(emailText)) errors.email = 'Enter a valid email address, like juan@gmail.com';
  return errors.ref || errors.email ? errors : null;
}
