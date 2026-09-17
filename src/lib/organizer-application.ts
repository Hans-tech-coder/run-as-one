/**
 * What an organizer application is, and what the app will accept as one.
 *
 * Three surfaces have to agree about this: the form at `/admin/register` that
 * a prospective organizer fills in, the `auth/register` route that writes the
 * `Client` submission, and `/admin/clients`, where Run As One staff read it
 * back before sending an invite. Putting the vocabulary, the limits and the rules here
 * means a question added later shows up in all three rather than in whichever
 * one somebody remembered — the same reason `lib/feedback.ts` exists.
 *
 * **Why the form asks so much at all.** Approving an organizer is not a
 * formality: an approved account can publish a public race, take a runner's
 * money, and email every person who signs up. The old form asked for a name,
 * an address and a password, which is everything a stranger needs to look like
 * an organizer and nothing the owner needs to tell whether they are one. Each
 * question below exists because it changes an approval decision — who the
 * human is, whether the organization can be found outside this form, what they
 * have run before, and what they are about to run.
 *
 * **Nothing here is a hard gate on the applicant.** The only fields this
 * module refuses are the ones an account cannot exist without, plus the few
 * whose shape it can check (an address, a number, a date). Everything else is
 * asked for and accepted as given: a form that rejects a real organizer over a
 * missing website has cost a paying client to catch a fraud it would not have
 * caught anyway. The gate is staff deciding to send an invite, not the form.
 */

import { looksLikeEmailAddress } from './email-address';
import {
  countryFor,
  expectedNationalDigits,
  isPlausiblePhone,
  parseE164,
  toE164,
} from './phone';

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

/* ──────────────────────────────── Limits ──────────────────────────────── */

export const MAX_ORG_NAME = 120;
export const MAX_PERSON_NAME = 60;
export const MAX_CONTACT_ROLE = 60;
export const MAX_PLACE = 80;
export const MAX_WEBSITE = 200;
export const MAX_EVENT_NAME = 120;
export const MAX_EVENT_LOCATION = 160;
export const MAX_APPLICATION_NOTE = 1_000;
export const MAX_EMAIL = 120;

/** Where the phone field starts, and what a bare national number is read
 *  against. The organizer can pick another country in the field itself. */
export const APPLICATION_PHONE_COUNTRY = 'PH';

/* ─────────────────────────── The shape of one ─────────────────────────── */

/** Every field the form asks for, in the order it asks. */
export const APPLICATION_FIELDS = [
  'name',
  'orgType',
  'city',
  'province',
  'website',
  'experience',
  'contactFirstName',
  'contactLastName',
  'contactRole',
  'email',
  'phone',
  'services',
  'firstEventName',
  'firstEventDate',
  'firstEventLocation',
  'expectedRunners',
  'applicationNote',
  'consent',
] as const;

export type ApplicationField = (typeof APPLICATION_FIELDS)[number];

/** What a validated application carries, ready to be written. */
export interface OrganizerApplication {
  name: string;
  orgType: string;
  city: string;
  province: string;
  website: string;
  experience: string;
  contactFirstName: string;
  contactLastName: string;
  contactRole: string;
  email: string;
  /** E.164, or empty when the applicant gave no number. */
  phone: string;
  services: string[];
  firstEventName: string;
  firstEventDate: string;
  firstEventLocation: string;
  expectedRunners: string;
  applicationNote: string;
}

export type ApplicationErrors = Partial<Record<ApplicationField, string>>;

/** Whatever arrived — a form's own state, or a JSON body off the wire. */
export type ApplicationInput = Partial<Record<ApplicationField, unknown>>;

/* ───────────────────────────── Small readers ──────────────────────────── */

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | '' {
  const upper = textOf(value).toUpperCase();
  return (allowed as readonly string[]).includes(upper) ? (upper as T) : '';
}

