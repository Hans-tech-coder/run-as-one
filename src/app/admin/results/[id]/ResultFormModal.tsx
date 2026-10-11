"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import AdminSelect from '../../AdminSelect';
import { upperCaseAsTyped } from '@/lib/text-case';
import { genderDivision } from '@/lib/gender-division';
import { runnerResultPath } from '@/lib/event-slug';
import { RESULT_STATUSES, RESULT_STATUS_LABELS } from '@/lib/result-status';
import type { RunnerRow } from './runner-row';

type Field = 'name' | 'bibNumber' | 'gender' | 'categoryId' | 'status' | 'chipTime' | 'gunTime';

/**
 * One runner's result, typed by hand: *Edit details* on a runner's row
 * (RESULTS_ROW_ACTIONS_PLAN.md Batch 3), a mistake in the timer's sheet fixed
 * without a re-upload; or, with no `runner`, *Add runner* beside the upload
 * (Batch 4), a finisher the sheet left out. One form, as one set of checks
 * (`result-fields.ts`) stands behind both routes. PacerTagModal's
 * frame; one column on a phone, two from `sm`, Cancel and Save in the footer
 * that stays in reach. The route checks everything again and names the field
 * it refuses, and the message lands under that box.
 *
 * After a save the page refreshes, so every rank the change moved moves at once.
 */
