import type { ApplicationField } from '@/lib/organizer-application';

/**
 * The application's three steps, which fields each one owns, and the shape of
 * what the form holds while it is being filled in.
 *
 * A step only refuses its own fields (`STEP_FIELDS`), so this list is what
 * decides which panel a refusal is drawn on and which step a failed submit
 * sends the applicant back to.
 */

/* ───────────────────────────── The heading ────────────────────────────── */

/** The form's title (SERVICE_INQUIRY_PLAN.md O2), read by the page heading and
 *  by `page.tsx`'s metadata. An inquiry for a service, never a partnership. */
export const FORM_TITLE = 'Inquire About Our Services';

export const FORM_SUBTITLE =
  'Online registration, results and e-certificates, race timing, bibs and race kits. Tell us what your race needs and we will get back to you.';

/* ───────────────────────────── The steps ──────────────────────────────── */

export const STEPS = [
  {
    /** What the rail calls it — short enough for three to sit across 640px. */
    rail: 'Organization',
    title: 'Your organization',
    blurb:
      'The name your races are run under, and where to find you. This is what the Run As One team reads first.',
  },
  {
    rail: 'Contact',
    title: 'You and how to reach you',
    blurb:
      'Who we talk to, and where. There is no password to choose: we reply by email or phone.',
  },
  {
    rail: 'Your events',
    title: 'What you need',
    blurb:
      'The services you need from us, and the event they are for. Everything here is optional except the first question.',
  },
] as const;

/** Which fields each step is responsible for, so a step only refuses its own. */
export const STEP_FIELDS: readonly (readonly ApplicationField[])[] = [
  ['name', 'orgType', 'city', 'province', 'website', 'experience'],
  [
    'contactFirstName',
    'contactLastName',
    'contactRole',
    'email',
    'phone',
  ],
  [
    'services',
    'firstEventName',
    'firstEventDate',
    'firstEventLocation',
    'expectedRunners',
    'applicationNote',
    'consent',
  ],
];

/** Form order, so the caret lands on the first thing that is wrong rather than
 *  on whichever key the object happens to iterate first. */
export const FIELD_ID: Record<ApplicationField, string> = {
  name: 'apply-name',
  orgType: 'apply-org-type',
  city: 'apply-city',
  province: 'apply-province',
  website: 'apply-website',
  experience: 'apply-experience',
  contactFirstName: 'apply-first-name',
  contactLastName: 'apply-last-name',
  contactRole: 'apply-role',
  email: 'apply-email',
  phone: 'apply-phone',
  services: 'apply-services',
  firstEventName: 'apply-event-name',
  firstEventDate: 'apply-event-date',
  firstEventLocation: 'apply-event-location',
  expectedRunners: 'apply-expected-runners',
  applicationNote: 'apply-note',
  consent: 'apply-consent',
};

/** What the form holds. Every value is a string but `services` and `consent`,
 *  because that is what the controls hand back. */
export interface FormState {
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
  /** E.164, as PhoneField hands it over — the country is part of the value. */
  phone: string;
  services: string[];
  firstEventName: string;
  firstEventDate: string;
  firstEventLocation: string;
  expectedRunners: string;
  applicationNote: string;
  consent: boolean;
}

export const EMPTY: FormState = {
  name: '',
  orgType: '',
  city: '',
  province: '',
  website: '',
  experience: '',
  contactFirstName: '',
  contactLastName: '',
  contactRole: '',
  email: '',
  phone: '',
  services: [],
  firstEventName: '',
  firstEventDate: '',
  firstEventLocation: '',
  expectedRunners: '',
  applicationNote: '',
  consent: false,
};

/** How a step's fields write back to the form. */
export type SetField = <K extends keyof FormState>(key: K, value: FormState[K]) => void;
