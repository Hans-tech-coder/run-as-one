/**
 * **What the Contact Us form (`/contact`) accepts**, read the same way by the
 * form and by `/api/contact`, so a message the form lets through is never
 * refused by the route for a rule the sender was not shown.
 *
 * There is no table behind it. Each inquiry is one email to the site's contact
 * address (info@runasone.ph today) and that email is the record: staff answer
 * by pressing Reply, which reaches the sender through `replyTo`. Storing a copy
 * would spend Neon's free-tier storage on something the inbox already keeps.
 *
 * Every refusal names the field it is about (§8 rule 4): the route returns the
 * field's key with it so the form can put the caret in the right box.
 *
 * Client-safe: no database, no Resend. The email itself is email-contact.ts.
 */

import { emailAddressError, normalizeEmailAddress } from './email-address';
import { parseE164, phoneNumberError, DEFAULT_COUNTRY } from './phone';

/** What a message can be about, in the order the select lists them. */
export const CONTACT_TOPICS = [
  'REGISTRATION',
  'PAYMENT',
  'KIT',
  'RESULTS',
  'ORGANIZING',
  'OTHER',
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number];

/** How each topic reads in the select and in the email's subject. */
export const CONTACT_TOPIC_LABEL: Record<ContactTopic, string> = {
  REGISTRATION: 'Registration',
  PAYMENT: 'Payment',
  KIT: 'Race Kit and Delivery',
  RESULTS: 'Results and E-Certificate',
  ORGANIZING: 'Organizing a Race',
  OTHER: 'Other',
};

export function asContactTopic(value: unknown): ContactTopic | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return (CONTACT_TOPICS as readonly string[]).includes(upper) ? (upper as ContactTopic) : null;
}

/**
 * The limits, named once. The message floor keeps "hi" out of the inbox; the
 * ceiling is room for a full account of a payment that went wrong, and what
 * keeps a single email bounded.
 */
export const MIN_CONTACT_MESSAGE = 20;
export const MAX_CONTACT_MESSAGE = 3_000;
export const MAX_CONTACT_NAME = 80;
export const MAX_CONTACT_EMAIL = 120;
/** A slug is far shorter; anything longer is not one of ours. */
export const MAX_CONTACT_RACE = 120;

/**
 * The honeypot's field name. A person never sees the box (it is off-screen
 * and out of the tab order); a form-filling script fills every input it finds.
 * Named like a real field so the script does not skip it.
 */
export const CONTACT_HONEYPOT = 'website';

export type ContactField = 'name' | 'email' | 'phone' | 'topic' | 'race' | 'message';

/** Form order, so the caret lands on the first thing that is wrong. */
export const CONTACT_FIELD_ORDER: ContactField[] = ['name', 'email', 'phone', 'topic', 'race', 'message'];

export interface ContactInput {
  name: string;
  email: string;
  /** E.164, or '' when left blank. */
  phone: string;
  topic: ContactTopic | '';
  /** An event slug, or '' for none. */
  race: string;
  message: string;
}

/**
 * Text that may end up in a mail header (the subject carries the name): every
 * control character, line breaks first, becomes a space. A name with a CR/LF
 * in it is the classic way to smuggle a second header into a message.
 */
export function oneLine(value: string): string {
  return value.replace(HEADER_BREAKS, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** C0 controls, DEL, and the two Unicode line separators. */
const HEADER_BREAKS = new RegExp('[\u0000-\u001f\u007f\u2028\u2029]+', 'g');

/** Whether the phone box holds any digits at all; a lone country code is blank. */
export function hasPhoneDigits(value: string): boolean {
  return !!parseE164(value).national;
}

/** The input as the route stores it: trimmed, the name on one line. */
export function cleanContactInput(raw: Partial<Record<keyof ContactInput, unknown>>): ContactInput {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const phone = text(raw.phone).trim();
  return {
    name: oneLine(text(raw.name)),
    email: normalizeEmailAddress(raw.email),
    phone: hasPhoneDigits(phone) ? phone : '',
    topic: asContactTopic(raw.topic) ?? '',
    race: text(raw.race).trim(),
    message: text(raw.message).replace(/\r\n?/g, '\n').trim(),
  };
}

/**
 * What is wrong with each field, by key; empty when the message can go.
 * Whether a chosen race is one this site lists is the route's check, since
 * only it holds the list; here a race is only held to its length.
 */
export function contactInputErrors(input: ContactInput): Partial<Record<ContactField, string>> {
  const errors: Partial<Record<ContactField, string>> = {};

  if (!input.name) errors.name = 'Enter your name, so we know who we are writing back to.';
  else if (input.name.length > MAX_CONTACT_NAME) {
    errors.name = `Your name is longer than ${MAX_CONTACT_NAME} characters. Shorten it a little.`;
  }

  if (input.email.length > MAX_CONTACT_EMAIL) {
    errors.email = `That email address is longer than ${MAX_CONTACT_EMAIL} characters.`;
  } else {
    const emailError = emailAddressError(input.email, {
      blank: 'Enter your email address. It is where our reply goes.',
    });
    if (emailError) errors.email = emailError;
  }

  if (input.phone) {
    const phoneError = phoneNumberError(input.phone, DEFAULT_COUNTRY);
    if (phoneError) errors.phone = `${phoneError} Or leave it blank — it is optional.`;
  }

  if (!input.topic) errors.topic = 'Choose what your message is about.';

  if (input.race.length > MAX_CONTACT_RACE) errors.race = 'Choose a race from the list, or leave it blank.';

  const length = input.message.length;
  if (!length) errors.message = 'Write your message — the box is empty.';
  else if (length < MIN_CONTACT_MESSAGE) {
    const shortBy = MIN_CONTACT_MESSAGE - length;
    errors.message = `Add a little more detail — ${shortBy} more character${shortBy === 1 ? '' : 's'}.`;
  } else if (length > MAX_CONTACT_MESSAGE) {
    errors.message = `Your message is ${length - MAX_CONTACT_MESSAGE} characters over the ${MAX_CONTACT_MESSAGE.toLocaleString()} limit.`;
  }

  return errors;
}
