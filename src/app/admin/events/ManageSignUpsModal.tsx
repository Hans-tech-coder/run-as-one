"use client";

import React, { useState } from 'react';
import { Lock, LockOpen, SlidersHorizontal, X } from 'lucide-react';
import AdminSwitch from '../AdminSwitch';
import BusyLabel from '@/components/ui/BusyLabel';
import { formatEventInstant } from '@/lib/event-schedule';
import { isVirtual } from '@/lib/event-format';
import { closesLater, closingHasPassed, opensLater } from '@/lib/registration-window';
import RegistrationOpeningPicker from './RegistrationOpeningPicker';
import { REGISTRATION_STATES } from './registration-state-badge';
import {
  closingDraft,
  closingDraftProblem,
  closingInstantISO,
  openingDraft,
  openingProblem,
  type OpeningDraft,
} from './registration-opening';
import type { EventRow } from './event-row';
import type { SignUpDraft } from './useManageSignUps';

/**
 * Every sign-up control for one race, from the events table: when sign-ups
 * open, when they close on their own, the pause and its note — under one Save
 * — and, apart from them, Close / Reopen. It replaced three menu items
 * (Schedule, Pause, Close) and the scheduling modal they led to, so the menu
 * carries one item for one question and the edit form's Publishing &
 * Sign-ups panel and this modal answer it in the same order.
 *
 * Close sits apart, as a danger action with its own confirm, because it is a
 * different kind of answer: the dates and the pause are settings saved
 * together, a closure is a final word said now. Reopening an event whose
 * closing date has passed takes the closing picker's answer with it — a new
 * date or none — so it really reopens (the owner's call, Q3).
 *
 * Presentational, like the modal it replaced — useManageSignUps owns the
 * requests — and keyed by the row it edits, which reseeds the drafts without
 * an effect flashing the previous row's values.
 */