/** The chosen services, deduplicated and stripped of anything we do not offer. */
function servicesOf(value: unknown): string[] {
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

/**
 * Whatever arrived, as E.164.
 *
 * The form uses the runner wizard's own `PhoneField` — flag, dial code and all
 * — so an organizer meets the same phone box a runner does rather than a
 * second one built for this page alone, and what that control hands over is
 * already E.164. It passes straight through. Bare digits (an API caller
 * sending the national part on its own) are read against the default country
 * instead.
 */
export function phoneOf(value: unknown): string {
  const raw = textOf(value);
  if (!raw) return '';
  if (raw.startsWith('+')) return raw.replace(/[^\d+]/g, '');
  return toE164(APPLICATION_PHONE_COUNTRY, raw);
}

/**
 * Whether a link is one a browser could actually open.
 *
 * Deliberately shallow, and deliberately forgiving of a missing scheme: this
 * market types "facebook.com/sunriserunners", and refusing that in favour of
 * "https://" is a rejection of the right answer on a technicality. What it
 * does refuse is a string with no dot in it, which is somebody who has typed
 * their page's name rather than its address.
 */
export function looksLikeLink(value: string): boolean {
  const raw = value.trim();
  if (!raw || /\s/.test(raw)) return false;
  const withoutScheme = raw.replace(/^https?:\/\//i, '');
  if (!withoutScheme.includes('.')) return false;
  return /^[^./]+(\.[^./\s]+)+(\/.*)?$/i.test(withoutScheme);
}

/** A link stored with the scheme it will be opened with. */
export function normalizeLink(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/** Whether a string is a calendar day this app can compare (`Event.date`'s shape). */
export function looksLikeDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
}

/* ───────────────────────────── The rules ──────────────────────────────── */

/**
 * Read an application, and say what is wrong with it.
 *
 * Both sides of the wire call this: the form calls it on every step change so
 * the common case never costs a round trip, and the route calls it again
 * because a tab left open can post straight at it. The route additionally
 * refuses an address either account table already holds, which is the one rule
 * this module cannot check because it needs the database, and refuses an address
a client submission already holds.
 *
 * There is no password on it any more (ADMIN_MERGE_PLAN.md, Batch 3): an
 * application becomes a `Client` submission, and the person behind it chooses
 * a password only when Run As One staff send an invite.
 */
export function readOrganizerApplication(input: ApplicationInput): {
  values: OrganizerApplication;
  errors: ApplicationErrors;
} {
  const errors: ApplicationErrors = {};

  const name = textOf(input.name);
  const orgType = oneOf(input.orgType, ORGANIZER_TYPES);
  const city = textOf(input.city);
  const province = textOf(input.province);
  const websiteRaw = textOf(input.website);
  const experience = oneOf(input.experience, ORGANIZER_EXPERIENCE);
  const contactFirstName = textOf(input.contactFirstName);
  const contactLastName = textOf(input.contactLastName);
  const contactRole = textOf(input.contactRole);
  const email = textOf(input.email).toLowerCase();
  const phone = phoneOf(input.phone);
  const services = servicesOf(input.services);
  const firstEventName = textOf(input.firstEventName);
  const firstEventDate = textOf(input.firstEventDate);
  const firstEventLocation = textOf(input.firstEventLocation);
  const expectedRunners = oneOf(input.expectedRunners, EXPECTED_PARTICIPANTS);
  const applicationNote = textOf(input.applicationNote);

  /* Step 1 — the organization. */

  if (!name) {
    errors.name = 'Enter the name your events are organized under.';
  } else if (name.length > MAX_ORG_NAME) {
    errors.name = `That name is longer than ${MAX_ORG_NAME} characters.`;
  }

  if (!orgType) errors.orgType = 'Choose what kind of organizer you are.';

  if (!city) {
    errors.city = 'Enter the city or municipality you are based in.';
  } else if (city.length > MAX_PLACE) {
    errors.city = `That is longer than ${MAX_PLACE} characters.`;
  }

  if (!province) {
    errors.province = 'Enter the province you are based in.';
  } else if (province.length > MAX_PLACE) {
    errors.province = `That is longer than ${MAX_PLACE} characters.`;
  }

  // Optional, because a club whose whole presence is a private group chat is
  // still a real club — but a link that cannot be opened helps nobody, so a
  // typed one has to be a link.
  if (websiteRaw && !looksLikeLink(websiteRaw)) {
    errors.website =
      'That does not look like a web address. Paste the full link, like facebook.com/yourpage.';
  } else if (websiteRaw.length > MAX_WEBSITE) {
    errors.website = `That link is longer than ${MAX_WEBSITE} characters.`;
  }

  if (!experience) errors.experience = 'Tell us how many events you have organized.';

  /* Step 2 — the person and the account. */

  if (!contactFirstName) {
    errors.contactFirstName = 'Enter your first name.';
  } else if (contactFirstName.length > MAX_PERSON_NAME) {
    errors.contactFirstName = `That is longer than ${MAX_PERSON_NAME} characters.`;
  }

  if (!contactLastName) {
    errors.contactLastName = 'Enter your last name.';
  } else if (contactLastName.length > MAX_PERSON_NAME) {
    errors.contactLastName = `That is longer than ${MAX_PERSON_NAME} characters.`;
  }

  if (!contactRole) {
    errors.contactRole = 'Enter your role — Race Director, Owner, Marketing Head.';
  } else if (contactRole.length > MAX_CONTACT_ROLE) {
    errors.contactRole = `That is longer than ${MAX_CONTACT_ROLE} characters.`;
  }

  if (!email) {
    errors.email = 'Enter the email address you will sign in with.';
  } else if (email.length > MAX_EMAIL) {
    errors.email = `That address is longer than ${MAX_EMAIL} characters.`;
  } else if (!looksLikeEmailAddress(email)) {
    errors.email = 'That does not look like an email address.';
  }

  // Required, unlike the website: this is the number somebody rings when a
  // payment has to be confirmed on race morning and email is too slow. Its
  // length is checked against the country the number itself names rather than
  // against the Philippines, because the field lets an organizer pick another
  // one and a rule that ignored their pick would refuse a number that dials.
  const typedPhone = textOf(input.phone);
  const parsedPhone = parseE164(phone);
  const phoneCountry = countryFor(parsedPhone.iso2 ?? APPLICATION_PHONE_COUNTRY);
  if (!typedPhone) {
    errors.phone = 'Enter a mobile number we can reach you on.';
  } else if (!parsedPhone.national) {
    errors.phone = 'Enter your mobile number in digits, like 9171234567.';
  } else if (!isPlausiblePhone(phoneCountry.iso2, parsedPhone.national)) {
    const expected = expectedNationalDigits(phoneCountry.iso2);
    // The sample is a Philippine number, so it is only offered when that is
    // the country being talked about. A wrong example is worse than none.
    const example = phoneCountry.iso2 === APPLICATION_PHONE_COUNTRY ? ', like 9171234567' : '';
    errors.phone = expected
      ? `${phoneCountry.name} mobile numbers are ${expected} digits after +${phoneCountry.dial}${example}.`
      : `That does not look like a complete ${phoneCountry.name} number.`;
  }

  /* Step 3 — what they want to run. */

  if (services.length === 0) {
    errors.services = 'Choose at least one thing you need Run As One for.';
  }

  if (firstEventName.length > MAX_EVENT_NAME) {
    errors.firstEventName = `That name is longer than ${MAX_EVENT_NAME} characters.`;
  }

  // Optional, but a date that is not a date would be written straight into the
  // column `Event.date` is compared against.
  if (firstEventDate && !looksLikeDate(firstEventDate)) {
    errors.firstEventDate = 'Pick a date, or leave it blank if it is not set yet.';
  }

  if (firstEventLocation.length > MAX_EVENT_LOCATION) {
    errors.firstEventLocation = `That is longer than ${MAX_EVENT_LOCATION} characters.`;
  }

  if (applicationNote.length > MAX_APPLICATION_NOTE) {
    errors.applicationNote = `That is ${
      applicationNote.length - MAX_APPLICATION_NOTE
    } characters too long.`;
  }

  if (input.consent !== undefined && input.consent !== true) {
    errors.consent = 'Please confirm the details above are true before submitting.';
  }

  return {
    values: {
      name,
      orgType,
      city,
      province,
      website: normalizeLink(websiteRaw),
      experience,
      contactFirstName,
      contactLastName,
      contactRole,
      email,
      phone,
      services,
      firstEventName,
      firstEventDate,
      firstEventLocation,
      expectedRunners,
      applicationNote,
    },
    errors,
  };
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

/**
 * Whether a row carries an application at all.
 *
 * Every column is nullable, so the accounts that pre-date the form answer
 * none of it. A screen asks this before drawing a panel of empty rows, and
 * says "this account was created before the application form existed" instead
 * — which is the truth, and is more useful than fifteen dashes.
 */
export function hasApplicationDetails(row: {
  orgType?: string | null;
  contactFirstName?: string | null;
  phone?: string | null;
  services?: string[] | null;
}): boolean {
  return Boolean(
    row.orgType || row.contactFirstName || row.phone || (row.services?.length ?? 0) > 0,
  );
}
