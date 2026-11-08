'use client';

import React from 'react';
import { CalendarX, Eye, Info, UserPlus } from 'lucide-react';
import PublishPicker from './PublishPicker';
import RegistrationOpeningPicker from './RegistrationOpeningPicker';
import { describeTimeline, type PublishDraft } from './publish-draft';
import { describeClosing, type OpeningDraft } from './registration-opening';
import { eventInstant } from '@/lib/event-schedule';

/** A closing date already gone outranks the timeline: the race is closed. */
function closingPassed(closing: OpeningDraft): boolean {
  const instant = closing.scheduled ? eventInstant(closing.day, closing.time) : null;
  return instant !== null && instant.getTime() <= Date.now();
}

/**
 * "Publishing & Sign-ups": the two "when" questions about an event, asked one
 * after the other so staff read them as two switches rather than one control
 * named twice (EVENT_PUBLISH_PLAN.md).
 *
 *   1. When can runners **see** it? — `publishAt` (draft / now / a date).
 *   2. When can runners **register**? — `registrationOpensAt` (as soon as it is
 *      public / a later date, which lists the race early as a teaser).
 *   3. When does registration **close**? — `registrationClosesAt` (race day /
 *      a set date, registration-window.ts). The three sign-up controls the
 *      events table's Manage Sign-Ups modal holds live here too, so the form
 *      and the modal answer the same questions in the same order.
 *
 * Under both, one sentence says what runners will experience, built from the
 * two answers together, so nobody has to combine them in their head.
 *
 * The create form asks question 1 here. The edit form passes `publishStatus`
 * instead: an event's visibility changes from the events list's Publish item,
 * where the registrations check lives, never as a side effect of saving the
 * form. `children` holds the edit form's Pause and Close switches.
 */
export default function PublishingPanel({
  publish,
  onPublishChange,
  publishError,
  publishStatus,
  opening,
  onOpeningChange,
  openingError,
  closing,
  onClosingChange,
  closingError,
  idPrefix,
  paused = false,
  closed = false,
  children,
}: {
  publish: PublishDraft;
  /** Absent on the edit form, which shows `publishStatus` in its place. */
  onPublishChange?: (next: PublishDraft) => void;
  publishError?: string | null;
  publishStatus?: React.ReactNode;
  opening: OpeningDraft;
  onOpeningChange: (next: OpeningDraft) => void;
  openingError: string | null;
  closing: OpeningDraft;
  onClosingChange: (next: OpeningDraft) => void;
  closingError: string | null;
  idPrefix: string;
  /** The edit form's manual hold, so the sentence below does not promise sign-ups it has stopped. */
  paused?: boolean;
  /** The edit form's Close switch, which outranks everything below it. */
  closed?: boolean;
  children?: React.ReactNode;
}) {
  const editing = !onPublishChange;

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">Publishing & Sign-ups</h2>
      </div>
      <div className="admin-panel-content">
        <div className="flex flex-col gap-8">
          <p className="text-sm text-secondary m-0">
            Two separate settings: when runners can <strong className="text-primary">see</strong> this
            event, and when they can <strong className="text-primary">register</strong> for it.
          </p>

          <section className="flex flex-col gap-3" aria-labelledby={`${idPrefix}-see`}>
            <h3 id={`${idPrefix}-see`} className="flex items-center gap-2 text-base font-semibold text-primary m-0">
              <Eye size={18} aria-hidden="true" className="text-secondary" />
              1. When can runners see this event?
            </h3>
            {editing ? (
              publishStatus
            ) : (
              <PublishPicker
                value={publish}
                onChange={onPublishChange}
                idPrefix={`${idPrefix}-publish`}
                error={publishError}
              />
            )}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby={`${idPrefix}-register`}>
            <h3 id={`${idPrefix}-register`} className="flex items-center gap-2 text-base font-semibold text-primary m-0">
              <UserPlus size={18} aria-hidden="true" className="text-secondary" />
              2. When can runners register?
            </h3>
            <RegistrationOpeningPicker
              value={opening}
              onChange={onOpeningChange}
              idPrefix={`${idPrefix}-opening`}
              error={openingError}
            />
          </section>

          <section className="flex flex-col gap-3" aria-labelledby={`${idPrefix}-close`}>
            <h3 id={`${idPrefix}-close`} className="flex items-center gap-2 text-base font-semibold text-primary m-0">
              <CalendarX size={18} aria-hidden="true" className="text-secondary" />
              3. When does registration close?
            </h3>
            <RegistrationOpeningPicker
              kind="closing"
              value={closing}
              onChange={onClosingChange}
              idPrefix={`${idPrefix}-closing`}
              error={closingError}
            />
          </section>

          {children}

          {/* What the two answers mean together, in runners' terms. Live, so
              it changes as the cards are clicked. */}
          <p
            className="flex items-start gap-3 rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-4 py-3 text-sm text-primary m-0"
            aria-live="polite"
          >
            <Info size={18} aria-hidden="true" className="shrink-0 mt-0.5 text-accent-blue-ink" />
            <span>
              {/* A hold outranks the schedule (lib/registration-gate.ts), so
                  on a live event it is the whole answer, not a footnote. */}
              {closed
                ? 'Sign-ups are closed — nobody can register until you turn Close Registration off.'
                : closingPassed(closing)
                  ? `${describeClosing(closing)} Nobody can register until you pick a later closing date or choose Until Race Day.`
                : paused && publish.mode === 'NOW'
                ? 'Runners can see this event, but sign-ups are paused — the Register button stays off until you turn Pause Registration off.'
                : describeTimeline(publish, opening, editing) +
                  (closing.scheduled ? ` ${describeClosing(closing)}` : '') +
                  (paused ? ' Sign-ups are paused, so nobody can register until you turn Pause Registration off.' : '')}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
