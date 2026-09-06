/**
 * Registrant text is stored UPPERCASE.
 *
 * The point is the value in the column, not a CSS transform on one screen. The
 * same runner is read back by the registrants table, the runner detail modal,
 * the CSV export, the registration emails and the e-certificate; a
 * `text-transform` fixes exactly one of those and leaves the other four showing
 * whatever the runner happened to type at 6am. Uppercasing on the way in makes
 * all of them uniform by construction, and makes an export sort and de-dupe
 * predictably.
 *
 * What is deliberately left alone:
 *  - **Email.** The local part of an address is case-sensitive on some mail
 *    servers, so uppercasing it can stop delivery outright. Never touch it.
 *  - Passwords, phone numbers (already E.164 digits) and blob URLs.
 *  - Most of the admin side — event title, bank name. Those are the
 *    organizer's own copy, and how they capitalise their race is a design
 *    decision, not a data one.
 *
 * The **category (or package) name is the exception** to that last line, and it
 * is uppercased. It is not really the organizer's private copy: it is printed
 * in the registrants table, the CSV export and both registration emails right
 * beside runner data that is all uppercase, so a "Basic Package" sitting next
 * to a "DELA CRUZ" reads as a mistake. Uppercased in `EventOptionsPanel` as the
 * organizer types and again in the two admin event routes on the write.
 *
 * There are two entry points because the rule has to hold in two places:
 *  - `upperCaseAsTyped` runs in the wizards and the admin's runner-edit modal,
 *    so the runner reads back exactly what the database is going to hold rather
 *    than being surprised by it later. It deliberately does **not** trim: doing
 *    so mid-typing would swallow the space between a first and a middle name at
 *    the moment it is typed.
 *  - `upperCaseForStorage` runs in the API immediately before the write, and
 *    that one trims. A tab left open can POST straight at the route, so the
 *    server has to be the last word on what lands in the column.
 *
 * A field whose value is stored uppercase shows an uppercase **sample**
 * placeholder too — "JUAN", "DELA CRUZ" — so the hint matches what the runner
 * is about to see in the box. Placeholders that are *instructions* rather than
 * samples stay in sentence case and are readable as English: the email address,
 * "Type to search, or add your own" on the club picker, and "e.g. Asthma,
 * Allergies" on medical conditions, whose typed value is still uppercased.
 *
 * `toUpperCase()` rather than `toLocaleUpperCase()`: the locale-aware version
 * follows the *server's* locale, which would turn a Turkish-hosted `i` into `İ`
 * for a Filipino runner who never asked for one.
 */

/**
 * The runner fields that are stored uppercase, named once so both wizards, the
 * admin edit modal and both checkout routes cannot drift apart on the list.
 *
 * `runningCommunity` is on it but is normally handled a step earlier, by
 * `asRunnerCommunity` in running-community.ts — that function owns the whole
 * shape of the stored club name, uppercasing included. `gender` is on it even
 * though it comes from a closed picker whose own options are already uppercase:
 * the list is what the server enforces, and a picker's options are not.
 */
export const UPPERCASED_RUNNER_FIELDS = [
  'firstName',
  'lastName',
  'gender',
  'emergencyContactName',
  'medicalConditions',
  'runningCommunity',
] as const;

export type UppercasedRunnerField = (typeof UPPERCASED_RUNNER_FIELDS)[number];

export function isUppercasedRunnerField(
  field: string
): field is UppercasedRunnerField {
  return (UPPERCASED_RUNNER_FIELDS as readonly string[]).includes(field);
}

/** For a controlled input: uppercase, but leave the runner's spacing alone. */
export function upperCaseAsTyped(value: string): string {
  return value.toUpperCase();
}

/**
 * For the write. Trimmed and uppercased.
 *
 * Anything that is not a string becomes `''` rather than throwing: this runs at
 * the API door on a body we did not build, and rejecting bad input is the
 * caller's job, not this helper's.
 */
export function upperCaseForStorage(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

/**
 * The same, for a nullable column. A blank answer stays empty rather than
 * becoming a `''` that reads as "they answered nothing" and "they answered
 * with an empty string" at the same time.
 */
export function optionalUpperCaseForStorage(value: unknown): string | null {
  return upperCaseForStorage(value) || null;
}
