"use client";

import FieldError from '@/components/ui/FieldError';
import AdminSelect from '../AdminSelect';
import type { ApplicationErrors } from '@/lib/organizer-application';
import {
  ORGANIZER_EXPERIENCE,
  ORGANIZER_EXPERIENCE_LABEL,
  ORGANIZER_TYPES,
  ORGANIZER_TYPE_COPY,
} from '@/lib/organizer-vocabulary';
import { FIELD_ID, type FormState, type SetField } from './apply-steps';
import Optional from './Optional';

const TYPE_OPTIONS = ORGANIZER_TYPES.map((value) => ({
  value,
  label: ORGANIZER_TYPE_COPY[value].label,
  hint: ORGANIZER_TYPE_COPY[value].hint,
}));

const EXPERIENCE_OPTIONS = ORGANIZER_EXPERIENCE.map((value) => ({
  value,
  label: ORGANIZER_EXPERIENCE_LABEL[value],
}));

/** Step 1: the name races are run under, what kind of organizer, where, and
 *  how many races they have put on before. */
export default function OrganizationStep({
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
  );
}
