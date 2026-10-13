"use client";

import React from 'react';
import { FileText, X } from 'lucide-react';
import { hasApplicationDetails } from '@/lib/organizer-application';
import { appliedOn, type ClientApplicationRow, type ClientViewerRow } from './application-rows';
import ApplicationAnswers from './ApplicationAnswers';
import SignInsSection from './SignInsSection';
import { useApplicationDialog } from './useApplicationDialog';

/**
 * Everything a client submission said, read in one place before Run As One
 * staff send an invite (ADMIN_MERGE_PLAN.md, Batch 3).
 *
 * It was the organizer application panel, read before an approval. Nobody
 * approves or rejects a submission any more, so *The decision* section went
 * with the flow it described; what took its place is **Sign-ins**
 * (SignInsSection), because "did they ever set up their sign-in?" is the
 * question staff open this panel to answer after an invite. Below it, the
 * application itself (ApplicationAnswers).
 *
 * A panel over the list rather than a route of its own: the invite needs the
 * list behind it, and a second page is a second thing to keep responsive.
 * Below `sm` it is a full-height sheet (`.admin-modal-sheet`), the registrant
 * detail modal's frame, because it is a thing a person reads rather than
 * answers. How it opens, closes and keeps focus is `useApplicationDialog`.
 */
export default function ApplicationPanel({
  client,
  statusBadge,
  actions,
  onResetTwoFactor,
  onClose,
}: {
  /** The submission being read. The panel is mounted only while there is one. */
  client: ClientApplicationRow;
  statusBadge: React.ReactNode;
  /** Send invite and archive, so the panel and the row cannot offer different ones. */
  actions: React.ReactNode;
  /** A viewer's lost phone (TWO_FACTOR_PLAN.md D4); offered only where it is on. */
  onResetTwoFactor: (viewer: ClientViewerRow) => void;
  onClose: () => void;
}) {
  const { open, closing, panelRef, closeRef, requestClose } = useApplicationDialog(onClose);
  const hasDetails = hasApplicationDetails(client);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        open && !closing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onMouseDown={e => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-application-title"
        className={`t-modal admin-modal-panel admin-modal-sheet w-full max-w-2xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${
          open ? 'is-open' : ''
        } ${closing ? 'is-closing' : ''}`}
      >
        <div className="p-6 max-sm:p-4 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="p-2 rounded-lg bg-accent-blue/10 text-accent-blue-ink shrink-0">
              <FileText size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3
                id="client-application-title"
                className="text-xl font-semibold text-primary m-0 [overflow-wrap:anywhere]"
              >
                {client.name}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-secondary">
                {statusBadge}
                <span>Applied {appliedOn(client.createdAt)}</span>
                {client.invitedAt && (
                  <span>Invited {appliedOn(client.invitedAt)}</span>
                )}
              </div>
            </div>
          </div>
          {/* 44px to press; the negative margin leaves the 20px icon where it
              sat. */}
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center text-secondary hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body p-6 max-sm:p-4 overflow-y-auto flex flex-col gap-6">
          {/* Only once somebody has been invited: before that the footer's
              Send invite says everything an empty section would. */}
          {client.viewers.length > 0 && (
            <SignInsSection viewers={client.viewers} onResetTwoFactor={onResetTwoFactor} />
          )}

          {!hasDetails && (
            // One honest sentence instead of fifteen blanks: these accounts
            // were never asked any of it.
            <p className="text-sm text-[var(--tone-amber)] bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3 m-0">
              This submission came from an account created before the application form existed,
              so there are no application details to show. The address below is all it was asked
              for.
            </p>
          )}

          <ApplicationAnswers client={client} hasDetails={hasDetails} />
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex flex-wrap justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={requestClose}
            className="px-4 py-2 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors"
          >
            Close
          </button>
          {actions}
        </div>
      </div>
    </div>
  );
}
