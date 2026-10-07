"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import { MAX_PACE_GROUP_LENGTH, MAX_PACER_BIB_LENGTH, MAX_PACER_NAME_LENGTH, normalizePacerName } from '@/lib/pacer';
import type { PacerRow } from './PacersClient';

/**
 * The Edit modal on a pacer row: their name, their bib and their pace group.
 *
 * It replaced *Rename* when the bib arrived, because the two are the same
 * kind of correction — the wrong name typed, or a bib handed out late or
 * swapped on race day — and one form is easier to find than two menu items.
 * The code and the category are not here: the code must keep working for a
 * pacer already holding it, and the category is what it is locked to.
 *
 * All three go in one PATCH; the route ignores whichever did not change, so
 * saving an untouched form writes nothing to the audit trail.
 */
export default function EditPacerModal({
  eventId,
  pacer,
  onClose,
}: {
  eventId: string;
  pacer: PacerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useAlert();

  const [name, setName] = useState(pacer.assigneeName ?? '');
  const [bib, setBib] = useState(pacer.bibNumber ?? '');
  const [paceGroup, setPaceGroup] = useState(pacer.paceGroup ?? '');
  const [problem, setProblem] = useState<{ field: string; error: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setProblem(null);

    // Checked here with the same rule the route enforces, so the form says what
    // is wrong before a round trip rather than after one.
    if (!normalizePacerName(name)) {
      setProblem({
        field: 'assigneeName',
        error: 'Enter the pacer’s name, so this code can be told whose it is.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/pacers/${pacer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeName: name, bibNumber: bib, paceGroup }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem({
          field: payload.field ?? 'assigneeName',
          error: payload.error ?? 'That change could not be saved.',
        });
        return;
      }
      onClose();
      toast('The pacer was updated.');
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--dash-scrim)] backdrop-blur-sm z-50 flex items-center justify-center p-4 max-sm:p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pacer-edit-title"
        className="admin-modal-panel bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-xl w-full max-w-md overflow-clip"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2 max-sm:px-4 max-sm:pt-3 shrink-0">
          <h2 id="pacer-edit-title" className="text-xl font-bold m-0 min-w-0">
            Edit pacer
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
          <form id="pacer-edit-form" onSubmit={submit} className="flex flex-col gap-5">
            <p className="m-0 text-sm text-secondary">
              The code <strong>{pacer.code}</strong> stays as it is, so a pacer already holding it
              can still use it.
            </p>

            <div className="form-group">
              <label className="form-label" htmlFor="pacer-edit-name">
                Pacer name <span className="text-[var(--status-danger)]">*</span>
              </label>
              <input
                id="pacer-edit-name"
                type="text"
                className="form-input"
                value={name}
                maxLength={MAX_PACER_NAME_LENGTH}
                placeholder="JUAN DELA CRUZ"
                onChange={event => setName(event.target.value)}
                aria-invalid={problem?.field === 'assigneeName' ? true : undefined}
                aria-describedby={
                  problem?.field === 'assigneeName' ? 'pacer-edit-name-error' : undefined
                }
              />
              <FieldError
                id="pacer-edit-name-error"
                message={problem?.field === 'assigneeName' ? problem.error : undefined}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pacer-edit-bib">
                Bib number <span className="text-secondary font-normal">(optional)</span>
              </label>
              <input
                id="pacer-edit-bib"
                type="text"
                className="form-input"
                value={bib}
                maxLength={MAX_PACER_BIB_LENGTH}
                placeholder="1234"
                autoComplete="off"
                onChange={event => setBib(event.target.value)}
                aria-invalid={problem?.field === 'bibNumber' ? true : undefined}
                aria-describedby={
                  problem?.field === 'bibNumber'
                    ? 'pacer-edit-bib-error pacer-edit-bib-hint'
                    : 'pacer-edit-bib-hint'
                }
              />
              <p id="pacer-edit-bib-hint" className="text-xs text-secondary">
                Keeps this pacer off the Race Winners podium. Clear it to remove the bib.
              </p>
              <FieldError
                id="pacer-edit-bib-error"
                message={problem?.field === 'bibNumber' ? problem.error : undefined}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pacer-edit-pace-group">
                Pace group <span className="text-secondary font-normal">(optional)</span>
              </label>
              <input
                id="pacer-edit-pace-group"
                type="text"
                className="form-input"
                value={paceGroup}
                maxLength={MAX_PACE_GROUP_LENGTH}
                placeholder="SUB1 or 1:00"
                autoComplete="off"
                onChange={event => setPaceGroup(event.target.value)}
                aria-invalid={problem?.field === 'paceGroup' ? true : undefined}
                aria-describedby={
                  problem?.field === 'paceGroup'
                    ? 'pacer-edit-pace-group-error pacer-edit-pace-group-hint'
                    : 'pacer-edit-pace-group-hint'
                }
              />
              <p id="pacer-edit-pace-group-hint" className="text-xs text-secondary">
                The group this pacer leads, printed on their e-certificate. Clear it to remove it.
              </p>
              <FieldError
                id="pacer-edit-pace-group-error"
                message={problem?.field === 'paceGroup' ? problem.error : undefined}
              />
            </div>
          </form>
        </div>

        <div className="admin-modal-footer px-6 pt-4 pb-6 max-sm:p-4 border-t border-[var(--dash-border)] shrink-0">
          <button
            type="submit"
            form="pacer-edit-form"
            className="btn-light w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