export default function ResultFormModal({
  eventId,
  eventSlug,
  categories,
  runner,
  onClose,
}: {
  eventId: string;
  eventSlug: string;
  categories: { id: string; name: string }[];
  /** The row being corrected; absent when a runner is being added. */
  runner?: RunnerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useAlert();

  const [form, setForm] = useState(runner ? {
    name: runner.name,
    bibNumber: runner.bibNumber,
    gender: genderDivision(runner.storedGender),
    categoryId: runner.categoryId,
    status: runner.status,
    chipTime: runner.chipTime,
    gunTime: runner.gunTime ?? '',
  } : {
    // A race of one category has nothing to choose.
    name: '',
    bibNumber: '',
    gender: '',
    categoryId: categories.length === 1 ? categories[0].id : '',
    status: 'FINISHED',
    chipTime: '',
    gunTime: '',
  });
  const [problem, setProblem] = useState<{ field: string; error: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isSubmitting, onClose]);

  const set = (field: Field, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
    if (problem?.field === field) setProblem(null);
  };
  const errorFor = (field: Field) => (problem?.field === field ? problem.error : undefined);

  // A sheet's own word ("Unknown") stays a choice, so opening the form and
  // saving it untouched changes nothing.
  const genderOptions = ['Male', 'Female', ...(['Male', 'Female'].includes(form.gender) || !form.gender ? [] : [form.gender])]
    .map(value => ({ value, label: value }));
  const categoryOptions = categories.map(category => ({ value: category.id, label: category.name }));
  const statusOptions = RESULT_STATUSES.map(value => ({ value, label: RESULT_STATUS_LABELS[value] }));

  const bibChanged = !!runner && form.bibNumber.trim() !== runner.bibNumber && form.bibNumber.trim() !== '';
  const oldPath = runner ? runnerResultPath({ slug: eventSlug }, runner) : '';
  const newPath = runner ? runnerResultPath({ slug: eventSlug }, { id: runner.id, bibNumber: form.bibNumber }) : '';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setProblem(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/results${runner ? `/${runner.id}` : ''}`, {
        method: runner ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem({
          field: payload.field ?? 'form',
          error: payload.error ?? 'That change could not be saved. Please try again.',
        });
        return;
      }
      onClose();
      const who = form.name.trim().toUpperCase() || runner?.name;
      toast(runner ? `${who}'s details were saved.` : `${who} was added to the results.`);
      router.refresh();
    } catch {
      setProblem({ field: 'form', error: 'Could not reach the server. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formProblem = problem?.field === 'form' ? problem.error : undefined;

  const textField = (field: Field, label: string, opts: { hint?: string; placeholder?: string; transform?: (v: string) => string; autoFocus?: boolean } = {}) => {
    const id = `edit-result-${field}`;
    const describedBy = [errorFor(field) && `${id}-error`, opts.hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
    return (
      <div className="form-group">
        <label className="form-label" htmlFor={id}>{label}</label>
        <input
          id={id}
          type="text"
          className="form-input"
          value={form[field]}
          placeholder={opts.placeholder}
          autoComplete="off"
          autoFocus={opts.autoFocus}
          onChange={event => set(field, opts.transform ? opts.transform(event.target.value) : event.target.value)}
          aria-invalid={errorFor(field) ? true : undefined}
          aria-describedby={describedBy}
        />
        {opts.hint && <p id={`${id}-hint`} className="text-xs text-secondary">{opts.hint}</p>}
        <FieldError id={`${id}-error`} message={errorFor(field)} />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-[var(--dash-scrim)] backdrop-blur-sm z-50 flex items-center justify-center p-4 max-sm:p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-result-title"
        className="admin-modal-panel bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-xl w-full max-w-lg overflow-clip"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2 max-sm:px-4 max-sm:pt-3 shrink-0">
          <h2 id="edit-result-title" className="text-xl font-bold m-0 min-w-0">{runner ? 'Edit details' : 'Add runner'}</h2>
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
          <form id="edit-result-form" onSubmit={submit} className="flex flex-col gap-5">
            <p className="m-0 text-sm text-secondary">
              {runner
                ? <>For a mistake in the timer&apos;s sheet. The ranks of the whole race are worked out
                    again when you save. Uploading the sheet again replaces this correction.</>
                : <>For a finisher the timer&apos;s sheet left out. The ranks of the whole race are
                    worked out again when you add them. Uploading the sheet again replaces every
                    result, this runner included, so add them to the sheet too.</>}
            </p>

            <FieldError id="edit-result-form-error" message={formProblem} />

            {textField('name', 'Name', { transform: upperCaseAsTyped, autoFocus: true })}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {textField('bibNumber', 'Bib number')}
              <AdminSelect
                label="Gender"
                value={form.gender}
                options={genderOptions}
                listboxLabel="Gender"
                onChange={next => set('gender', next)}
                error={errorFor('gender')}
              />
            </div>

            {bibChanged && (
              <p className="m-0 text-sm text-[var(--status-warning)]" role="status">
                Their results page moves to <span className="font-mono break-all">{newPath}</span>. A link
                already shared to <span className="font-mono break-all">{oldPath}</span> stops working.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <AdminSelect
                label="Category"
                value={form.categoryId}
                options={categoryOptions}
                listboxLabel="Category"
                onChange={next => set('categoryId', next)}
                error={errorFor('categoryId')}
              />
              <AdminSelect
                label="Status"
                value={form.status}
                options={statusOptions}
                listboxLabel="Status"
                onChange={next => set('status', next)}
                error={errorFor('status')}
                hint={form.status === 'FINISHED' ? undefined : 'Keeps their row and time, holds no place: the runners behind move up.'}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {textField('chipTime', 'Chip time', { placeholder: '1:18:56' })}
              {textField('gunTime', 'Gun time (optional)', { placeholder: '1:19:30' })}
            </div>
          </form>
        </div>

        <div className="admin-modal-footer px-6 pt-4 pb-6 max-sm:p-4 border-t border-[var(--dash-border)] shrink-0 flex items-center gap-3">
          <button type="button" onClick={onClose} className="btn-filter justify-center min-h-11" disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" form="edit-result-form" className="btn-light flex-1" disabled={isSubmitting}>
            {isSubmitting ? (runner ? 'Saving' : 'Adding') : runner ? 'Save details' : 'Add runner'}
          </button>
        </div>
      </div>
    </div>
  );
}
