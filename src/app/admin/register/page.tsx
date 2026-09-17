"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import AdminSelect from '../AdminSelect';
import AuthHomeLink from '../AuthHomeLink';
// The runner wizard's own phone control, flag and dial code and all. Reused
// rather than rebuilt so an organizer meets the same box a runner does; it
// brings its own `.input-group` label and small print, which is why it is not
// wrapped in a `.form-group` like the fields around it.
import PhoneField from '@/app/events/[slug]/register/PhoneField';
import { CONTACT_EMAIL, SUPPORT_MAILTO } from '@/lib/site-contact';
import {
  APPLICATION_PHONE_COUNTRY,
  EXPECTED_PARTICIPANTS,
  EXPECTED_PARTICIPANTS_LABEL,
  MAX_APPLICATION_NOTE,
  ORGANIZER_EXPERIENCE,
  ORGANIZER_EXPERIENCE_LABEL,
  ORGANIZER_SERVICES,
  ORGANIZER_SERVICE_COPY,
  ORGANIZER_TYPES,
  ORGANIZER_TYPE_COPY,
  EXCLUSIVE_SERVICE,
  readOrganizerApplication,
  type ApplicationErrors,
  type ApplicationField,
} from '@/lib/organizer-application';

import './../Auth.css';

/**
 * The organizer application.
 *
 * It used to be a sign-up box — a name, an address, a password — and then an
 * application a super admin approved or rejected. Since ADMIN_MERGE_PLAN.md
 * Batch 3 it is neither: **Run As One runs the races**, so what arrives here is
 * a `Client` submission with no password and no account. It waits on
 * `/admin/clients` until staff press Send invite, and the invitation is where
 * the applicant chooses a password. The questions below stay because they are
 * what Run As One needs before taking on a race — who the human is, whether
 * the organization can be found anywhere outside this form, what they have run
 * before, and what they are about to run.
 *
 * Three decisions worth keeping:
 *
 * **It is three steps, not one long page.** The same eighteen fields in one
 * column read as a wall and get abandoned; grouped as "your organization",
 * "you and how to reach you" and "what you are planning" they read as three short
 * questions, and the rail at the top says how much is left. The steps are
 * groups of related answers rather than a funnel — nothing is saved until the
 * last one, which is why the rail's dots are not buttons and Back is.
 *
 * **A step is checked before it advances, against the same module the API
 * uses.** `readOrganizerApplication` is the single set of rules
 * (lib/organizer-application.ts); this page runs it on the fields belonging to
 * the current step and the route runs it on everything, so the common case
 * never costs a round trip and a tab left open still cannot post past a rule.
 * A refusal lands on the control that caused it and the caret is moved there,
 * with a count at the top of the step for anybody who pressed Continue and saw
 * nothing appear to happen (§8 rule 4).
 *
 * **Required is the default and optional is marked.** Nine of the fields are
 * genuinely required; the rest say "Optional" beside the label. A form that
 * demands an event date from somebody who has not booked the venue yet gets a
 * made-up date, which is worse than a blank.
 */

/* ───────────────────────────── The steps ──────────────────────────────── */

const STEPS = [
  {
    /** What the rail calls it — short enough for three to sit across 640px. */
    rail: 'Organization',
    title: 'Your organization',
    blurb:
      'The name your races are run under, and where to find you. This is what the Run As One team checks first.',
  },
  {
    rail: 'Contact',
    title: 'You and how to reach you',
    blurb:
      'Who we talk to, and where. There is no password to choose yet — we set up your sign-in later, by email.',
  },
  {
    rail: 'Your events',
    title: 'What you are planning',
    blurb:
      'What you need the platform for, and the race you have in mind. Everything here is optional except the first question.',
  },
] as const;

