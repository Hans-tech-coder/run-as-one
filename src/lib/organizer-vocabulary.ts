/**
 * The closed answers an organizer application chooses from, and what each is
 * called.
 *
 * Four vocabularies — what kind of organizer, how many races before, which
 * services (offered, or shown as Coming soon), how big the race — each with the copy the form shows and the label
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
 * What the applicant came here for: every service Run As One sells, not only
 * the ones this app runs.
 *
 * Two groups are offered (`SERVICE_INQUIRY_PLAN.md` S1). **Online** is what
 * this app does: the registration system (whose hint names the payments and
 * promo codes that arrive with it; they are not separately declinable, so they
 * are not separate ticks) and results. **Race day** is timing, bibs and kit
 * fulfilment, which staff fulfil through suppliers they know (S2). An
 * applicant ticking one is making an inquiry, not an order, so no hint here
 * names a price or a date.
 *
 * "Not Sure Yet" is the third kind of answer, because "I do not know yet" is
 * the honest one for a first-time organizer, and a form that will not accept
 * it gets a guess instead.
 *
 * The Coming soon services are listed apart, in `COMING_SOON_SERVICES`: the
 * form shows them greyed and they cannot be ticked (O1), so `servicesOf` never
 * keeps one. Moving a code from that list into this one is how a service goes
 * on offer.
 *
 * Existing codes keep their values, so every stored application still reads
 * the same. `Client.services` is a `String[]`, so a new code needs no
 * migration.
 */
export const ORGANIZER_SERVICES = [
  'REGISTRATION',
  'RESULTS',
  'TIMING',
  'BIB_PRODUCTION',
  'KIT_FULFILLMENT',
  'NOT_SURE',
] as const;

export type OrganizerService = (typeof ORGANIZER_SERVICES)[number];

/** Services shown on the form as Coming soon. Labelled for display, never
 *  accepted: the route drops them like any unknown value. */
export const COMING_SOON_SERVICES = [
  'WEBSITE',
  'KIT_CLAIMING',
  'EMAIL_BLAST',
  'CHIP_CHECK',
] as const;

export type ComingSoonService = (typeof COMING_SOON_SERVICES)[number];

/** The groups the services question and the staff panel read them in.
 *  "Not Sure Yet" belongs to none. */
export type ServiceGroup = 'ONLINE' | 'RACE_DAY' | 'COMING_SOON';

export const SERVICE_GROUP_LABEL: Record<ServiceGroup, string> = {
  ONLINE: 'Online',
  RACE_DAY: 'Race day',
  COMING_SOON: 'Coming soon',
};

export const ORGANIZER_SERVICE_COPY: Record<
  OrganizerService | ComingSoonService,
  { label: string; hint: string; group: ServiceGroup | null }
> = {
  REGISTRATION: {
    label: 'Online Registration',
    hint: "Your race's sign-up page, with payments and promo codes included.",
    group: 'ONLINE',
  },
  RESULTS: {
    label: 'Results and E-Certificates',
    hint: 'Finishing times, a leaderboard per category, and certificates runners download.',
    group: 'ONLINE',
  },
  TIMING: {
    label: 'Race Timing',
    hint: 'Chip timing at the start and finish on race day.',
    group: 'RACE_DAY',
  },
  CHIP_CHECK: {
    label: 'Chip Check',
    hint: 'Runners scan their bib chip and see their details on a screen: a photo moment, and a check that each bib went to the right runner.',
    group: 'COMING_SOON',
  },
  BIB_PRODUCTION: {
    label: 'Race Bib Production',
    hint: "Printed bibs with your design and each runner's number.",
    group: 'RACE_DAY',
  },
  KIT_FULFILLMENT: {
    label: 'Race Kit Fulfilment',
    hint: 'Kits packed for each runner, for pickup or courier delivery.',
    group: 'RACE_DAY',
  },
  NOT_SURE: {
    label: 'Not Sure Yet',
    hint: 'Tell us about your event below and we will walk you through what fits.',
    group: null,
  },
  WEBSITE: {
    label: 'Custom Website',
    hint: 'A website of your own for your race.',
    group: 'COMING_SOON',
  },
  KIT_CLAIMING: {
    label: 'Kit Claiming System',
    hint: "A QR code in each runner's email, scanned when they claim their kit.",
    group: 'COMING_SOON',
  },
  EMAIL_BLAST: {
    label: 'Email Blast',
    hint: 'Announcements emailed to everyone registered for your race.',
    group: 'COMING_SOON',
  },
};

/** The services of one group, offered or Coming soon, in the order this
 *  module lists them. */
export function servicesInGroup(group: ServiceGroup): readonly (OrganizerService | ComingSoonService)[] {
  const all = [...ORGANIZER_SERVICES, ...COMING_SOON_SERVICES];
  return all.filter((service) => ORGANIZER_SERVICE_COPY[service].group === group);
}

/**
 * The answer that cannot share the question with another.
 *
 * "Not sure yet" beside a ticked service says two opposite things, so
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

/** The chosen services, deduplicated and stripped of anything we do not offer:
 *  an unknown code and a Coming soon one are dropped alike. */
export function servicesOf(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const kept = new Set<string>();
  for (const entry of raw) {
    const known = oneOf(entry, ORGANIZER_SERVICES);
    if (known) kept.add(known);
  }
  // "Not sure yet" wins alone. A body carrying it alongside a service is
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
  const known = oneOf(value, ORGANIZER_SERVICES) || oneOf(value, COMING_SOON_SERVICES);
  return known ? ORGANIZER_SERVICE_COPY[known].label : value;
}

export function expectedParticipantsLabel(value: string | null | undefined): string {
  const known = oneOf(value, EXPECTED_PARTICIPANTS);
  return known ? EXPECTED_PARTICIPANTS_LABEL[known] : (value ?? '');
}
