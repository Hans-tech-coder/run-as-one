"use client";

import React from 'react';
import { AlertCircle } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import type { EventRow } from './event-row';

/**
 * The events table's delete confirmation. It names how many registrations go
 * with the event, because removing one removes those rows too. Always mounted,
 * so `isOpen` / `isClosing` can fade it in and out (useEventRowActions).
 */
export default function DeleteEventModal({
  event,
  isOpen,
  isClosing,
  isDeleting,
  onClose,
  onConfirm,
}: {
  event: EventRow | null;
  isOpen: boolean;
  isClosing: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const registrations = event?._count?.registrations ?? 0;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isOpen && !isClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-event-title"
        className={`t-modal admin-modal-panel w-full max-w-md bg-[var(--dash-panel-solid)] border border-red-500/20 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
      >
        <div className="admin-modal-body flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-500/10 rounded-full text-[var(--status-danger)] shrink-0 mt-1">
              <AlertCircle size={24} strokeWidth={2} />
            </div>
            <div className="flex flex-col gap-2 min-w-0">
              <h3 id="delete-event-title" className="text-xl font-semibold text-primary">Delete Event</h3>
              <p className="text-secondary text-sm leading-relaxed [overflow-wrap:anywhere]">
                Are you sure you want to delete <span className="font-semibold text-primary">{event?.title}</span>? This action cannot be undone and will permanently remove the event from the database.
              </p>
            </div>
          </div>

          {registrations > 0 && (
            <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-[var(--status-danger)]">
              <AlertCircle size={20} className="shrink-0" />
              <p className="text-sm">
                This event has {registrations} registration{registrations === 1 ? '' : 's'}. Deleting it also erases those registrations, their runners, and any uploaded race results.
              </p>
            </div>
          )}
        </div>

        <div className="admin-modal-footer flex justify-end gap-3 pt-2 border-t border-[var(--dash-hairline)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {isDeleting ? <BusyLabel>Deleting</BusyLabel> : 'Delete Event'}
          </button>
        </div>
      </div>
    </div>
  );
}
