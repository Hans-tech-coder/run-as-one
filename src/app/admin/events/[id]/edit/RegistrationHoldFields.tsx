'use client';

import React from 'react';
import AdminSwitch from '@/app/admin/AdminSwitch';
import type { EventEditDraft } from './event-edit-draft';

/**
 * The organizer's manual hold on sign-ups, inside the edit form's Publishing
 * panel: the switch and, while it is on, what runners are told. Split out of
 * the edit page, which was on the split-candidates list.
 *
 * A hold is distinct from an event whose options have all sold out: the slots
 * and the days both remain, and the organizer has stopped anyway. It is
 * enforced in both checkout routes, not only here, because a tab opened
 * before the hold went on will still post. The dashboard's switch
 * (AdminSwitch), like Logistics' delivery toggle, rather than a bare browser
 * checkbox.
 */
export default function RegistrationHoldFields({
  draft,
  onChange,
}: {
  draft: Pick<EventEditDraft, 'registrationPaused' | 'registrationPauseNote'>;
  onChange: (patch: Partial<EventEditDraft>) => void;
}) {
  return (
    <>
      <AdminSwitch
        on={draft.registrationPaused}
        onToggle={() => onChange({ registrationPaused: !draft.registrationPaused })}
        label="Pause Registration"
        hint="Stops new sign-ups immediately. The event stays listed and its page stays readable — runners are told it is paused rather than finding a button that fails."
      />

      {draft.registrationPaused && (
        <div className="form-group">
          <label className="form-label" htmlFor="registrationPauseNote">
            What Runners Are Told <span className="text-xs opacity-70">- optional</span>
          </label>
          <textarea
            id="registrationPauseNote"
            value={draft.registrationPauseNote}
            onChange={e => onChange({ registrationPauseNote: e.target.value })}
            className="form-input"
            rows={3}
            placeholder="e.g. Sign-ups reopen on 15 April once the new singlets arrive."
          />
          <p className="text-xs opacity-70 mt-1">
            Shown on the event page and in place of the registration form.
            Leave it blank and we say sign-ups are paused and may reopen.
          </p>
        </div>
      )}
    </>
  );
}
