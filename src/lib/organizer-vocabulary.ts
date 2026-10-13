/**
 * The closed answers an organizer application chooses from, and what each is
 * called.
 *
 * Four vocabularies — what kind of organizer, how many races before, which
 * services, how big the race — each with the copy the form shows and the label
 * a screen reads back. They sit apart from `organizer-application.ts`, which
 * owns the rules (the limits and `readOrganizerApplication`), so a change to
 * the choices on offer lands here and a change to what the app refuses lands
 * there. The form at `/admin/register`, the `auth/register` route and
 * `/admin/clients` all read both, so none of the three can drift from the
 * others.
 */

/* ────────────────────────── The closed vocabularies ───────────────────── */

/** What kind of outfit an applicant is. */
export const ORGANIZER_TYPES = [
  'RUNNING_CLUB',
  'EVENT_ORGANIZER',
  'CORPORATE',
  'SCHOOL',
  'LGU',
  'NONPROFIT',
  'INDIVIDUAL',
] as const;

export type OrganizerType = (typeof ORGANIZER_TYPES)[number];

/**
 * How each type is put to the person choosing it.
 *
 * Written the way this market describes itself — "LGU", "Running Club" — not
 * in the abstractions a CRM would use. A Filipino race director should find
 * their own answer on the first read.
 */
export const ORGANIZER_TYPE_COPY: Record<OrganizerType, { label: string; hint: string }> = {
  RUNNING_CLUB: {
    label: 'Running Club or Community',
    hint: 'A club that organizes runs for its own members and guests',
  },
  EVENT_ORGANIZER: {
    label: 'Event Organizer or Production Company',
    hint: 'Races are what you do for a living',
  },
  CORPORATE: {
    label: 'Company or Brand',
    hint: 'A corporate fun run, a brand activation, an anniversary race',
  },
  SCHOOL: {
    label: 'School or University',
    hint: 'A student council, an athletics office, an alumni association',
  },
  LGU: {
    label: 'LGU or Government Office',
    hint: 'A city, municipal or provincial event',
  },
  NONPROFIT: {
    label: 'Non-profit or Foundation',
    hint: 'A charity run or a fundraising event',
  },
  INDIVIDUAL: {
    label: 'Individual Organizer',
    hint: 'You are organizing this yourself, under your own name',
  },
};

/** How many races the applicant has put on before. */
export const ORGANIZER_EXPERIENCE = [
  'FIRST',
  'ONE_TO_TWO',
  'THREE_TO_FIVE',
  'SIX_TO_TEN',
  'OVER_TEN',
] as const;

export type OrganizerExperience = (typeof ORGANIZER_EXPERIENCE)[number];

/**
 * The bands, in the applicant's own voice.
 *
 * "This will be our first" is deliberately the first option and is not treated
 * as a worse answer anywhere: every organizer on this platform had a first
 * race, and an application form that makes a beginner feel refused before they
 * have been read is one that hands them to somebody else's platform.
 */
export const ORGANIZER_EXPERIENCE_LABEL: Record<OrganizerExperience, string> = {
  FIRST: 'This will be our first event',
  ONE_TO_TWO: '1 to 2 events',
  THREE_TO_FIVE: '3 to 5 events',
  SIX_TO_TEN: '6 to 10 events',
  OVER_TEN: 'More than 10 events',
};

/**
 * What the applicant came here for, in as few answers as possible.
 *
 * This list was six options long and read like a feature matrix — online
 * registration, payment collection, race kit logistics, results, certificates,
 * promo codes. That is how the product is *built*, not how an organizer thinks
 * about it: payments, race kits and promo codes are not things anybody can
 * decline, they arrive with the registration system, so asking about them
 * separately made an organizer stop and work out which boxes were really one
 * box. An application form is not the place to teach somebody our
 * architecture.
 *
 * So there are two service lines, named the way a race director would name
 * them, and each hint lists what comes inside rather than offering it as a
 * separate tick. There is a third answer because "I do not know yet" is the
 * honest one for a first-time organizer, and a form that will not accept it
 * gets a guess instead — which tells Run As One's staff less than the truth
 * would have.
 *
 * Deliberately *not* here: a timing option. This platform imports finishing
 * times, it does not time a race, and an option on this form is a promise the
 * approval email has to keep.
 */
