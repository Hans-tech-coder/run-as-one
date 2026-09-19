import { isCalendarDay, today } from './event-schedule';

/**
 * Who counts as a minor on a race, and what a birthdate has to be.
 *
 * A runner young enough needs a parent or guardian's consent before they can be
 * registered (the consent itself arrives in a later change; this module is the
 * rule it will hang off). The owner's decisions, recorded here so nobody
 * re-litigates them in a component:
 *
 * - **Twelve and under** needs consent (`GUARDIAN_CONSENT_MAX_AGE`).
 * - **Age on race day**, not on the day of registering. A runner who is 12 when
 *   they sign up but 13 by the race does not need it.
 * - **Every event, the same rule.** There is no per-event setting and no
 *   `Event` column for it.
 * - **No minimum age.** Nothing here refuses a runner for being too young.
 * - **No future birthdates.** Today (in Manila) is the latest day accepted.
 *
 * Kept free of Prisma so both wizards can import it next to the checkout
 * routes, which is what stops the form and the server from disagreeing.
 *
 * Every date here is a `YYYY-MM-DD` string — the shape of both
 * `Runner.birthdate` and `Event.date` — and the arithmetic works on the parts
 * of that string directly. No `Date` object is involved in an age, so no
 * timezone can shift a birthday by a day.
 */

/** The oldest a runner can be on race day and still need guardian consent. */
export const GUARDIAN_CONSENT_MAX_AGE = 12;

type DayParts = { year: number; month: number; day: number };

/**
 * The parts of a `YYYY-MM-DD` that names a day which exists. `isCalendarDay`
 * only checks the shape, so "2014-02-30" would pass it; the round trip through
 * `Date.UTC` is what refuses a day the calendar does not have.
 */
function dayParts(value: unknown): DayParts | null {
  if (!isCalendarDay(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Whole years old on `day`: the year difference, minus one if the birthday
 * has not come round yet that year. A February 29 birthday falls on March 1 in
 * a year that has no February 29. Null when either date is malformed.
 */
export function ageOn(birthdate: string, day: string): number | null {
  const born = dayParts(birthdate);
  const on = dayParts(day);
  if (!born || !on) return null;

  let birthdayMonth = born.month;
  let birthdayDay = born.day;
  if (born.month === 2 && born.day === 29 && !isLeapYear(on.year)) {
    birthdayMonth = 3;
    birthdayDay = 1;
  }

  const hadBirthday =
    on.month > birthdayMonth ||
    (on.month === birthdayMonth && on.day >= birthdayDay);

  return on.year - born.year - (hadBirthday ? 0 : 1);
}

/**
 * Whether this runner needs a parent or guardian's consent for a race held on
 * `raceDay`. False when either date cannot be read — an unreadable birthdate
 * is `birthdateError`'s to report, not this rule's.
 */
export function needsGuardianConsent(birthdate: string, raceDay: string): boolean {
  const age = ageOn(birthdate, raceDay);
  return age !== null && age <= GUARDIAN_CONSENT_MAX_AGE;
}

/**
 * What is wrong with a birthdate, phrased as the fix — or undefined when it is
 * fine. `day` is today in Manila unless a caller has a reason to pass another.
 */
export function birthdateError(value: unknown, day: string = today()): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return 'Enter a birthdate';
  const birthdate = value.trim();
  if (!dayParts(birthdate)) return 'Enter a valid birthdate';
  // Both are YYYY-MM-DD, which compares correctly as text.
  if (birthdate > day) return "Birthdate can't be in the future";
  return undefined;
}

/**
 * The checkout routes' door for the rule above, used the same way as
 * `participantEmailError`: the first runner with a bad birthdate, named by
 * number when the order has more than one.
 */
export function participantBirthdateError(
  participants: unknown,
  day: string = today(),
): string | undefined {
  // A value that is not a list is the routes' shape problem to report, not
  // this check's.
  if (!Array.isArray(participants)) return undefined;

  for (const [index, participant] of participants.entries()) {
    const problem = birthdateError(
      (participant as { birthdate?: unknown } | null)?.birthdate,
      day,
    );
    if (!problem) continue;

    if (participants.length === 1) return problem;

    // "Runner 2: birthdate can't be in the future" — lower-cased after the
    // colon so it reads as one sentence.
    return `Runner ${index + 1}: ${problem[0].toLowerCase()}${problem.slice(1)}`;
  }
  return undefined;
}
