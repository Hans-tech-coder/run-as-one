"use client";

import React, { useState } from 'react';
import { Globe, X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { describePublish } from '@/lib/event-visibility';
import PublishPicker from './PublishPicker';
import { publishDraft, publishProblem, type PublishDraft } from './publish-draft';

/**
 * Where an organizer publishes, schedules or un-publishes an event from the
 * events table (EVENT_PUBLISH_PLAN.md). Built like RegistrationScheduleModal
 * and keyed by its row the same way, so the draft is seeded from what this
 * event holds without an effect.
 *
 * The draft card is withheld once the event has registrations (D5) — the route
 * refuses it too, but an option that can only fail should not be offered.
 */
export default function PublishModal({
  event,
  isOpen,
  isClosing,
  isSaving,
  onClose,
  onSave,
}: {
  event: {
    id: string;
    title: string;
    publishAt?: string | Date | null;
    _count?: { registrations: number };
  } | null;
  isOpen: boolean;
  isClosing: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: PublishDraft) => void;
}) {
  const hasRegistrations = (event?._count?.registrations ?? 0) > 0;
  const [draft, setDraft] = useState<PublishDraft>(() => {
    const seeded = publishDraft(event?.publishAt);
    // A draft opening this modal came to publish it, so that is the answer
    // already picked; keeping it a draft is one click back.
    return seeded.mode === 'DRAFT' ? { ...seeded, mode: 'NOW' } : seeded;
  });
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const fault = publishProblem(draft);
    setError(fault);
    if (fault) return;
    onSave(draft);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isOpen && !isClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        className={`t-modal admin-modal-panel w-full max-w-3xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-modal-title"
      >
        <div className="p-6 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="p-2 rounded-lg bg-accent-blue/10 text-accent-blue-ink shrink-0">
              <Globe size={20} />
            </span>
            <div className="min-w-0">
              <h3 id="publish-modal-title" className="text-xl font-semibold text-primary m-0">
                Publishing
              </h3>
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

        <div className="admin-modal-body p-6 overflow-y-auto flex flex-col gap-5">
          {/* What is true now, before anything changes. */}
          <p className="text-sm text-secondary m-0">{describePublish({ publishAt: event?.publishAt ?? null })}</p>

          <PublishPicker
            value={draft}
            onChange={next => {
              setDraft(next);
              if (error) setError(null);
            }}
            idPrefix="publishModal"
            error={error}
            allowDraft={!hasRegistrations}
          />

          {hasRegistrations && (
            <p className="text-sm text-secondary m-0">
              This event already has registrations, so it cannot go back to being a draft. Pause or
              close sign-ups instead.
            </p>
          )}
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
            {isSaving ? <BusyLabel>Saving</BusyLabel> : 'Save Publishing'}
          </button>
        </div>
      </div>
    </div>
  );
}
