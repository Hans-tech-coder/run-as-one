"use client";

import React, { useEffect, useRef, useState } from 'react';
import { EXCLUSIVE_SERVICE } from '@/lib/organizer-vocabulary';
import {
  readOrganizerApplication,
  type ApplicationErrors,
  type ApplicationField,
} from '@/lib/organizer-application';
import { EMPTY, FIELD_ID, STEPS, STEP_FIELDS, type FormState, type SetField } from './apply-steps';

/**
 * The application's state, its per-step checks, and the post.
 *
 * **A step is checked before it advances, against the same module the API
 * uses.** `readOrganizerApplication` is the single set of rules
 * (lib/organizer-application.ts); this hook runs it on the fields belonging to
 * the current step and the route runs it on everything, so the common case
 * never costs a round trip and a tab left open still cannot post past a rule.
 * A refusal lands on the control that caused it and the caret is moved there,
 * with a count at the top of the step for anybody who pressed Continue and saw
 * nothing appear to happen (§8 rule 4).
 */
export function useApplicationForm() {
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

  const set: SetField = (key, value) => {
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

  return {
    step,
    form,
    errors,
    failure,
    isSubmitting,
    isSent,
    isLast,
    problems,
    headingRef,
    problemRef,
    set,
    toggleService,
    handleBack,
    handleSubmit,
  };
}
