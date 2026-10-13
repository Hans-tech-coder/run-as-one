"use client";

import Link from 'next/link';
import { Check } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';
import AdminSelect from '../AdminSelect';
import AdminDatePicker from '../AdminDatePicker';
import {
  MAX_APPLICATION_NOTE,
  type ApplicationErrors,
} from '@/lib/organizer-application';
import {
  EXPECTED_PARTICIPANTS,
  EXPECTED_PARTICIPANTS_LABEL,
} from '@/lib/organizer-vocabulary';
import { FIELD_ID, type FormState, type SetField } from './apply-steps';
import Optional from './Optional';
import ServicesQuestion from './ServicesQuestion';

const SIZE_OPTIONS = EXPECTED_PARTICIPANTS.map((value) => ({
  value,
  label: EXPECTED_PARTICIPANTS_LABEL[value],
}));

/** Step 3: the services wanted, the race in mind, a free note, and the
 *  consent box that is only asked here. */
export default function EventStep({
  form,
  errors,
  set,
  toggleService,
}: {
  form: FormState;
  errors: ApplicationErrors;
  set: SetField;
  toggleService: (service: string) => void;
}) {
  const noteLeft = MAX_APPLICATION_NOTE - form.applicationNote.length;

  return (
    <>
      <ServicesQuestion
        services={form.services}
        error={errors.services}
        onToggle={toggleService}
      />

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
        <AdminDatePicker
          id={FIELD_ID.firstEventDate}
          label={
            <>
              Target Date
              <Optional />
            </>
          }
          value={form.firstEventDate}
          clearable
          dialogLabel="Choose the target date"
          onChange={(day) => set('firstEventDate', day)}
          error={errors.firstEventDate}
        />

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
  );
}
