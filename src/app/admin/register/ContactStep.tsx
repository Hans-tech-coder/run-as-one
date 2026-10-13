"use client";

import FieldError from '@/components/ui/FieldError';
// The runner wizard's own phone control, flag and dial code and all. Reused
// rather than rebuilt so an organizer meets the same box a runner does; it
// brings its own `.input-group` label and small print, which is why it is not
// wrapped in a `.form-group` like the fields around it.
import PhoneField from '@/app/events/[slug]/register/PhoneField';
import {
  APPLICATION_PHONE_COUNTRY,
  type ApplicationErrors,
} from '@/lib/organizer-application';
import { FIELD_ID, type FormState, type SetField } from './apply-steps';

/** Step 2: the person Run As One talks to, and how to reach them. */
export default function ContactStep({
  form,
  errors,
  set,
}: {
  form: FormState;
  errors: ApplicationErrors;
  set: SetField;
}) {
  return (
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
  );
}
