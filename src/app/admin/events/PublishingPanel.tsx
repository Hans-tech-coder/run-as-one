'use client';

import React from 'react';
import { Eye, Info, UserPlus } from 'lucide-react';
import PublishPicker from './PublishPicker';
import RegistrationOpeningPicker from './RegistrationOpeningPicker';
import { describeTimeline, type PublishDraft } from './publish-draft';
import type { OpeningDraft } from './registration-opening';

/**
 * "Publishing & Sign-ups": the two "when" questions about an event, asked one
 * after the other so staff read them as two switches rather than one control
 * named twice (EVENT_PUBLISH_PLAN.md).
 *
 *   1. When can runners **see** it? — `publishAt` (draft / now / a date).
 *   2. When can runners **register**? — `registrationOpensAt` (as soon as it is
 *      public / a later date, which lists the race early as a teaser).
 *
 * Under both, one sentence says what runners will experience, built from the
 * two answers together, so nobody has to combine them in their head.
 *
 * The create form asks question 1 here. The edit form passes `publishStatus`
 * instead: an event's visibility changes from the events list's Publish item,
 * where the registrations check lives, never as a side effect of saving the
 * form. `children` holds the edit form's registration hold.
 */
export default function PublishingPanel({
  publish,
  onPublishChange,
  publishError,
  publishStatus,
  opening,
  onOpeningChange,
  openingError,
  idPrefix,
  paused = false,
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
  idPrefix: string;
  /** The edit form's manual hold, so the sentence below does not promise sign-ups it has stopped. */
  paused?: boolean;
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
              {paused && publish.mode === 'NOW'
                ? 'Runners can see this event, but sign-ups are paused — the Register button stays off until you turn Pause Registration off.'
                : describeTimeline(publish, opening, editing) +
                  (paused ? ' Sign-ups are paused, so nobody can register until you turn Pause Registration off.' : '')}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
