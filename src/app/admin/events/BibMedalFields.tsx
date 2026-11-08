"use client";

import React from 'react';
import AdminSwitch from '../AdminSwitch';
import InclusionsField from './InclusionsField';
import FieldError from '@/components/ui/FieldError';
import type { BibMedalFault } from '@/lib/bib-medal';
import { blankBibMedal, type BibMedalDraft, type CategoryDraft } from './category-draft';

/**
 * The Bib + Medal part of one race category's card.
 *
 * It sits inside the parent's card because to the organizer it is a setting of
 * the 10K, even though it saves as its own Category row (lib/bib-medal.ts). The
 * name and distance are not asked for: both follow the parent on every save.
 *
 * "Stop selling" lives here because D1's reason for it is shirts running out,
 * which only leaves something to sell when the Bib + Medal option exists. It
 * also stays visible on a closed option whose Bib + Medal is off, otherwise
 * that option could never be reopened.
 */
export default function BibMedalFields({
  row,
  index,
  fault,
  onChange,
}: {
  row: CategoryDraft;
  index: number;
  fault: BibMedalFault | null;
  onChange: (patch: Partial<CategoryDraft>) => void;
}) {
  const draft = row.bibMedal;
  const on = Boolean(draft?.enabled);
  const fieldFault = (field: BibMedalFault['field']) =>
    fault?.index === index && fault.field === field ? fault.message : undefined;

  const patch = (next: Partial<BibMedalDraft>) => {
    onChange({ bibMedal: { ...(draft ?? blankBibMedal()), ...next } });
  };
  const taken = draft?.slotsTaken ?? 0;
  const priceError = fieldFault('price');
  const priceErrorId = `bibMedal-${index}-price-error`;

  return (
    <div className="form-group form-group-full flex flex-col gap-4">
      <AdminSwitch
        on={on}
        label="Offer a Bib + Medal Option"
        hint="A cheaper entry with no shirt. Runners see it right after this category."
        onToggle={() => patch({ enabled: !on })}
      />

      {!on && draft?.saved && (
        <p className="text-xs opacity-70 m-0">
          {taken > 0
            ? `Closed to new sign-ups. ${taken} runner${taken === 1 ? ' keeps' : 's keep'} their place.`
            : 'Saving removes this option unless someone signed up for it before. Then it is only closed.'}
        </p>
      )}

      {on && draft && (
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor={`bibMedal-${index}-price`}>
              Bib + Medal Price (₱)
            </label>
            <input
              id={`bibMedal-${index}-price`}
              type="number"
              inputMode="decimal"
              value={draft.price}
              onChange={e => patch({ price: e.target.value === '' ? '' : Number(e.target.value) })}
              className="form-input"
              min={0}
              placeholder="Below the full price"
              aria-invalid={Boolean(priceError)}
              aria-describedby={priceError ? priceErrorId : undefined}
            />
            <FieldError id={priceErrorId} message={priceError} />
          </div>

          {/* Its own cap (D2): there is no pool shared with the full option. */}
          <div className="form-group">
            <label className="form-label" htmlFor={`bibMedal-${index}-slots`}>
              Slot Limit <span className="text-xs opacity-70">- leave blank for no limit</span>
            </label>
            <input
              id={`bibMedal-${index}-slots`}
              type="number"
              inputMode="numeric"
              value={draft.slotLimit}
              onChange={e => patch({ slotLimit: e.target.value === '' ? '' : Number(e.target.value) })}
              className="form-input"
              min={1}
              placeholder="e.g. 200"
            />
            {draft.saved && (
              <p className="text-xs opacity-70 mt-1 mb-0">
                {taken} runner{taken === 1 ? ' is' : 's are'} in this option now.
              </p>
            )}
          </div>

          <InclusionsField
            id={`bibMedal-${index}-inclusions`}
            value={draft.inclusions}
            onChange={inclusions => patch({ inclusions })}
            placeholder={'Race Bib\nFinisher Medal'}
            hint="- one per line, no garments"
          />
          <div className="form-group-full">
            <FieldError id={`bibMedal-${index}-inclusions-error`} message={fieldFault('inclusions')} />
          </div>
        </div>
      )}

      {(on || row.closed) && (
        <AdminSwitch
          on={Boolean(row.closed)}
          label="Stop Selling the Full Option"
          hint="For when shirts run out. Runners already in it keep their places."
          onToggle={() => onChange({ closed: !row.closed })}
        />
      )}
    </div>
  );
}
