'use client';

import React from 'react';
import { Ban, Undo2 } from 'lucide-react';
import AdminDatePicker from '../AdminDatePicker';
import { DOWNGRADE_REFUND_POLICIES, type DowngradeRefundPolicy } from '@/lib/category-change';
import type { EventFormDraft } from './event-form-draft';

/**
 * The event's three category-change settings (CATEGORY_CHANGE_PLAN.md D5, D6,
 * D12), inside Registration & Fees on both forms: the change fee, what a move
 * to a cheaper category gives back, and the last moment staff may make one.
 *
 * The refund policy is radio cards rather than a dropdown for the reason
 * RegistrationFormPicker gives: it decides whether runners get money back, and
 * a dropdown would hide that behind a label.
 */

const POLICY_OPTIONS: {
  value: DowngradeRefundPolicy;
  icon: typeof Ban;
  title: string;
  description: string;
}[] = [
  {
    value: DOWNGRADE_REFUND_POLICIES.NO_REFUND,
    icon: Ban,
    title: 'No Refund',
    description:
      'A runner who moves to a cheaper category is switched, and the difference is not given back.',
  },
  {
    value: DOWNGRADE_REFUND_POLICIES.REFUND_DIFFERENCE,
    icon: Undo2,
    title: 'Refund the Difference',
    description:
      'The runner is owed the price difference, less any change fee. Staff pay it by GCash or bank and record the reference.',
  },
];

export default function CategoryChangeSettings({
  draft,
  onChange,
}: {
  draft: Pick<EventFormDraft, 'date' | 'categoryChangeFee' | 'downgradeRefundPolicy' | 'categoryChangeUntil'>;
  onChange: (patch: Partial<EventFormDraft>) => void;
}) {
  return (
    <div className="flex flex-col gap-6 border-t border-[var(--dash-border)] pt-6">
      <div>
        <h3 className="text-base font-semibold text-primary m-0">Category Changes</h3>
        <p className="text-sm text-secondary mt-1 mb-0">
          When a paid runner asks staff to switch category. An upgrade pays the new
          category&apos;s list price minus what they paid, plus the change fee.
        </p>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="category-change-fee">
          Change Fee (₱) <span className="text-xs opacity-70">- charged per category change</span>
        </label>
        <input
          id="category-change-fee"
          type="number"
          inputMode="decimal"
          value={draft.categoryChangeFee}
          onChange={e => onChange({ categoryChangeFee: Number(e.target.value) })}
          className="form-input"
          min={0}
        />
        <p className="text-xs opacity-70 mt-1">Set to 0 to let runners switch for free. Kept as Run As One&apos;s fee.</p>
      </div>

      <div className="form-group">
        <span className="form-label">Moving to a Cheaper Category</span>
        <div className="grid gap-4 md:grid-cols-2" role="radiogroup" aria-label="Moving to a cheaper category">
          {POLICY_OPTIONS.map(option => {
            const Icon = option.icon;
            const isSelected = draft.downgradeRefundPolicy === option.value;
            return (
              <label
                key={option.value}
                className={`relative flex cursor-pointer flex-col gap-3 rounded-xl border p-4 sm:p-5 transition-colors ${
                  isSelected
                    ? 'border-accent-blue bg-accent-blue/10'
                    : 'border-[var(--dash-border)] bg-[var(--ink-02)] hover:border-[var(--ink-20)]'
                }`}
              >
                <input
                  type="radio"
                  name="downgradeRefundPolicy"
                  value={option.value}
                  checked={isSelected}
                  onChange={() => onChange({ downgradeRefundPolicy: option.value })}
                  className="sr-only"
                />
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-lg p-2 ${
                      isSelected ? 'bg-accent-blue/20 text-accent-blue-ink' : 'bg-[var(--ink-05)] text-secondary'
                    }`}
                  >
                    <Icon size={20} />
                  </span>
                  <span className="font-medium text-primary">{option.title}</span>
                </div>
                <p className="text-sm leading-relaxed text-secondary m-0">{option.description}</p>
              </label>
            );
          })}
        </div>
      </div>

      <AdminDatePicker
        id="category-change-until"
        label={
          <>
            Changes Allowed Until <span className="text-xs opacity-70">- optional</span>
          </>
        }
        value={draft.categoryChangeUntil}
        onChange={next => onChange({ categoryChangeUntil: next })}
        withTime
        defaultTime="23:59"
        max={draft.date || undefined}
        clearable
        placeholder="The day before race day"
        dialogLabel="Choose the last day category changes are allowed"
        hint="Philippine time. Leave blank to allow changes until the day before race day, when bibs and kits are final."
      />
    </div>
  );
}
