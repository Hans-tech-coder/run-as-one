import React from 'react';
import Link from 'next/link';
import { Printer, TriangleAlert } from 'lucide-react';
import type { RegistrantRow } from './RegistrantsTable';
import { consentSheetPath } from './registrant-display';

/**
 * Parent/Guardian consent (GUARDIAN_CONSENT_PLAN.md Batch 4). Shown for a
 * minor, and for anyone with a guardian on file — a birthdate corrected
 * upward leaves the consent that was given, and hiding it would hide what
 * the guardian agreed to. A minor with none on file gets the amber line
 * rather than nothing: a row from before consent was asked for, or a
 * birthdate staff corrected later, is the case the organizer has to catch at
 * kit claiming.
 *
 * Split out of `RegistrantDetailModal.tsx` (ADD_ONS_PLAN.md Batch 4), which
 * was on the split-candidates list, when the modal gained the runner's add-ons.
 */
export default function RegistrantGuardianConsent({ runner, eventId }: { runner: RegistrantRow; eventId: string }) {
  if (!runner.isMinor && !runner.guardianName) return null;
  return (
    <div className="mt-8 pt-8 border-t border-[var(--dash-border)] space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider m-0">Parent/Guardian Consent</h4>
        {/* A new tab, so the list and this modal are still where
            the organizer left them after printing. */}
        <Link
          href={consentSheetPath(eventId, runner.id)}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue-ink hover:underline min-h-11 -my-3"
        >
          <Printer size={14} aria-hidden="true" /> Print guardian consent
        </Link>
      </div>
      {runner.guardianName ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <p className="flex flex-col"><span className="text-[var(--text-muted)]">Guardian</span> <span className="text-primary font-medium">{runner.guardianName}</span></p>
          <p className="flex flex-col"><span className="text-[var(--text-muted)]">Relationship</span> <span className="text-primary font-medium">{runner.guardianRelationshipLabel || '—'}</span></p>
          <p className="flex flex-col">
            <span className="text-[var(--text-muted)]">Consent Given</span>
            {/* Null when staff typed the guardian in afterwards:
                that records who the guardian is, not that they
                agreed, so it is not dressed up as a consent. */}
            <span className={`font-medium ${runner.guardianConsentAtLabel ? 'text-primary' : 'text-[var(--text-muted)] italic'}`}>
              {runner.guardianConsentAtLabel || 'Not through the form'}
            </span>
          </p>
        </div>
      ) : (
        <p className="flex items-start gap-2 text-sm text-[var(--status-warning)] font-medium m-0">
          <TriangleAlert size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            No guardian consent on file.
            <span className="block text-xs font-normal text-[var(--text-muted)] mt-1">
              Print the consent and have the parent or guardian sign it at kit claiming.
            </span>
          </span>
        </p>
      )}
    </div>
  );
}
