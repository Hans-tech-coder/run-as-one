import { isCalendarDay, today } from './event-schedule';
import { optionalUpperCaseForStorage } from './text-case';

/**
 * Who counts as a minor on a race, and what a birthdate has to be.
 *
 * A runner young enough needs a parent or guardian's consent before they can be
 * registered. The owner's decisions, recorded here so nobody re-litigates them
 * in a component:
 *
 * - **Twelve and under** needs consent (`GUARDIAN_CONSENT_MAX_AGE`).
 * - **Age on race day**, not on the day of registering. A runner who is 12 when
 *   they sign up but 13 by the race does not need it.
 * - **Every event, the same rule.** There is no per-event setting and no
 *   `Event` column for it.
 * - **No minimum age.** Nothing here refuses a runner for being too young.
 * - **No future birthdates.** Today (in Manila) is the latest day accepted.
 * - **Consent is given inside the form**, the way the order's own waiver is:
 *   the guardian's name, their relationship, and a tick that names the child.
 *   No printable form to download, sign, scan and upload — that is the step a
 *   parent on a phone abandons the order at. No guardian phone either; the
 *   runner's emergency contact already covers it.
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

// ---------------------------------------------------------------------------
// Guardian consent (GUARDIAN_CONSENT_PLAN.md, Batch 3)
// ---------------------------------------------------------------------------

/**
 * Who may consent. Stored as the plain string on `Runner.guardianRelationship`,
 * guarded by `asGuardianRelationship`, like every other closed vocabulary here.
 */
export const GUARDIAN_RELATIONSHIPS = ['PARENT', 'LEGAL_GUARDIAN'] as const;

export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

/** What a person reads for each stored value. */
export const GUARDIAN_RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  PARENT: 'Parent',
  LEGAL_GUARDIAN: 'Legal Guardian',
};

/** The relationship, or null when it is not one we offer. */
export function asGuardianRelationship(value: unknown): GuardianRelationship | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return (GUARDIAN_RELATIONSHIPS as readonly string[]).includes(upper)
    ? (upper as GuardianRelationship)
    : null;
}

/**
 * A sample of the answer, so uppercase like the stored name
 * (lib/text-case.ts). The relationship's placeholder is an instruction instead,
 * and stays sentence case.
 */
export const GUARDIAN_NAME_PLACEHOLDER = 'MARIA DELA CRUZ';
export const GUARDIAN_RELATIONSHIP_PLACEHOLDER = 'Select relationship';

/**
 * The sentence the guardian ticks. It names the child, so the tick is consent
 * for this runner rather than for "the minor" in general — which matters on an
 * order that carries two children.
 */
export function guardianConsentSentence(childName: string): string {
  const name = childName.replace(/\s+/g, ' ').trim() || 'this runner';
  return `I am the parent or legal guardian of ${name} and I consent to their participation in this event, including the Disclaimer, Consent & Data Privacy Waiver on their behalf.`;
}

/** The three answers a runner who needs consent owes, in form order. */
export const GUARDIAN_FIELDS = [
  'guardianName',
  'guardianRelationship',
  'guardianConsent',
] as const;

export type GuardianField = (typeof GUARDIAN_FIELDS)[number];

/** Each phrased as the fix, shared by the wizards and the routes. */
export const GUARDIAN_FIELD_MESSAGES: Record<GuardianField, string> = {
  guardianName: "Enter the parent or guardian's full name",
  guardianRelationship: 'Select a relationship',
  guardianConsent: 'The parent or guardian must agree for this runner',
};

type GuardianAnswers = {
  birthdate?: unknown;
  guardianName?: unknown;
  guardianRelationship?: unknown;
  guardianConsent?: unknown;
};

/**
 * What this runner still owes for guardian consent on a race held on
 * `raceDay` — empty when they do not need it at all.
 */
export function guardianErrors(
  participant: GuardianAnswers | null | undefined,
  raceDay: unknown,
): Partial<Record<GuardianField, string>> {
  const birthdate = participant?.birthdate;
  if (
    typeof birthdate !== 'string' ||
    typeof raceDay !== 'string' ||
    !needsGuardianConsent(birthdate.trim(), raceDay)
  ) {
    return {};
  }

  const errors: Partial<Record<GuardianField, string>> = {};
  const name = participant?.guardianName;
  if (typeof name !== 'string' || name.trim() === '') {
    errors.guardianName = GUARDIAN_FIELD_MESSAGES.guardianName;
  }
  if (!asGuardianRelationship(participant?.guardianRelationship)) {
    errors.guardianRelationship = GUARDIAN_FIELD_MESSAGES.guardianRelationship;
  }
  if (participant?.guardianConsent !== true) {
    errors.guardianConsent = GUARDIAN_FIELD_MESSAGES.guardianConsent;
  }
  return errors;
}

/**
 * The checkout routes' door for guardian consent, like
 * `participantBirthdateError`: the first gap on the first runner who needs
 * consent, named by number when the order has more than one runner.
 */
export function participantGuardianError(
  participants: unknown,
  raceDay: unknown,
): string | undefined {
  if (!Array.isArray(participants)) return undefined;

  for (const [index, participant] of participants.entries()) {
    const errors = guardianErrors(participant as GuardianAnswers | null, raceDay);
    const problem = GUARDIAN_FIELDS.map((field) => errors[field]).find(Boolean);
    if (!problem) continue;

    if (participants.length === 1) return problem;
    return `Runner ${index + 1}: ${problem[0].toLowerCase()}${problem.slice(1)}`;
  }
  return undefined;
}

/**
 * The three `Runner` columns as a checkout route writes them. A runner who
 * does not need consent gets nulls even if the client sent answers, and the
 * timestamp is always the server's. Call only after
 * `participantGuardianError` has passed.
 */
export function storedGuardianConsent(
  participant: GuardianAnswers | null | undefined,
  raceDay: unknown,
  now: Date = new Date(),
): {
  guardianName: string | null;
  guardianRelationship: GuardianRelationship | null;
  guardianConsentAt: Date | null;
} {
  const birthdate = participant?.birthdate;
  const needed =
    typeof birthdate === 'string' &&
    typeof raceDay === 'string' &&
    needsGuardianConsent(birthdate.trim(), raceDay);

  if (!needed) {
    return { guardianName: null, guardianRelationship: null, guardianConsentAt: null };
  }

  return {
    guardianName: optionalUpperCaseForStorage(participant?.guardianName),
    guardianRelationship: asGuardianRelationship(participant?.guardianRelationship),
    guardianConsentAt: now,
  };
}

// ---------------------------------------------------------------------------
// What organizers read (GUARDIAN_CONSENT_PLAN.md, Batch 4)
// ---------------------------------------------------------------------------

/**
 * "MARIA DELA CRUZ (Parent)" — the guardian as one line, the way the
 * registrant detail, the printable consent and both registration emails show
 * them. Null when no name is on file, so a caller can say that instead of
 * printing an empty pair of brackets. An unrecognised relationship (a value
 * written before `asGuardianRelationship` guarded the column) drops the
 * brackets rather than showing a raw code.
 */
export function guardianLine(
  name: string | null | undefined,
  relationship: string | null | undefined,
): string | null {
  const who = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : '';
  if (!who) return null;
  const known = asGuardianRelationship(relationship);
  return known ? `${who} (${GUARDIAN_RELATIONSHIP_LABELS[known]})` : who;
}