/** Which fields each step is responsible for, so a step only refuses its own. */
const STEP_FIELDS: readonly (readonly ApplicationField[])[] = [
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
const FIELD_ID: Record<ApplicationField, string> = {
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
interface FormState {
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

const EMPTY: FormState = {
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

const TYPE_OPTIONS = ORGANIZER_TYPES.map((value) => ({
  value,
  label: ORGANIZER_TYPE_COPY[value].label,
  hint: ORGANIZER_TYPE_COPY[value].hint,
}));

const EXPERIENCE_OPTIONS = ORGANIZER_EXPERIENCE.map((value) => ({
  value,
  label: ORGANIZER_EXPERIENCE_LABEL[value],
}));

const SIZE_OPTIONS = EXPECTED_PARTICIPANTS.map((value) => ({
  value,
  label: EXPECTED_PARTICIPANTS_LABEL[value],
}));

/** The marker on a label whose field may be left blank. Required is the
 *  default, so only the exceptions are called out. */
function Optional() {
  return <span className="form-optional"> · Optional</span>;
}

export default function AdminRegister() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [failure, setFailure] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  // Where a new step, a failed one, or the thank-you panel puts the reader.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);

  const isLast = step === STEPS.length - 1;
  const stepFields = STEP_FIELDS[step];
  const problems = stepFields.filter((field) => errors[field]).length;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // The message goes the moment the field is touched. Keeping it until the
    // next Continue leaves a red box under an answer that is now right.
    setErrors((prev) => {
      if (!prev[key as ApplicationField]) return prev;
      const next = { ...prev };
      delete next[key as ApplicationField];
      return next;
    });
  };

  /**
   * Ticking a box, with one rule: "Not sure yet" and a named service line
   * cannot both be true. Choosing either clears the other, so the answer
   * staff read is never two opposite things at once.
   */
  const toggleService = (service: string) => {
    if (form.services.includes(service)) {
      set('services', form.services.filter((s) => s !== service));
      return;
    }
    if (service === EXCLUSIVE_SERVICE) {
      set('services', [EXCLUSIVE_SERVICE]);
      return;
    }
    set('services', [
      ...form.services.filter((s) => s !== EXCLUSIVE_SERVICE),
      service,
    ]);
  };

  /** A step lands on its own heading, so a screen reader announces what
   *  changed and a phone is not left looking at the middle of a form that
   *  moved under it. */
  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = window.setTimeout(
      () => heading.focus({ preventScroll: true }),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [step, isSent]);

  /** Puts the caret where the work is — the wizard's own `focusField`, which
   *  is three lines and lives in an unrelated feature's folder, so it is
   *  repeated here rather than imported across the two. */
  const focusField = (field: ApplicationField) => {
    const el = document.getElementById(FIELD_ID[field]);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // The scroll is animated; focusing immediately cancels it in some browsers.
    window.setTimeout(() => el.focus({ preventScroll: true }), 300);
  };

  /** Every rule, run against the whole form; the caller decides which of the
   *  answers it is allowed to act on. */
  const validateAll = (): ApplicationErrors =>
    readOrganizerApplication({
      ...form,
      // Only asked for on the last step — until then it is not a question the
      // applicant has been shown, so it cannot be one they have failed.
      consent: isLast ? form.consent : undefined,
    }).errors;

  const showProblems = (found: ApplicationErrors, fields: readonly ApplicationField[]) => {
    setErrors(found);
    const first = fields.find((field) => found[field]);
    if (first) focusField(first);
    // The count takes focus first where there is no field to send it to (a
    // whole-form refusal off the wire), so the summary is never announced to
    // nobody.
    else problemRef.current?.focus();
  };

  const handleNext = () => {
    const found = validateAll();
    const mine = stepFields.filter((field) => found[field]);
    if (mine.length > 0) {
      // Only this step's problems are shown: the later steps have not been
      // filled in yet, and marking them red would be marking the applicant
      // wrong for not having answered a question they cannot see.
      const scoped: ApplicationErrors = {};
      for (const field of mine) scoped[field] = found[field];
      showProblems(scoped, stepFields);
      return;
    }
    setErrors({});
    setFailure('');
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setErrors({});
    setFailure('');
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isSent) return;

    // Every step goes through here, so Enter behaves like the button beside
    // it; only the last one actually sends anything.
    if (!isLast) {
      handleNext();
      return;
    }

    const found = validateAll();
    if (Object.keys(found).length > 0) {
      // A problem left behind on an earlier step is a step the applicant has
      // to be taken back to, or they would be staring at a Submit button that
      // refuses for a reason drawn on a panel they cannot see.
      const owner = STEP_FIELDS.findIndex((fields) =>
        fields.some((field) => found[field]),
      );
      if (owner >= 0 && owner !== step) setStep(owner);
      showProblems(found, STEP_FIELDS[owner >= 0 ? owner : step]);
      return;
    }

    setErrors({});
    setFailure('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, consent: form.consent }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // A refusal the route attached to a field goes back on that field —
        // an address already in use belongs beside the address, not in a
        // banner over a form the applicant then has to re-read themselves.
        const fromApi: ApplicationErrors = data?.errors ?? {};
        if (Object.keys(fromApi).length > 0) {
          const owner = STEP_FIELDS.findIndex((fields) =>
            fields.some((field) => fromApi[field]),
          );
          if (owner >= 0 && owner !== step) setStep(owner);
          showProblems(fromApi, STEP_FIELDS[owner >= 0 ? owner : step]);
        } else {
          setFailure(data?.error || 'We could not send your application. Please try again.');
          problemRef.current?.focus();
        }
        setIsSubmitting(false);
        return;
      }

      setIsSent(true);
      setIsSubmitting(false);
    } catch {
      setFailure(
        'We could not reach the server. Check your connection and try again — nothing has been sent yet.',
      );
      setIsSubmitting(false);
    }
  };

  const noteLeft = MAX_APPLICATION_NOTE - form.applicationNote.length;

  return (
    <div className="auth-container">
      <div className="auth-bg-shape orange"></div>
      <div className="auth-bg-shape blue"></div>

      <div className="auth-shell auth-shell--wide">
        <AuthHomeLink />

        <div className="auth-card">
          <div className="auth-header">
            <Link href="/" className="auth-logo-link mb-5" aria-label="Run As One home page">
              <RunAsOneLogo variant="stacked" className="[--rao-logo-size:64px]" decorative />
            </Link>
            <h1 className="auth-title">
              {isSent ? 'Application received' : 'Apply as an Organizer'}
            </h1>
            <p className="auth-subtitle">
              {isSent
                ? 'Thank you. Here is what happens next.'
                : 'Run your races on Run As One — registration, payments, race kits, results and e-certificates in one place.'}
            </p>
          </div>

          {isSent ? (
            <div className="apply-done">
              <span className="apply-done__mark" aria-hidden="true">
                <CheckCircle2 size={28} />
              </span>

              <h2
                ref={headingRef}
                tabIndex={-1}
                className="text-lg font-bold text-white outline-none"
              >
                We have your application, {form.contactFirstName || 'thank you'}.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                It is in the queue for review under{' '}
                <strong className="text-white">{form.name}</strong>. We will write to{' '}
                <strong className="text-white">{form.email}</strong>, so keep an eye on
                that inbox — the spam folder included.
              </p>

              <ol className="apply-next">
                <li>
                  <span className="apply-next__num" aria-hidden="true">1</span>
                  <span>
                    <strong>We read it.</strong> The Run As One team checks your
                    organization and the event you described, usually within two
                    business days.
                  </span>
                </li>
                <li>
                  <span className="apply-next__num" aria-hidden="true">2</span>
                  <span>
                    <strong>We may call or email you</strong> on the number and address
                    you gave, to agree on the event, the fees and how registrations are
                    settled with you.
                  </span>
                </li>
                <li>
                  <span className="apply-next__num" aria-hidden="true">3</span>
                  <span>
                    <strong>You get your sign-in.</strong> When we are ready to run your
                    race, we email a link to set a password. Your dashboard then shows
                    each of your events and how many runners have registered.
                  </span>
                </li>
              </ol>

              <div className="apply-nav apply-nav--end">
                <Link href="/" className="btn-gradient text-white">
                  Back to Run As One
                </Link>
              </div>

              <p className="mt-6 text-xs text-secondary">
                Something to add, or a question in the meantime? Write to{' '}
                <a href={SUPPORT_MAILTO} className="auth-link">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </div>
          ) : (
            <>
              <ol className="apply-steps" aria-label="Application progress">
                {STEPS.map((entry, index) => {
                  const state =
                    index < step ? 'done' : index === step ? 'current' : 'todo';
                  return (
                    <li
                      key={entry.rail}
                      className="apply-step"
                      data-state={state}
                      aria-current={state === 'current' ? 'step' : undefined}
                    >
                      <span className="apply-step__dot" aria-hidden="true">
                        {state === 'done' ? <Check size={15} strokeWidth={3} /> : index + 1}
                      </span>
                      <span className="apply-step__label">{entry.rail}</span>
                    </li>
                  );
                })}
              </ol>

              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                <div className="apply-step-head">
                  <span className="apply-eyebrow">
                    Step {step + 1} of {STEPS.length}
                  </span>
                  <h2 ref={headingRef} tabIndex={-1} className="outline-none">
                    {STEPS[step].title}
                  </h2>
                  <p>{STEPS[step].blurb}</p>
                </div>

                {(problems > 0 || failure) && (
                  <div
                    ref={problemRef}
                    className="apply-problem"
                    role="alert"
                    tabIndex={-1}
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      {failure ||
                        `${problems} ${problems === 1 ? 'answer needs' : 'answers need'} your attention before you can continue. ${
                          problems === 1 ? 'It is' : 'They are'
                        } marked in red below.`}
                    </span>
                  </div>
                )}

                {step === 0 && (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor={FIELD_ID.name}>
                        Organization Name
                      </label>
                      <input
                        id={FIELD_ID.name}
                        type="text"
                        value={form.name}
                        onChange={(e) => set('name', e.target.value)}
                        className="form-input"
                        placeholder="Sunrise Running Club"
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={`${FIELD_ID.name}-error ${FIELD_ID.name}-hint`}
                      />
                      <p id={`${FIELD_ID.name}-hint`} className="form-hint">
                        Exactly as it should appear to runners on your event pages.
                      </p>
                      <FieldError id={`${FIELD_ID.name}-error`} message={errors.name} />
                    </div>

                    <AdminSelect
                      id={FIELD_ID.orgType}
                      label="What kind of organizer are you?"
                      listboxLabel="Kinds of organizer"
                      placeholder="Choose one"
                      value={form.orgType}
                      options={TYPE_OPTIONS}
                      onChange={(next) => set('orgType', next)}
                      error={errors.orgType}
                    />

                    <div className="apply-row apply-row--two">
                      <div className="form-group">
                        <label className="form-label" htmlFor={FIELD_ID.city}>
                          City or Municipality
                        </label>
                        <input
                          id={FIELD_ID.city}
                          type="text"
                          value={form.city}
                          onChange={(e) => set('city', e.target.value)}
                          className="form-input"
                          placeholder="Angeles City"
                          aria-invalid={Boolean(errors.city)}
                          aria-describedby={`${FIELD_ID.city}-error`}
                        />
                        <FieldError id={`${FIELD_ID.city}-error`} message={errors.city} />
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor={FIELD_ID.province}>
                          Province
                        </label>
                        <input
                          id={FIELD_ID.province}
                          type="text"
                          value={form.province}
                          onChange={(e) => set('province', e.target.value)}
                          className="form-input"
                          placeholder="Pampanga"
                          aria-invalid={Boolean(errors.province)}
                          aria-describedby={`${FIELD_ID.province}-error`}
                        />
                        <FieldError
                          id={`${FIELD_ID.province}-error`}
                          message={errors.province}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor={FIELD_ID.website}>
                        Website or Facebook Page
                        <Optional />
                      </label>
                      <input
                        id={FIELD_ID.website}
                        type="text"
                        inputMode="url"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={form.website}
                        onChange={(e) => set('website', e.target.value)}
                        className="form-input"
                        placeholder="facebook.com/sunriserunningclub"
                        aria-invalid={Boolean(errors.website)}
                        aria-describedby={`${FIELD_ID.website}-error ${FIELD_ID.website}-hint`}
                      />
                      <p id={`${FIELD_ID.website}-hint`} className="form-hint">
                        The quickest way for us to confirm you are who you say you are.
                        A Facebook page is perfectly fine.
                      </p>
                      <FieldError
                        id={`${FIELD_ID.website}-error`}
                        message={errors.website}
                      />
                    </div>

                    <AdminSelect
                      id={FIELD_ID.experience}
                      label="How many running events have you organized?"
                      listboxLabel="Events organized before"
                      placeholder="Choose one"
                      value={form.experience}
                      options={EXPERIENCE_OPTIONS}
                      onChange={(next) => set('experience', next)}
                      hint="A first event is welcome here — it only tells us how much help to offer."
                      error={errors.experience}
                    />
                  </>
                )}

                {step === 1 && (
                  <>
                    <div className="apply-row apply-row--two">
                      <div className="form-group">
                        <label className="form-label" htmlFor={FIELD_ID.contactFirstName}>
                          First Name
                        </label>
                        <input
                          id={FIELD_ID.contactFirstName}
                          type="text"
                          autoComplete="given-name"
                          value={form.contactFirstName}
                          onChange={(e) => set('contactFirstName', e.target.value)}
                          className="form-input"
                          placeholder="Juan"
                          aria-invalid={Boolean(errors.contactFirstName)}
                          aria-describedby={`${FIELD_ID.contactFirstName}-error`}
                        />
                        <FieldError
                          id={`${FIELD_ID.contactFirstName}-error`}
                          message={errors.contactFirstName}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor={FIELD_ID.contactLastName}>
                          Last Name
                        </label>
                        <input
                          id={FIELD_ID.contactLastName}
                          type="text"
                          autoComplete="family-name"
                          value={form.contactLastName}
                          onChange={(e) => set('contactLastName', e.target.value)}
                          className="form-input"
                          placeholder="Dela Cruz"
                          aria-invalid={Boolean(errors.contactLastName)}
                          aria-describedby={`${FIELD_ID.contactLastName}-error`}
                        />
                        <FieldError
                          id={`${FIELD_ID.contactLastName}-error`}
                          message={errors.contactLastName}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor={FIELD_ID.contactRole}>
                        Your Role
                      </label>
                      <input
                        id={FIELD_ID.contactRole}
                        type="text"
                        autoComplete="organization-title"
                        value={form.contactRole}
                        onChange={(e) => set('contactRole', e.target.value)}
                        className="form-input"
                        placeholder="Race Director"
                        aria-invalid={Boolean(errors.contactRole)}
                        aria-describedby={`${FIELD_ID.contactRole}-error`}
                      />
                      <FieldError
                        id={`${FIELD_ID.contactRole}-error`}
                        message={errors.contactRole}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor={FIELD_ID.email}>
                        Email Address
                      </label>
                      <input
                        id={FIELD_ID.email}
                        type="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={form.email}
                        onChange={(e) => set('email', e.target.value)}
                        className="form-input"
                        placeholder="organizer@example.com"
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={`${FIELD_ID.email}-error ${FIELD_ID.email}-hint`}
                      />
                      <p id={`${FIELD_ID.email}-hint`} className="form-hint">
                        Every reply about your application goes here, and so
                        will the link to set up your sign-in.
                      </p>
                      <FieldError id={`${FIELD_ID.email}-error`} message={errors.email} />
                    </div>

                    <PhoneField
                      id={FIELD_ID.phone}
                      label="Mobile Number"
                      value={form.phone}
                      defaultCountry={APPLICATION_PHONE_COUNTRY}
                      onChange={(e164) => set('phone', e164)}
                      hint="Drop the leading zero. This is how we reach you on race week, when email is too slow."
                      error={errors.phone}
                    />

                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="form-group">
                      <span className="form-label" id={`${FIELD_ID.services}-label`}>
                        What do you need Run As One for?
                      </span>
                      <p className="form-hint">
                        Pick one or both. Nothing here is locked in — we will go
                        through the details with you.
                      </p>
                      <div
                        className="apply-choices mt-1"
                        role="group"
                        aria-labelledby={`${FIELD_ID.services}-label`}
                        aria-describedby={`${FIELD_ID.services}-error`}
                      >
                        {ORGANIZER_SERVICES.map((service, index) => {
                          const checked = form.services.includes(service);
                          return (
                            <label
                              key={service}
                              className={`apply-choice${
                                service === EXCLUSIVE_SERVICE ? ' apply-choice--wide' : ''
                              }`}
                              data-checked={checked}
                            >
                              <input
                                // Only the first one carries the id, so the
                                // caret has somewhere to land when the group
                                // is the thing that is empty.
                                id={index === 0 ? FIELD_ID.services : undefined}
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleService(service)}
                              />
                              <span className="apply-choice__box" aria-hidden="true">
                                {checked && <Check size={13} strokeWidth={3} />}
                              </span>
                              <span>
                                <span className="apply-choice__label">
                                  {ORGANIZER_SERVICE_COPY[service].label}
                                </span>
                                <span className="apply-choice__hint">
                                  {ORGANIZER_SERVICE_COPY[service].hint}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <FieldError
                        id={`${FIELD_ID.services}-error`}
                        message={errors.services}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor={FIELD_ID.firstEventName}>
                        Your First Event on Run As One
                        <Optional />
                      </label>
                      <input
                        id={FIELD_ID.firstEventName}
                        type="text"
                        value={form.firstEventName}
                        onChange={(e) => set('firstEventName', e.target.value)}
                        className="form-input"
                        placeholder="Sunrise Half Marathon 2026"
                        aria-invalid={Boolean(errors.firstEventName)}
                        aria-describedby={`${FIELD_ID.firstEventName}-error`}
                      />
                      <FieldError
                        id={`${FIELD_ID.firstEventName}-error`}
                        message={errors.firstEventName}
                      />
                    </div>

                    <div className="apply-row apply-row--two">
                      <div className="form-group">
                        <label className="form-label" htmlFor={FIELD_ID.firstEventDate}>
                          Target Date
                          <Optional />
                        </label>
                        <input
                          id={FIELD_ID.firstEventDate}
                          type="date"
                          value={form.firstEventDate}
                          onChange={(e) => set('firstEventDate', e.target.value)}
                          className="form-input"
                          aria-invalid={Boolean(errors.firstEventDate)}
                          aria-describedby={`${FIELD_ID.firstEventDate}-error`}
                        />
                        <FieldError
                          id={`${FIELD_ID.firstEventDate}-error`}
                          message={errors.firstEventDate}
                        />
                      </div>

                      <div className="form-group">
                        <label
                          className="form-label"
                          htmlFor={FIELD_ID.firstEventLocation}
                        >
                          Where It Will Be Held
                          <Optional />
                        </label>
                        <input
                          id={FIELD_ID.firstEventLocation}
                          type="text"
                          value={form.firstEventLocation}
                          onChange={(e) => set('firstEventLocation', e.target.value)}
                          className="form-input"
                          placeholder="Clark Parade Grounds, Pampanga"
                          aria-invalid={Boolean(errors.firstEventLocation)}
                          aria-describedby={`${FIELD_ID.firstEventLocation}-error`}
                        />
                        <FieldError
                          id={`${FIELD_ID.firstEventLocation}-error`}
                          message={errors.firstEventLocation}
                        />
                      </div>
                    </div>

                    <AdminSelect
                      id={FIELD_ID.expectedRunners}
                      label={
                        <>
                          How many runners do you expect?
                          <Optional />
                        </>
                      }
                      listboxLabel="Expected number of runners"
                      placeholder="Choose a range"
                      value={form.expectedRunners}
                      options={SIZE_OPTIONS}
                      onChange={(next) => set('expectedRunners', next)}
                      hint="A rough range is enough. It tells us what to prepare for, not what to charge."
                      error={errors.expectedRunners}
                    />

                    <div className="form-group">
                      <label className="form-label" htmlFor={FIELD_ID.applicationNote}>
                        Anything Else We Should Know?
                        <Optional />
                      </label>
                      <textarea
                        id={FIELD_ID.applicationNote}
                        value={form.applicationNote}
                        onChange={(e) => set('applicationNote', e.target.value)}
                        maxLength={MAX_APPLICATION_NOTE}
                        className="form-input form-textarea"
                        placeholder="Tell us about the races you have run before, who your sponsors are, or anything you need the platform to do that you have not seen here."
                        aria-invalid={Boolean(errors.applicationNote)}
                        aria-describedby={`${FIELD_ID.applicationNote}-error ${FIELD_ID.applicationNote}-count`}
                      />
                      <p
                        id={`${FIELD_ID.applicationNote}-count`}
                        className="form-hint text-right"
                      >
                        {noteLeft.toLocaleString()} characters left
                      </p>
                      <FieldError
                        id={`${FIELD_ID.applicationNote}-error`}
                        message={errors.applicationNote}
                      />
                    </div>

                    <div className="form-group">
                      <label
                        className="apply-choice apply-consent"
                        data-checked={form.consent}
                      >
                        <input
                          id={FIELD_ID.consent}
                          type="checkbox"
                          checked={form.consent}
                          onChange={(e) => set('consent', e.target.checked)}
                          aria-describedby={`${FIELD_ID.consent}-error`}
                        />
                        <span className="apply-choice__box" aria-hidden="true">
                          {form.consent && <Check size={13} strokeWidth={3} />}
                        </span>
                        <span>
                          <span className="apply-choice__label">
                            Everything above is true and I am authorised to apply on
                            behalf of this organization.
                          </span>
                          <span className="apply-choice__hint">
                            We use these details to review your application and to
                            contact you about it. See our{' '}
                            <Link href="/privacy" className="auth-link">
                              Privacy Policy
                            </Link>{' '}
                            and{' '}
                            <Link href="/terms" className="auth-link">
                              Terms
                            </Link>
                            .
                          </span>
                        </span>
                      </label>
                      <FieldError
                        id={`${FIELD_ID.consent}-error`}
                        message={errors.consent}
                      />
                    </div>
                  </>
                )}

                <div className={`apply-nav${step === 0 ? ' apply-nav--end' : ''}`}>
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={handleBack}
                      disabled={isSubmitting}
                      className="btn-secondary"
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                      Back
                    </button>
                  )}

                  {/* One submit button whose label changes, rather than a
                      Continue that is `type="button"` and a Submit that is
                      not. The pair looked equivalent and was not: React
                      re-uses the same DOM node for both, so the press that
                      advanced to the last step re-typed that very node to
                      `submit` before the browser got round to the click's
                      default action, and the form posted itself the instant
                      step 3 appeared. Routing both presses through onSubmit
                      also makes Enter in any field do what Enter should. */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-gradient text-white font-medium"
                  >
                    {isSubmitting ? (
                      <BusyLabel>Submitting</BusyLabel>
                    ) : isLast ? (
                      <>
                        <Send size={16} aria-hidden="true" />
                        Submit Application
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight size={16} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="auth-footer">
                Already have an account?{' '}
                <Link href="/admin/login" className="auth-link">
                  Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
