/**
 * **How Track My Registration shows a detail without handing it over**
 * (TRACK_PAGE_PLAN.md §5, D9, D10).
 *
 * The page exists so a runner can *spot* a mistake in what they submitted, and
 * its reference and email leak through screenshots and group chats, so every
 * field is shown at the least that still lets its owner see it is right:
 *
 * | Field | Shown as |
 * | --- | --- |
 * | email | `ju•••@gmail.com` — they already know it |
 * | phone | `0917•••4567` — the last four catch a typo |
 * | address | city + province; street and barangay never (D9) |
 * | birthdate | month + year, `March 1990` (D10); age is sensitive under RA 10173 |
 * | emergency phone | `•••4567` |
 * | medical conditions | "Declared" / "None declared"; health is sensitive under RA 10173 |
 *
 * These run **on the server only**, on the values of the lookup's whitelisted
 * `select` (lib/track.ts): the full value never reaches the JSON, the HTML or
 * the bundle, so there is nothing in the browser to unmask.
 */

const DOTS = '•••';

/** `ju•••@gmail.com`. One letter kept of a local part of one or two. */
export function maskEmail(email: string): string {
  const value = email.trim();
  const at = value.lastIndexOf('@');
  if (at <= 0) return DOTS;
  const local = value.slice(0, at);
  return `${local.slice(0, local.length > 2 ? 2 : 1)}${DOTS}${value.slice(at)}`;
}

/**
 * `0917•••4567`; a number too short to keep both ends shows only its last four.
 * A `+63 917…` number is read in its local `0917…` form, the one a runner
 * recognises as theirs.
 */
export function maskPhone(phone: string): string {
  const raw = phone.replace(/\D/g, '');
  const digits = raw.length === 12 && raw.startsWith('63') ? `0${raw.slice(2)}` : raw;
  if (!digits) return '';
  if (digits.length < 10) return `${DOTS}${digits.slice(-4)}`;
  return `${digits.slice(0, 4)}${DOTS}${digits.slice(-4)}`;
}

/** `•••4567`, for a phone that is not the runner's own. */
export function maskPhoneTail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits ? `${DOTS}${digits.slice(-4)}` : '';
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `March 1990` from the stored `1990-03-14`; blank for anything else. */
export function birthMonthYear(birthdate: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(birthdate.trim());
  if (!match) return '';
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : '';
}

/** "Declared" when anything was written, so the runner knows it is on file. */
export function medicalLine(conditions: string | null): 'Declared' | 'None declared' {
  const text = (conditions ?? '').trim();
  return text && !/^(none|n\/?a|no|wala)\.?$/i.test(text) ? 'Declared' : 'None declared';
}

/** "Quezon City, Metro Manila" from whichever of the two was given. */
export function cityProvince(city: string | null | undefined, province: string | null | undefined): string {
  return [city, province].map(part => (part ?? '').trim()).filter(Boolean).join(', ');
}
