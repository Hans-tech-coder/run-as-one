"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import { MAX_PACE_GROUP_LENGTH } from '@/lib/pacer';
import type { RunnerRow } from './runner-row';

/**
 * *Mark as pacer* and *Edit pace group* on a results-only race's results
 * table (RESULTS_ROW_ACTIONS_PLAN.md Batch 2). One small form: the runner it
 * acts on, named so staff can see they picked the right row, and an optional
 * pace group. EditPacerModal's frame, so the two pacer forms read as one.
 *
 * After a save the page refreshes, so the badge and every rank behind the
 * pacer move at once.
 */
export default function PacerTagModal({
  eventId,
  runner,
  mode,
  onClose,
}: {
  eventId: string;
  runner: RunnerRow;
  /** `mark` tags the runner; `edit` changes an existing tag's pace group. */
  mode: 'mark' | 'edit';
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useAlert();

  const [paceGroup, setPaceGroup] = useState(runner.paceGroup ?? '');
  const [problem, setProblem] = useState<{ field: string; error: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setProblem(null);
    setIsSubmitting(true);
    try {
      const res =
        mode === 'mark'
          ? await fetch(`/api/admin/events/${eventId}/result-pacers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bibNumber: runner.bibNumber, paceGroup }),
            })
          : await fetch(`/api/admin/events/${eventId}/result-pacers/${runner.pacerTagId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paceGroup }),
            });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A refusal about the runner (already a pacer, bib gone) has no box of
        // its own here, so it shows above the form rather than under a field.
        setProblem({
          field: payload.field ?? 'form',
          error: payload.error ?? 'That change could not be saved.',
        });
        return;
      }
      onClose();
      toast(mode === 'mark' ? `${runner.name} is marked as a pacer.` : 'The pace group was saved.');
      router.refresh();
    } catch {
      setProblem({ field: 'form', error: 'Could not reach the server. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formProblem = problem && problem.field !== 'paceGroup' ? problem.error : undefined;

  return (
    <div className="fixed inset-0 bg-[var(--dash-scrim)] backdrop-blur-sm z-50 flex items-center justify-center p-4 max-sm:p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pacer-tag-title"
        className="admin-modal-panel bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-xl w-full max-w-md overflow-clip"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2 max-sm:px-4 max-sm:pt-3 shrink-0">
          <h2 id="pacer-tag-title" className="text-xl font-bold m-0 min-w-0">
            {mode === 'mark' ? 'Mark as pacer' : 'Edit pace group'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body px-6 pt-2 pb-6 max-sm:px-4">
          <form id="pacer-tag-form" onSubmit={submit} className="flex flex-col gap-5">
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-secondary">Runner</dt>
              <dd className="m-0 font-medium text-primary break-words">{runner.name}</dd>
              <dt className="text-secondary">Bib</dt>
              <dd className="m-0 text-primary">{runner.bibNumber}</dd>
              <dt className="text-secondary">Category</dt>
              <dd className="m-0 text-primary">{runner.category.name}</dd>
            </dl>

            {mode === 'mark' && (
              <p className="m-0 text-sm text-secondary">
                A pacer is kept off the Race Winners podium and holds no place: their ranks read
                &ldquo;-&rdquo; and every runner behind them moves up, on every results page and
                certificate.
              </p>
            )}

            <FieldError id="pacer-tag-form-error" message={formProblem} />

            <div className="form-group">
              <label className="form-label" htmlFor="pacer-tag-pace-group">
                Pace group <span className="text-secondary font-normal">(optional)</span>
              </label>
              <input
                id="pacer-tag-pace-group"
                type="text"
                className="form-input"
                value={paceGroup}
                maxLength={MAX_PACE_GROUP_LENGTH}
                placeholder="SUB1 or 1:00"
                autoComplete="off"
                autoFocus
                onChange={event => setPaceGroup(event.target.value)}
                aria-invalid={problem?.field === 'paceGroup' ? true : undefined}
                aria-describedby={
                  problem?.field === 'paceGroup'
                    ? 'pacer-tag-pace-group-error pacer-tag-pace-group-hint'
                    : 'pacer-tag-pace-group-hint'
                }
              />
              <p id="pacer-tag-pace-group-hint" className="text-xs text-secondary">
                The group this pacer leads, printed on their e-certificate.
                {mode === 'edit' ? ' Clear it to remove it.' : ''}
              </p>
              <FieldError
                id="pacer-tag-pace-group-error"
                message={problem?.field === 'paceGroup' ? problem.error : undefined}
              />
            </div>
          </form>
        </div>

        <div className="admin-modal-footer px-6 pt-4 pb-6 max-sm:p-4 border-t border-[var(--dash-border)] shrink-0">
          <button
            type="submit"
            form="pacer-tag-form"
            className="btn-light w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving' : mode === 'mark' ? 'Mark as pacer' : 'Save pace group'}
          </button>
        </div>
      </div>
    </div>
  );
}
