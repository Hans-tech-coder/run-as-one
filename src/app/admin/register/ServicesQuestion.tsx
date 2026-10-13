"use client";

import { Check } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';
import {
  EXCLUSIVE_SERVICE,
  ORGANIZER_SERVICE_COPY,
  SERVICE_GROUP_LABEL,
  servicesInGroup,
  type ServiceGroup,
} from '@/lib/organizer-vocabulary';
import { FIELD_ID } from './apply-steps';

/** Step 3's first question: which services the applicant needs, as choice
 *  cards in three groups (Online, Race day, Coming soon) with "Not Sure Yet"
 *  between the offered ones and the rest. Coming soon cards are shown but
 *  cannot be ticked (`SERVICE_INQUIRY_PLAN.md` O1). The rule that "Not Sure
 *  Yet" clears the others lives in `toggleService` and in `servicesOf` on the
 *  route. */
export default function ServicesQuestion({
  services,
  error,
  onToggle,
}: {
  services: string[];
  error: string | undefined;
  onToggle: (service: string) => void;
}) {
  const card = (service: string, first: boolean) => {
    const copy = ORGANIZER_SERVICE_COPY[service as keyof typeof ORGANIZER_SERVICE_COPY];
    const soon = copy.group === 'COMING_SOON';
    const checked = !soon && services.includes(service);
    return (
      <label
        key={service}
        className={`apply-choice${
          service === EXCLUSIVE_SERVICE ? ' apply-choice--wide' : ''
        }${soon ? ' apply-choice--soon' : ''}`}
        data-checked={checked}
      >
        <input
          // Only the first one carries the id, so the caret has
          // somewhere to land when the group is the thing that is empty.
          id={first ? FIELD_ID.services : undefined}
          type="checkbox"
          checked={checked}
          disabled={soon}
          onChange={() => onToggle(service)}
        />
        <span className="apply-choice__box" aria-hidden="true">
          {checked && <Check size={13} strokeWidth={3} />}
        </span>
        <span>
          <span className="apply-choice__label">
            {copy.label}
            {soon && <span className="apply-choice__tag">Coming soon</span>}
          </span>
          <span className="apply-choice__hint">{copy.hint}</span>
        </span>
      </label>
    );
  };

  const group = (key: ServiceGroup) => (
    <div
      className="apply-choice-group"
      role="group"
      aria-labelledby={`${FIELD_ID.services}-${key}`}
    >
      <span className="apply-choice-group__label" id={`${FIELD_ID.services}-${key}`}>
        {SERVICE_GROUP_LABEL[key]}
      </span>
      <div className="apply-choices">
        {servicesInGroup(key).map((service, index) =>
          card(service, key === 'ONLINE' && index === 0),
        )}
      </div>
    </div>
  );

  return (
    <div className="form-group">
      <span className="form-label" id={`${FIELD_ID.services}-label`}>
        Which services do you need?
      </span>
      <p className="form-hint">
        Pick as many as you need. This is an inquiry, not an order: we reply
        to go through the details and the price with you.
      </p>
      <div
        className="apply-choice-groups mt-1"
        role="group"
        aria-labelledby={`${FIELD_ID.services}-label`}
        aria-describedby={`${FIELD_ID.services}-error`}
      >
        {group('ONLINE')}
        {group('RACE_DAY')}
        <div className="apply-choices">{card(EXCLUSIVE_SERVICE, false)}</div>
        {group('COMING_SOON')}
      </div>
      <FieldError
        id={`${FIELD_ID.services}-error`}
        message={error}
      />
    </div>
  );
}
