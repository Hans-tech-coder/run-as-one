"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Users, X } from 'lucide-react';
import AdminSelect from '../../../AdminSelect';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import {
  MAX_PACE_GROUP_LENGTH,
  MAX_PACER_BIB_LENGTH,
  MAX_PACER_NAME_LENGTH,
  WAIVE_REFUSAL,
  normalizePacerName,
} from '@/lib/pacer';
import type { PacerCategory } from './PacersClient';

/**
 * The Add Pacer modal: category, name, an optional bib, and the fee waiver.
 *
 * Split out of `PacersClient.tsx`, which owns only whether it is open. Every
 * check here is the route's own (`pacerFromInput` in `src/lib/pacer.ts`), run
 * first so each names its own box instead of one catch-all sentence.
 */

type AddForm = {
  categoryId: string;
  assigneeName: string;
  bibNumber: string;
  paceGroup: string;
  waiveAdminFee: boolean;
};

export default function AddPacerModal({
  eventId,
  categories,
  canWaiveAdminFee,
  onClose,
}: {
  eventId: string;
  /** This event's categories, in the event's own order. */
  categories: PacerCategory[];
  /** Whether this person holds `promo:waive-fee` — the Super Admin alone. */
  canWaiveAdminFee: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useAlert();

  const [form, setForm] = useState<AddForm>({
    // One category means one answer, so it is chosen already rather than
    // making somebody open a picker with a single option in it.
    categoryId: categories.length === 1 ? categories[0].id : '',
    assigneeName: '',
    bibNumber: '',
    paceGroup: '',
    waiveAdminFee: false,
  });
  const [problem, setProblem] = useState<{ field: string; error: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categoryOptions = categories.map(category => ({
    value: category.id,
    // The distance stays beside the name: "10K" and "10 km Fun Run" are the
    // organizer's own two labels for two different things.
    label: category.distance ? `${category.name} · ${category.distance}` : category.name,
  }));

  const submitAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setProblem(null);

    if (!form.categoryId) {
      setProblem({ field: 'categoryId', error: 'Choose the category this pacer will run.' });
      return;
    }
    if (!normalizePacerName(form.assigneeName)) {
      setProblem({
        field: 'assigneeName',
        error: 'Enter the pacer’s name, so this code can be told whose it is.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/pacers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem({
          field: payload.field ?? 'assigneeName',
          error: payload.error ?? 'That pacer could not be added. Please try again.',
        });
        return;
      }
      onClose();
      toast({
        title: 'Pacer added',
        message: `${payload.pacer?.code ?? 'Their code'} is ready to send.`,
      });
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
        aria-labelledby="pacer-form-title"
        className="admin-modal-panel bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-xl w-full max-w-lg overflow-clip"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2 max-sm:px-4 max-sm:pt-3 shrink-0">
          <h2
            id="pacer-form-title"
            className="text-xl font-bold m-0 flex items-center gap-2 min-w-0"
          >
            <Users size={20} className="text-accent-orange-ink shrink-0" />
            Add Pacer
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
          <form id="pacer-form" onSubmit={submitAdd} className="flex flex-col gap-5">
            <AdminSelect
              label={
                <>
                  Category <span className="text-[var(--status-danger)]">*</span>
                </>
              }
              value={form.categoryId}
              options={categoryOptions}
              placeholder="Which distance will they pace?"
              listboxLabel="Category"
              onChange={next => setForm({ ...form, categoryId: next })}
              error={problem?.field === 'categoryId' ? problem.error : undefined}
              hint="The code is locked to this category, and it cannot be changed afterwards."
            />

            <div className="form-group">
              <label className="form-label" htmlFor="pacer-name">
                Pacer name <span className="text-[var(--status-danger)]">*</span>
              </label>
              <input
                id="pacer-name"
                type="text"
                className="form-input"
                value={form.assigneeName}
                maxLength={MAX_PACER_NAME_LENGTH}
                // Uppercase, because that is how the name is stored and how
                // it will be shown — a sample in sentence case would promise
                // something the row does not deliver.
                placeholder="JUAN DELA CRUZ"
                onChange={event => setForm({ ...form, assigneeName: event.target.value })}
                aria-invalid={problem?.field === 'assigneeName' ? true : undefined}
                aria-describedby={
                  problem?.field === 'assigneeName' ? 'pacer-name-error' : undefined
                }
              />
              <FieldError
                id="pacer-name-error"
                message={problem?.field === 'assigneeName' ? problem.error : undefined}
              />
            </div>

            {/* Optional: bibs are often handed out after the code. It is
                what keeps this pacer off the Race Winners podium, and it
                can be filled in later through Edit. */}
            <div className="form-group">
              <label className="form-label" htmlFor="pacer-bib">
                Bib number <span className="text-secondary font-normal">(optional)</span>
              </label>
              <input
                id="pacer-bib"
                type="text"
                className="form-input"
                value={form.bibNumber}
                maxLength={MAX_PACER_BIB_LENGTH}
                placeholder="1234"
                autoComplete="off"
                onChange={event => setForm({ ...form, bibNumber: event.target.value })}
                aria-invalid={problem?.field === 'bibNumber' ? true : undefined}
                aria-describedby={
                  problem?.field === 'bibNumber' ? 'pacer-bib-error pacer-bib-hint' : 'pacer-bib-hint'
                }
              />
              <p id="pacer-bib-hint" className="text-xs text-secondary">
                Keeps this pacer off the Race Winners podium. Leave it blank if the bib is not
                assigned yet.
              </p>
              <FieldError
                id="pacer-bib-error"
                message={problem?.field === 'bibNumber' ? problem.error : undefined}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pacer-pace-group">
                Pace group <span className="text-secondary font-normal">(optional)</span>
              </label>
              <input
                id="pacer-pace-group"
                type="text"
                className="form-input"
                value={form.paceGroup}
                maxLength={MAX_PACE_GROUP_LENGTH}
                placeholder="SUB1 or 1:00"
                autoComplete="off"
                onChange={event => setForm({ ...form, paceGroup: event.target.value })}
                aria-invalid={problem?.field === 'paceGroup' ? true : undefined}
                aria-describedby={
                  problem?.field === 'paceGroup'
                    ? 'pacer-pace-group-error pacer-pace-group-hint'
                    : 'pacer-pace-group-hint'
                }
              />
              <p id="pacer-pace-group-hint" className="text-xs text-secondary">
                The group this pacer leads, printed on their e-certificate. Leave it blank if the
                groups are not set yet.
              </p>
              <FieldError
                id="pacer-pace-group-error"
                message={problem?.field === 'paceGroup' ? problem.error : undefined}
              />
            </div>

            {/* The money decision. Off means the pacer still goes through
                checkout and pays the admin fee; on means the order is ₱0 and
                there is no payment step at all. */}
            <div className="form-group">
              <button
                type="button"
                role="switch"
                aria-checked={form.waiveAdminFee}
                disabled={!canWaiveAdminFee}
                onClick={() => setForm({ ...form, waiveAdminFee: !form.waiveAdminFee })}
                className="admin-switch-row"
              >
                <span className="admin-switch-label">
                  <span>Include admin fee in discount</span>
                  <span className="admin-switch-hint">
                    {canWaiveAdminFee
                      ? 'On, the pacer pays nothing at all and skips the payment step. Off, they still pay the admin fee.'
                      : WAIVE_REFUSAL.error}
                  </span>
                </span>
                <span
                  className="t-toggle admin-switch"
                  data-on={form.waiveAdminFee}
                  aria-hidden="true"
                >
                  <span className="t-toggle-thumb" />
                </span>
              </button>
              <FieldError
                id="pacer-waiver-error"
                message={problem?.field === 'waiveAdminFee' ? problem.error : undefined}
              />
            </div>
          </form>
        </div>

        {/* Outside the scrolling body, so it is always in reach; `form` ties
            it back to the form it submits. */}
        <div className="admin-modal-footer px-6 pt-4 pb-6 max-sm:p-4 border-t border-[var(--dash-border)] shrink-0">
          <button type="submit" form="pacer-form" className="btn-light w-full" disabled={isSubmitting}>
            <Plus size={16} />
            {isSubmitting ? 'Saving' : 'Add Pacer'}
          </button>
        </div>
      </div>
    </div>
  );
}
