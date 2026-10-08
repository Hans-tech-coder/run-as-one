'use client';

import React from 'react';
import ConsentWaiverField from './ConsentWaiverField';
import RegistrationFormPicker from './RegistrationFormPicker';
import RegistrationOpeningPicker from './RegistrationOpeningPicker';
import type { OpeningDraft } from './registration-opening';
import type { EventFormDraft } from './event-form-draft';

/**
 * The "Registration & Fees" panel, shared by the create and edit forms: when
 * sign-ups open, the per-runner fees, which checkout runners see, and the
 * waiver.
 *
 * `children` sits between the opening and the fees. Only the edit form fills
 * it, with the registration hold: a race that does not exist yet has nothing
 * to pause. `adminFeeHint` is the line under the Admin Fee box, which only the
 * create form shows, because only there does the box start at the default.
 */
export default function RegistrationFeesPanel({
  draft,
  onChange,
  opening,
  onOpeningChange,
  openingError,
  openingIdPrefix,
  adminFeeHint,
  children,
}: {
  draft: Pick<EventFormDraft, 'title' | 'adminFee' | 'shirtSizeUpcharge' | 'registrationForm' | 'consentWaiver'>;
  onChange: (patch: Partial<EventFormDraft>) => void;
  opening: OpeningDraft;
  onOpeningChange: (next: OpeningDraft) => void;
  openingError: string | null;
  openingIdPrefix: string;
  adminFeeHint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">Registration & Fees</h2>
      </div>
      <div className="admin-panel-content">
        <div className="flex flex-col gap-6">
          {/* When sign-ups start. Above the hold because it is the
              earlier question: whether this race has opened at all
              comes before whether the organizer has stopped it. */}
          <div className="form-group">
            <label className="form-label">Registration Opening</label>
            <RegistrationOpeningPicker
              value={opening}
              onChange={onOpeningChange}
              idPrefix={openingIdPrefix}
              error={openingError}
            />
          </div>
          {children}
          <div className="form-group">
            <label className="form-label">Admin Fee (₱) <span className="text-xs opacity-70">- charged per runner</span></label>
            <input
              type="number" inputMode="decimal"
              value={draft.adminFee}
              onChange={e => onChange({ adminFee: Number(e.target.value) })}
              className="form-input"
              min={0}
            />
            {adminFeeHint && <p className="text-xs opacity-70 mt-1">{adminFeeHint}</p>}
          </div>
          <div className="form-group">
            <label className="form-label">Large Size Surcharge (₱) <span className="text-xs opacity-70">- added once per runner in 4XL or above</span></label>
            <input
              type="number" inputMode="decimal"
              value={draft.shirtSizeUpcharge}
              onChange={e => onChange({ shirtSizeUpcharge: Number(e.target.value) })}
              className="form-input"
              min={0}
            />
            <p className="text-xs opacity-70 mt-1">
              Set to 0 if the larger sizes cost the same. Only charged to runners
              whose package actually includes a singlet or shirt.
            </p>
          </div>
          <div className="form-group">
            <label className="form-label">Registration Form</label>
            <RegistrationFormPicker
              value={draft.registrationForm}
              onChange={value => onChange({ registrationForm: value })}
            />
          </div>
          <ConsentWaiverField
            value={draft.consentWaiver}
            eventTitle={draft.title}
            onChange={next => onChange({ consentWaiver: next })}
          />
        </div>
      </div>
    </div>
  );
}
