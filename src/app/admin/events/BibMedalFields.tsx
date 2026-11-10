"use client";

import React from 'react';
import AdminSwitch from '../AdminSwitch';
import InclusionsField from './InclusionsField';
import AdminDatePicker from '../AdminDatePicker';
import FieldError from '@/components/ui/FieldError';
import { eventInstant, formatEventInstant } from '@/lib/event-schedule';
import { saleOpensLater, type BibMedalFault } from '@/lib/bib-medal';
import { blankBibMedal, type BibMedalDraft, type CategoryDraft } from './category-draft';

/**
 * The Bib + Medal part of one race category's card.
 *
 * It sits inside the parent's card because to the organizer it is a setting of
 * the 10K, even though it saves as its own Category row (lib/bib-medal.ts). The
 * name and distance are not asked for: both follow the parent on every save.
 *
 * **Bib + Medal replaces Full, it does not join it** (lib/bib-medal.ts): from
 * the moment it is on sale, Full stops selling by itself. *Goes On Sale* is
 * that moment, blank meaning the save itself, and the line under it says in
 * words what runners will be offered and when, because a switch that closes a
 * different option is not something to leave implied.
 *
 * "Stop selling" is therefore only the early stop: shirts ran out before the
 * date. It shows while the date is still ahead, and on any option already
 * closed by hand, otherwise that option could never be reopened.
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
  const opens = draft?.opensOn ? eventInstant(draft.opensOn.slice(0, 10), draft.opensOn.slice(11, 16)) : null;
  // Still ahead. A date already gone reads as on sale, as the gate reads it.
  const scheduled = Boolean(opens) && saleOpensLater({ opensAt: opens });
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

          <AdminDatePicker
            id={`bibMedal-${index}-opensOn`}
            className="form-group-full"
            label={
              <>
                Goes On Sale <span className="text-xs opacity-70">- leave blank to start when you save</span>
              </>
            }
            value={draft.opensOn}
            onChange={opensOn => patch({ opensOn })}
            withTime
            defaultTime="08:00"
            clearable
            placeholder="As soon as you save"
            dialogLabel="Choose when Bib + Medal goes on sale"
            error={fieldFault('opensOn')}
            hint="Philippine time. Nobody has to come back and switch it on."
          />

          {/* What the schedule does to the option above it, said outright. */}
          <p className="form-group-full text-sm text-secondary m-0" aria-live="polite">
            {scheduled && opens
              ? `Until ${formatEventInstant(opens)}, runners see only the full option. From then on Bib + Medal takes its place and the full option stops selling by itself.`
              : 'Bib + Medal is on sale once you save, and the full option stops selling at the same moment.'}{' '}
            Runners already in the full option keep their places.
          </p>
        </div>
      )}

      {(row.closed || (on && scheduled)) && (
        <AdminSwitch
          on={Boolean(row.closed)}
          label="Stop Selling the Full Option"
          hint={
            on && scheduled
              ? 'For when shirts run out before that date. Nothing in this category is sold until Bib + Medal opens.'
              : 'Closed by hand. Runners already in it keep their places; turn it off to sell it again.'
          }
          onToggle={() => onChange({ closed: !row.closed })}
        />
      )}
    </div>
  );
}