export const ORGANIZER_SERVICES = ['REGISTRATION', 'RESULTS', 'NOT_SURE'] as const;

export type OrganizerService = (typeof ORGANIZER_SERVICES)[number];

export const ORGANIZER_SERVICE_COPY: Record<
  OrganizerService,
  { label: string; hint: string }
> = {
  REGISTRATION: {
    label: 'Registration System',
    hint: 'Your sign-up page, the payments, race kit pickup and delivery, and promo codes — these all come together.',
  },
  RESULTS: {
    label: 'Results and E-Certificates',
    hint: 'Finishing times, a leaderboard for every category, and finisher certificates runners download themselves.',
  },
  NOT_SURE: {
    label: 'Not Sure Yet',
    hint: 'Tell us about your event below and we will walk you through what fits.',
  },
};

/**
 * The answer that cannot share the question with another.
 *
 * "Not sure yet" beside a ticked service line says two opposite things, so
 * choosing one clears the other. It is named here rather than in the page
 * because the route enforces it too — a body arriving with both is one the
 * reader on /admin/clients would be left to interpret.
 */
export const EXCLUSIVE_SERVICE: OrganizerService = 'NOT_SURE';

/** How big the applicant expects their race to be. */
export const EXPECTED_PARTICIPANTS = [
  'UNDER_100',
  'FROM_100_TO_300',
  'FROM_300_TO_500',
  'FROM_500_TO_1000',
  'OVER_1000',
] as const;

export type ExpectedParticipants = (typeof EXPECTED_PARTICIPANTS)[number];

export const EXPECTED_PARTICIPANTS_LABEL: Record<ExpectedParticipants, string> = {
  UNDER_100: 'Under 100 runners',
  FROM_100_TO_300: '100 to 300 runners',
  FROM_300_TO_500: '300 to 500 runners',
  FROM_500_TO_1000: '500 to 1,000 runners',
  OVER_1000: 'More than 1,000 runners',
};

/* ─────────────────────────────── Readers ──────────────────────────────── */

/** A value from one of the lists above, or empty when it is not one of them. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | '' {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (allowed as readonly string[]).includes(upper) ? (upper as T) : '';
}

/** The chosen services, deduplicated and stripped of anything we do not offer. */
export function servicesOf(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const kept = new Set<string>();
  for (const entry of raw) {
    const known = oneOf(entry, ORGANIZER_SERVICES);
    if (known) kept.add(known);
  }
  // "Not sure yet" wins alone. A body carrying it alongside a service line is
  // contradicting itself, and staff should not have to guess which
  // half the applicant meant.
  if (kept.has(EXCLUSIVE_SERVICE) && kept.size > 1) {
    return [EXCLUSIVE_SERVICE];
  }
  // Written back in the order this module lists them rather than the order the
  // boxes happened to be ticked, so two applications read the same way.
  return ORGANIZER_SERVICES.filter((service) => kept.has(service));
}

/* ────────────────────── Reading one back on a screen ──────────────────── */

/**
 * What a stored value is called, for a screen showing an application back.
 *
 * Falls back to the stored text rather than to nothing, so a row written
 * before an option was renamed still reads as itself — the same rule
 * `feedbackKindLabel` follows, and for the same reason.
 */
export function organizerTypeLabel(value: string | null | undefined): string {
  const known = oneOf(value, ORGANIZER_TYPES);
  return known ? ORGANIZER_TYPE_COPY[known].label : (value ?? '');
}

export function organizerExperienceLabel(value: string | null | undefined): string {
  const known = oneOf(value, ORGANIZER_EXPERIENCE);
  return known ? ORGANIZER_EXPERIENCE_LABEL[known] : (value ?? '');
}

export function organizerServiceLabel(value: string): string {
  const known = oneOf(value, ORGANIZER_SERVICES);
  return known ? ORGANIZER_SERVICE_COPY[known].label : value;
}

export function expectedParticipantsLabel(value: string | null | undefined): string {
  const known = oneOf(value, EXPECTED_PARTICIPANTS);
  return known ? EXPECTED_PARTICIPANTS_LABEL[known] : (value ?? '');
}
