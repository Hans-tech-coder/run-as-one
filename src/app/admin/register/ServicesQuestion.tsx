"use client";

import { Check } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';
import {
  EXCLUSIVE_SERVICE,
  ORGANIZER_SERVICES,
  ORGANIZER_SERVICE_COPY,
} from '@/lib/organizer-vocabulary';
import { FIELD_ID } from './apply-steps';

/** Step 3's first question: which services the applicant needs, as choice
 *  cards. "Not Sure Yet" takes the full row; the rule that it clears the
 *  others lives in `toggleService` and in `servicesOf` on the route. */
export default function ServicesQuestion({
  services,
  error,
  onToggle,
}: {
  services: string[];
  error: string | undefined;
  onToggle: (service: string) => void;
}) {
  return (
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
          const checked = services.includes(service);
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
                onChange={() => onToggle(service)}
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
        message={error}
      />
    </div>
  );
}