export default function ManageSignUpsModal({
  event,
  isOpen,
  isClosing,
  isSaving,
  onClose,
  onSave,
  onToggleClosed,
}: {
  event: EventRow | null;
  isOpen: boolean;
  isClosing: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: SignUpDraft) => void;
  onToggleClosed: (draft: SignUpDraft) => void;
}) {
  const [opening, setOpening] = useState<OpeningDraft>(() => openingDraft(event?.registrationOpensAt));
  const [closing, setClosing] = useState<OpeningDraft>(() => closingDraft(event?.registrationClosesAt));
  const [paused, setPaused] = useState(Boolean(event?.registrationPaused));
  const [pauseNote, setPauseNote] = useState(event?.registrationPauseNote ?? '');
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [closingError, setClosingError] = useState<string | null>(null);

  const state = event?.registrationState ?? 'OPEN';
  const badge = REGISTRATION_STATES[state];
  const closed = state === 'CLOSED';
  const closedOnSchedule = closed && !event?.registrationClosedAt && closingHasPassed(event ?? {});
  // Closed by hand, and its closing date has gone by as well: the Reopen has
  // to clear that date too, so the copy has to say so.
  const closedPastDate = closed && Boolean(event?.registrationClosedAt) && closingHasPassed(event ?? {});

  // Race day, the latest a closing date may fall (registration-window.ts).
  const raceWindow = {
    date: event?.date ?? '',
    virtualEndDate: event && isVirtual(event) ? event.virtualEndDate : null,
  };

  const handleSave = () => {
    const openFault = openingProblem(opening);
    const closeFault = closingDraftProblem(closing, {
      opening,
      ...raceWindow,
      savedClosesAt: event?.registrationClosesAt ? new Date(event.registrationClosesAt).toISOString() : null,
    });
    setOpeningError(openFault);
    setClosingError(closeFault);
    if (openFault || closeFault) return;
    onSave({ opening, closing, paused, pauseNote });
  };

  const handleToggleClosed = () => {
    // A reopen saves the settings above with it, so it checks them first and
    // a refusal lands under its field rather than in an alert. A closing date
    // already gone, on an event whose stored date has also gone, is dropped by
    // the reopen instead (useManageSignUps). Close sends none of this.
    if (closed) {
      const openFault = openingProblem(opening);
      const dropped =
        closingHasPassed(event ?? {}) && closingHasPassed({ registrationClosesAt: closingInstantISO(closing) });
      const closeFault = dropped
        ? null
        : closingDraftProblem(closing, { opening, ...raceWindow, savedClosesAt: null });
      setOpeningError(openFault);
      setClosingError(closeFault);
      if (openFault || closeFault) return;
    }
    onToggleClosed({ opening, closing, paused, pauseNote });
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isOpen && !isClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        className={`t-modal admin-modal-panel w-full max-w-2xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-sign-ups-title"
      >
        <div className="p-6 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="p-2 rounded-lg bg-accent-blue/10 text-accent-blue-ink shrink-0">
              <SlidersHorizontal size={20} />
            </span>
            <div className="min-w-0">
              <h3 id="manage-sign-ups-title" className="text-xl font-semibold text-primary m-0">
                Manage Sign-Ups
              </h3>
              {/* The row this is about: the menu it was opened from is gone,
                  and three events down a table look alike. */}
              <p className="text-sm text-secondary m-0 mt-1 [overflow-wrap:anywhere]">{event?.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center text-secondary hover:text-primary transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body p-6 overflow-y-auto flex flex-col gap-6">
          {/* What is true right now, before anything is changed — the same
              badge and date line the table row shows. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--dash-border)] bg-[var(--ink-02)] px-4 py-3">
            <span className={`status-badge ${badge.tone} whitespace-nowrap`}>{badge.label}</span>
            <span className="text-sm text-secondary">{statusLine(event)}</span>
          </div>

          <section className="flex flex-col gap-3" aria-labelledby="manage-sign-ups-open">
            <h4 id="manage-sign-ups-open" className="text-base font-semibold text-primary m-0">
              When can runners register?
            </h4>
            <RegistrationOpeningPicker
              value={opening}
              onChange={next => {
                setOpening(next);
                if (openingError) setOpeningError(null);
              }}
              idPrefix="manageSignUpsOpening"
              error={openingError}
            />
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="manage-sign-ups-close">
            <h4 id="manage-sign-ups-close" className="text-base font-semibold text-primary m-0">
              When does registration close?
            </h4>
            <RegistrationOpeningPicker
              kind="closing"
              value={closing}
              onChange={next => {
                setClosing(next);
                if (closingError) setClosingError(null);
              }}
              idPrefix="manageSignUpsClosing"
              error={closingError}
            />
          </section>

          <section className="flex flex-col gap-3" aria-label="Pause">
            <AdminSwitch
              on={paused}
              onToggle={() => setPaused(!paused)}
              label="Pause Registration"
              hint="Stops new sign-ups until you turn it off. The event stays listed — runners are told it is paused and may reopen, rather than finding a button that fails."
            />
            {paused && (
              <div className="form-group">
                <label className="form-label" htmlFor="manageSignUpsPauseNote">
                  What Runners Are Told <span className="text-xs opacity-70">- optional</span>
                </label>
                <textarea
                  id="manageSignUpsPauseNote"
                  value={pauseNote}
                  onChange={e => setPauseNote(e.target.value)}
                  className="form-input"
                  rows={3}
                  placeholder="e.g. Sign-ups reopen on 15 April once the new singlets arrive."
                />
                <p className="text-xs opacity-70 mt-1">
                  Leave it blank and we say sign-ups are paused and may reopen.
                </p>
              </div>
            )}
          </section>

          {/* Apart from the settings above, and red: a closure is said now,
              not saved, and it tells runners the race is not coming back. */}
          <section
            className="flex flex-col gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4"
            aria-labelledby="manage-sign-ups-final"
          >
            <h4 id="manage-sign-ups-final" className="flex items-center gap-2 text-base font-semibold text-primary m-0">
              {closed ? <LockOpen size={18} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
              {closed ? 'Reopen Sign-Ups' : 'Close Sign-Ups'}
            </h4>
            <p className="text-sm text-secondary m-0">
              {closedOnSchedule
                ? 'Registration closed on its closing date. Reopening clears that date — or pick a new one above first, and sign-ups close again then.'
                : closedPastDate
                  ? 'Runners are told registration is closed, and its closing date has passed too. Reopening clears that date — or pick a new one above first — and saves your other changes above.'
                  : closed
                    ? 'Runners are told registration is closed. Reopening lets them register again and saves your changes above.'
                    : 'Ends sign-ups now, for good, even with slots left. Runners are told registration is closed. Orders already placed are not affected.'}
            </p>
            <div>
              <button
                type="button"
                onClick={handleToggleClosed}
                disabled={isSaving}
                className={
                  closed
                    ? 'btn-light'
                    : 'min-h-11 px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2'
                }
              >
                {closed ? 'Reopen Sign-Ups' : 'Close Sign-Ups'}
              </button>
            </div>
          </section>
        </div>

        <div className="admin-modal-footer p-6 border-t border-[var(--dash-border)] flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors"
          >
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={isSaving} className="btn-light">
            {isSaving ? <BusyLabel>Saving</BusyLabel> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The status badge's sentence: which dates stand behind it. */
function statusLine(event: EventRow | null): string {
  if (!event) return '';
  const now = new Date();
  if (event.registrationState === 'CLOSED') {
    return !event.registrationClosedAt && event.registrationClosesAt
      ? `Closed on ${formatEventInstant(event.registrationClosesAt)}.`
      : 'Closed by your team.';
  }
  const parts: string[] = [];
  if (event.registrationPaused) parts.push('Paused by your team.');
  if (opensLater(event, now) && event.registrationOpensAt) {
    parts.push(`Opens ${formatEventInstant(event.registrationOpensAt)}.`);
  }
  if (closesLater(event, now) && event.registrationClosesAt) {
    parts.push(`Closes ${formatEventInstant(event.registrationClosesAt)}.`);
  }
  return parts.length > 0 ? parts.join(' ') : 'Open until race day.';
}
