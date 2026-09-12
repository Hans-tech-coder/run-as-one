"use client";

import React, { useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import RegistrationOpeningPicker from './RegistrationOpeningPicker';
import {
  describeOpening,
  openingDraft,
  openingProblem,
  type OpeningDraft,
} from './registration-opening';

/**
 * Where an organizer decides, from the events table, when a race starts taking
 * sign-ups.
 *
 * The point of it is the case the dashboard had no answer for: a race that is
 * real and worth announcing but not ready to be paid for. Until now the only
 * way to list one was to publish it open and hope nobody registered, or to
 * pause it and leave runners reading "paused" about a race that had never
 * started. This modal gives both answers properly — open it now, or name the
 * date it opens itself.
 *
 * A modal rather than a menu item that acts on click, because unlike Pause
 * this is not one decision: it is two, and one of them needs a date typed in.
 * The event's edit form holds the same control, but reaching it means loading
 * a nine-panel form to change one field.
 *
 * Presentational on purpose — the table owns the request, as it does for the
 * pause toggle, so the row and the server's answer cannot disagree. It also
 * expects to be keyed by the row it is editing, which is what reseeds the
 * draft: an effect copying the prop into state would run a render late and
 * would flash the previous row's date on the way past.
 */
export default function RegistrationScheduleModal({
  event,
  isOpen,
  isClosing,
  isSaving,
  onClose,
  onSave,
}: {
  /** The row being scheduled, or null when nothing is. */
  event: {
    id: string;
    title: string;
    registrationOpensAt?: string | Date | null;
    registrationPaused?: boolean | null;
  } | null;
  isOpen: boolean;
  isClosing: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: OpeningDraft) => void;
}) {
  const [draft, setDraft] = useState<OpeningDraft>(() => openingDraft(event?.registrationOpensAt));
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const fault = openingProblem(draft);
    setError(fault);
    if (fault) return;
    onSave(draft);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
        isOpen && !isClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        className={`t-modal w-full max-w-2xl bg-[#111] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-schedule-title"
      >
        <div className="p-6 border-b border-white/10 flex justify-between items-start gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <span className="p-2 rounded-lg bg-accent-blue/10 text-accent-blue shrink-0">
              <CalendarClock size={20} />
            </span>
            <div>
              <h3 id="registration-schedule-title" className="text-xl font-semibold text-white m-0">
                Registration Opening
              </h3>
              {/* The row this is about. The menu it was opened from is gone by
                  now, and three events down a table look alike. */}
              <p className="text-sm text-gray-400 m-0 mt-1">{event?.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-5">
          {/* What is true right now, before anything is changed. Without it the
              modal opens on a picker whose selected card is the only clue, and
              "scheduled" with a date in the past reads the same as "open". */}
          <p className="text-sm text-secondary m-0">
            {describeOpening(openingDraft(event?.registrationOpensAt))}
          </p>

          <RegistrationOpeningPicker
            value={draft}
            onChange={(next) => {
              setDraft(next);
              if (error) setError(null);
            }}
            idPrefix="scheduleModalOpening"
            error={error}
          />

          {/* Saving either answer lifts a manual hold — see the PATCH route —
              so an organizer who paused this race is told that before they
              press the button, not after they wonder why it reopened. */}
          {event?.registrationPaused && (
            <p className="text-sm text-amber-300/90 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3 m-0">
              Sign-ups for this event are paused. Saving here lifts that hold, so registration
              follows the choice above from now on.
            </p>
          )}
        </div>

        <div className="p-6 border-t border-white/10 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={isSaving} className="btn-light">
            {isSaving ? 'Saving...' : 'Save Opening'}
          </button>
        </div>
      </div>
    </div>
  );
}
