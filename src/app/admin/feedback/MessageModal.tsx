"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Bot, Mail, Trash2, X } from 'lucide-react';
import MessageDetail, { type FeedbackRow, receivedOn } from './MessageDetail';
import { FeedbackKindLabel, FeedbackSender } from './feedbackColumns';
import { FEEDBACK_STATUSES, FEEDBACK_STATUS_COPY, type FeedbackStatus } from '@/lib/feedback';
import { useCopyFeedbackPrompt } from './FeedbackMenu';

/** Kept in step with the t-modal close transition. */
const CLOSE_MS = 150;

/**
 * One message, opened: who sent it and when in the header, the whole message
 * in the body, and everything worth doing with it in the footer — Reply,
 * Copy AI Prompt and Delete — with the status picker above it, where one
 * press moves the message to any of the four states. The table row and the card both
 * open this, so what an open message shows cannot differ by screen width.
 *
 * `row` is read from the screen's list by id, so a status change made here
 * shows here at once and the modal stays open; a delete closes it.
 */
export default function MessageModal({
  row,
  saving,
  onClose,
  onSetStatus,
  onRemove,
}: {
  row: FeedbackRow;
  saving: boolean;
  onClose: () => void;
  onSetStatus: (row: FeedbackRow, status: FeedbackStatus) => void;
  onRemove: (row: FeedbackRow) => void;
}) {
  const copyPrompt = useCopyFeedbackPrompt();
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // One frame after mount, so the panel's opening transition runs.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const close = () => {
    setVisible(false);
    setTimeout(onClose, CLOSE_MS);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // A confirm or alert raised from this modal sits above it; its Escape
      // is that dialog's, not a reason to close the message underneath.
      const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
      if (dialogs[dialogs.length - 1] !== panelRef.current) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-3 bg-[var(--dash-scrim)] transition-opacity duration-200 ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onClick={event => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        className={`t-modal admin-modal-panel w-full max-w-2xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-panel shadow-2xl flex flex-col overflow-clip ${
          visible ? 'is-open' : 'is-closing'
        }`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 max-sm:px-4 max-sm:pt-3 border-b border-[var(--dash-border)] shrink-0">
          <div className="min-w-0">
            <h2 id="feedback-modal-title" className="text-xl font-bold m-0">
              <FeedbackKindLabel kind={row.kind} />
            </h2>
            <div className="mt-2 text-sm">
              <FeedbackSender row={row} />
            </div>
            <div className="status-note neutral">Received {receivedOn(row.createdAt)}</div>
          </div>
          <button
            type="button"
            onClick={close}
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-control text-secondary hover:text-primary"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body px-6 py-5 max-sm:px-4">
          <MessageDetail row={row} />
          {!row.email && (
            <p className="mt-4 mb-0 text-xs text-secondary">
              No address left, so there is nobody to reply to.
            </p>
          )}
        </div>

        {/* Where it stands, and one press to move it. The current state is the
            pressed chip; pressing it again does nothing. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 pb-5 max-sm:px-4 shrink-0">
          <span className="text-xs font-bold text-secondary">Status</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
            {FEEDBACK_STATUSES.map(status => {
              const current = row.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={current}
                  onClick={() => !current && onSetStatus(row, status)}
                  disabled={saving && !current}
                  className="btn-filter is-compact max-lg:min-h-11"
                >
                  {FEEDBACK_STATUS_COPY[status].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Delete on its own at the left, away from the everyday actions. */}
        <div className="admin-modal-footer flex flex-wrap items-center justify-between gap-3 px-6 pt-4 pb-6 max-sm:p-4 border-t border-[var(--dash-border)] shrink-0">
          <button
            type="button"
            onClick={() => onRemove(row)}
            disabled={saving}
            className="btn-filter is-danger max-lg:min-h-11 max-sm:order-last"
          >
            <Trash2 size={16} aria-hidden="true" /> Delete
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {row.email && (
              <a
                href={`mailto:${row.email}?subject=${encodeURIComponent('Re: your feedback on Run As One')}`}
                className="btn-filter no-underline max-lg:min-h-11"
              >
                <Mail size={16} aria-hidden="true" /> Reply by Email
              </a>
            )}
            <button
              type="button"
              onClick={() => copyPrompt(row)}
              className="btn-filter max-lg:min-h-11"
            >
              <Bot size={16} aria-hidden="true" /> Copy AI Prompt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
