/**
 * What an organizer application is, and what the app will accept as one.
 *
 * Three surfaces have to agree about this: the form at `/admin/register` that
 * a prospective organizer fills in, the `auth/register` route that writes the
 * `Client` submission, and `/admin/clients`, where Run As One staff read it
 * back before sending an invite. Putting the limits and the rules here, and the
 * vocabulary beside them in `organizer-vocabulary.ts`, means a question added
 * later shows up in all three rather than in whichever one somebody remembered
 * — the same reason `lib/feedback.ts` exists.
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
import { phoneNumberError, toE164 } from './phone';
import {
  EXPECTED_PARTICIPANTS,
  ORGANIZER_EXPERIENCE,
  ORGANIZER_TYPES,
  oneOf,
  servicesOf,
  type OrganizerService,
} from './organizer-vocabulary';

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
    errors.email = 'Enter the email address we should reply to.';
  } else if (email.length > MAX_EMAIL) {
    errors.email = `That address is longer than ${MAX_EMAIL} characters.`;
  } else if (!looksLikeEmailAddress(email)) {
    errors.email = 'That does not look like an email address.';
  }

  // Required, unlike the website: this is the number somebody rings when a
  // payment has to be confirmed on race morning and email is too slow. What
  // counts as a number that dials is phone.ts's call (phoneNumberError), shared
  // with the dashboard's own profile form.
  if (!textOf(input.phone)) {
    errors.phone = 'Enter a mobile number we can reach you on.';
  } else {
    const phoneError = phoneNumberError(phone, APPLICATION_PHONE_COUNTRY);
    if (phoneError) errors.phone = phoneError;
  }

  /* Step 3 — what they want to run. */

  if (services.length === 0) {
    errors.services = 'Choose at least one service, or Not Sure Yet.';
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

/* ───────────────────────── After it is sent ───────────────────────────── */

/**
 * Whether an application leads to a sign-in (SERVICE_INQUIRY_PLAN.md S5).
 *
 * A sign-in is a *Client Viewer*: a view of the race's registrations and
 * results, which only exists once Run As One runs the race's registration. So
 * it follows Online Registration and nothing else; an inquiry for timing,
 * bibs or results alone needs none. The thank-you panel reads this to say
 * what happens next, and `/admin/clients` reads it beside Send invite, so the
 * applicant and staff are told the same thing. Send invite still works either
 * way: this says what is needed, not what is allowed.
 */
export function signInComing(services: readonly string[] | null | undefined): boolean {
  return (services ?? []).includes(SIGN_IN_SERVICE);
}

const SIGN_IN_SERVICE: OrganizerService = 'REGISTRATION';

/**
 * The refusal for a second application from the same address (S3).
 *
 * One application per email stays; the way to add to it is to reach Run As
 * One directly. The route sends this exact text under `email`, and the form
 * recognizes it by that text to draw the contact address and the social links
 * beneath it (they are settings, so the words cannot carry them).
 */
export const ALREADY_APPLIED_MESSAGE =
  'We already have your application from this address, so there is no need to send another. For anything new, email or message Run As One instead.';
