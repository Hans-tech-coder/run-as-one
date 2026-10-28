"use client";

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Pencil, Plus, ShoppingBag, X } from 'lucide-react';
import AdminSelect from '../AdminSelect';
import AdminDatePicker from '../AdminDatePicker';
import FieldError from '@/components/ui/FieldError';
import BusyLabel from '@/components/ui/BusyLabel';
import PosterField from './PosterField';
import {
  ADD_ON_OPTION_KIND_LABELS,
  ADD_ON_OPTION_KINDS,
  ADD_ON_SELLERS,
  ADD_ON_SELLER_LABELS,
  MAX_ADD_ON_DESCRIPTION_LENGTH,
  MAX_ADD_ON_NAME_LENGTH,
  MAX_ADD_ON_PER_RUNNER,
  addOnFromInput,
  type AddOnField,
  type AddOnOptionKind,
  type AddOnProblem,
  type AddOnSeller,
} from '@/lib/add-ons';
import { SHIRT_SIZES } from '@/lib/shirt-size';
import { upperCaseAsTyped } from '@/lib/text-case';
import { eventInstant, eventInstantParts } from '@/lib/event-schedule';
// Type only, so the server-only store (and Prisma with it) never reaches the
// browser bundle.
import type { AdminAddOn } from '@/lib/add-on-stock';

/**
 * The Add / Edit Add-on modal on Event edit › Add-ons (ADD_ONS_PLAN.md
 * Batch 1). `AddOnsPanel` owns whether it is open and re-reads the list after
 * a save.
 *
 * Every check here is the route's own (`addOnFromInput`), run first so the
 * refusal names its own box; the server's answer is drawn in the same place.
 *
 * **Portalled to `<body>`**, because Event edit is one big `<form>` and a
 * form may not hold another. React still bubbles the portal's submit up its
 * own tree to that outer form, so the submit handler stops it: without that,
 * saving an add-on would also save the whole event.
 */

/** An item as the panel holds it: the route's row, its date as JSON gives it. */
export type PanelAddOn = Omit<AdminAddOn, 'salesCloseAt'> & { salesCloseAt: string | null };
export type AddOnCategory = { id: string; name: string };

type Draft = {
  name: string;
  description: string;
  price: string;
  poster: string;
  optionKind: AddOnOptionKind;
  options: string;
  maxPerRunner: string;
  stockLimit: string;
  /** `YYYY-MM-DDTHH:mm` in Manila, AdminDatePicker's own value, or "". */
  salesCloseAt: string;
  categoryIds: string[];
  soldBy: AddOnSeller;
};

function draftFrom(addOn: PanelAddOn | null): Draft {
  if (!addOn) {
    return {
      name: '',
      description: '',
      price: '',
      poster: '',
      optionKind: 'NONE',
      options: '',
      maxPerRunner: '1',
      stockLimit: '',
      salesCloseAt: '',
      categoryIds: [],
      soldBy: 'ORGANIZER',
    };
  }
  const closes = addOn.salesCloseAt ? eventInstantParts(addOn.salesCloseAt) : null;
  return {
    name: addOn.name,
    description: addOn.description,
    price: (addOn.price / 100).toFixed(2),
    poster: addOn.imageUrls[0] ?? '',
    optionKind: addOn.optionKind as AddOnOptionKind,
    options: addOn.options.join(', '),
    maxPerRunner: String(addOn.maxPerRunner),
    stockLimit: addOn.stockLimit === null ? '' : String(addOn.stockLimit),
    salesCloseAt: closes ? `${closes.day}T${closes.time}` : '',
    categoryIds: addOn.categoryIds,
    soldBy: addOn.soldBy as AddOnSeller,
  };
}

/** The draft as the route reads it: one poster kept with any further images. */
function bodyFrom(draft: Draft, addOn: PanelAddOn | null) {
  const [day, time = ''] = draft.salesCloseAt.split('T');
  return {
    name: draft.name,
    description: draft.description,
    price: draft.price,
    imageUrls: [draft.poster, ...(addOn?.imageUrls.slice(1) ?? [])].filter(Boolean),
    optionKind: draft.optionKind,
    options: draft.options,
    maxPerRunner: draft.maxPerRunner,
    stockLimit: draft.stockLimit,
    salesCloseAt: draft.salesCloseAt ? (eventInstant(day, time)?.toISOString() ?? 'invalid') : '',
    categoryIds: draft.categoryIds,
    soldBy: draft.soldBy,
  };
}

const KIND_OPTIONS = ADD_ON_OPTION_KINDS.map(kind => ({
  value: kind,
  label:
    kind === 'SHIRT_SIZES'
      ? `${ADD_ON_OPTION_KIND_LABELS[kind]} (${SHIRT_SIZES[0]}–${SHIRT_SIZES[SHIRT_SIZES.length - 1]})`
      : ADD_ON_OPTION_KIND_LABELS[kind],
}));

const SELLER_HINTS: Record<AddOnSeller, string> = {
  ORGANIZER: 'Owed to the organizer in the remittance, like an entry.',
  RUN_AS_ONE: 'Run As One’s own merch: kept by Run As One, never owed.',
};

/** The segmented choice the promo form's "Applies to" uses: 44px, a check as well as a fill. */
function Segment({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-1.5 rounded-[8px] px-3 py-2 text-sm font-bold transition-colors max-sm:flex-1 max-sm:justify-center ${
        on ? 'bg-[var(--ink-10)] text-primary' : 'text-secondary hover:text-primary'
      }`}
    >
      {on && <Check size={14} aria-hidden="true" className="shrink-0" />}
      <span>{children}</span>
    </button>
  );
}

export default function AddOnFormModal({
  eventId,
  addOn,
  categories,
  onClose,
  onSaved,
}: {
  eventId: string;
  /** The item being edited, or null to add one. */
  addOn: PanelAddOn | null;
  categories: AddOnCategory[];
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(addOn));
  const [problem, setProblem] = useState<AddOnProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);

  const set = (patch: Partial<Draft>) => {
    setDraft(prev => ({ ...prev, ...patch }));
    setProblem(null);
  };
  const errorFor = (field: AddOnField) => (problem?.field === field ? problem.error : undefined);
  const invalid = (field: AddOnField) => (problem?.field === field ? true : undefined);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    // See the header: the event form behind this one must not submit too.
    event.stopPropagation();
    setProblem(null);

    const body = bodyFrom(draft, addOn);
    const checked = addOnFromInput(body, { eventCategoryIds: categories.map(category => category.id) });
    if ('problem' in checked) {
      setProblem(checked.problem);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        addOn ? `/api/admin/events/${eventId}/add-ons/${addOn.id}` : `/api/admin/events/${eventId}/add-ons`,
        {
          method: addOn ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem({
          field: (payload.field as AddOnField) ?? 'name',
          error: payload.error ?? 'The add-on could not be saved. Please try again.',
        });
        return;
      }
      onSaved(payload.addOn?.name ?? checked.data.name);
    } catch {
      setProblem({ field: 'name', error: 'The add-on could not be saved. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  };

  const sold = addOn?.sold ?? 0;

  return createPortal(
    <div className="fixed inset-0 bg-[var(--dash-scrim)] backdrop-blur-sm z-50 flex items-center justify-center p-4 max-sm:p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-on-form-title"
        className="admin-modal-panel bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-xl w-full max-w-lg overflow-clip"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2 max-sm:px-4 max-sm:pt-3 shrink-0">
          <h2 id="add-on-form-title" className="text-xl font-bold m-0 flex items-center gap-2 min-w-0">
            <ShoppingBag size={20} className="text-accent-orange-ink shrink-0" />
            {addOn ? 'Edit Add-on' : 'Add Add-on'}
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
          <form id="add-on-form" onSubmit={submit} className="flex flex-col gap-5" noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="add-on-name">
                Name <span className="text-[var(--status-danger)]">*</span>
              </label>
              <input
                id="add-on-name"
                type="text"
                className="form-input"
                value={draft.name}
                maxLength={MAX_ADD_ON_NAME_LENGTH}
                // Uppercase as typed, because that is how it is stored and
                // printed beside runner data (text-case.ts).
                placeholder="COMMEMORATIVE SHIRT"
                onChange={event => set({ name: upperCaseAsTyped(event.target.value) })}
                aria-invalid={invalid('name')}
                aria-describedby={problem?.field === 'name' ? 'add-on-name-error' : undefined}
              />
              <FieldError id="add-on-name-error" message={errorFor('name')} />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="add-on-description">
                Description <span className="text-secondary font-normal">(optional)</span>
              </label>
              <textarea
                id="add-on-description"
                className="form-input min-h-24"
                value={draft.description}
                maxLength={MAX_ADD_ON_DESCRIPTION_LENGTH}
                placeholder="Dri-fit, with the race-day print on the back."
                onChange={event => set({ description: event.target.value })}
                aria-invalid={invalid('description')}
                aria-describedby="add-on-description-hint"
              />
              <p id="add-on-description-hint" className="text-xs text-secondary">
                {draft.description.length} / {MAX_ADD_ON_DESCRIPTION_LENGTH} · shown to runners under the name.
              </p>
              <FieldError id="add-on-description-error" message={errorFor('description')} />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="add-on-price">
                Price (₱) <span className="text-[var(--status-danger)]">*</span>
              </label>
              <input
                id="add-on-price"
                type="text"
                inputMode="decimal"
                className="form-input"
                value={draft.price}
                placeholder="350.00"
                onChange={event => set({ price: event.target.value })}
                aria-invalid={invalid('price')}
                aria-describedby={problem?.field === 'price' ? 'add-on-price-error add-on-price-hint' : 'add-on-price-hint'}
              />
              <p id="add-on-price-hint" className="text-xs text-secondary">
                One price for every size. No platform fee, and promo codes never discount it.
              </p>
              <FieldError id="add-on-price-error" message={errorFor('price')} />
            </div>

            <PosterField
              value={draft.poster}
              onChange={url => set({ poster: url })}
              onError={message => setProblem({ field: 'imageUrls', error: message })}
              onBusyChange={busy => setUploading(n => (busy ? n + 1 : n - 1))}
              alt={draft.name || 'Add-on poster'}
              label="Poster"
              hint="a photo of the item, shown on its card"
            />
            <FieldError id="add-on-images-error" message={errorFor('imageUrls')} />

            <AdminSelect
              label="What the runner picks"
              value={draft.optionKind}
              options={KIND_OPTIONS}
              listboxLabel="What the runner picks"
              onChange={next => set({ optionKind: next as AddOnOptionKind })}
              error={errorFor('optionKind')}
              hint={
                draft.optionKind === 'SHIRT_SIZES'
                  ? 'The race shirt’s size chart. Pre-filled from the runner’s own shirt size.'
                  : draft.optionKind === 'CUSTOM'
                    ? 'Your own list below, like colours.'
                    : 'Nothing to choose: one kind of item.'
              }
            />

            {draft.optionKind === 'CUSTOM' && (
              <div className="form-group">
                <label className="form-label" htmlFor="add-on-options">
                  Options <span className="text-[var(--status-danger)]">*</span>
                </label>
                <input
                  id="add-on-options"
                  type="text"
                  className="form-input"
                  value={draft.options}
                  placeholder="BLACK, WHITE"
                  onChange={event => set({ options: upperCaseAsTyped(event.target.value) })}
                  aria-invalid={invalid('options')}
                  aria-describedby={problem?.field === 'options' ? 'add-on-options-error add-on-options-hint' : 'add-on-options-hint'}
                />
                <p id="add-on-options-hint" className="text-xs text-secondary">
                  Separated by commas. At least two.
                </p>
                <FieldError id="add-on-options-error" message={errorFor('options')} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <div className="form-group">
                <label className="form-label" htmlFor="add-on-max">
                  Most per runner
                </label>
                <input
                  id="add-on-max"
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  value={draft.maxPerRunner}
                  placeholder="1"
                  onChange={event => set({ maxPerRunner: event.target.value })}
                  aria-invalid={invalid('maxPerRunner')}
                  aria-describedby={problem?.field === 'maxPerRunner' ? 'add-on-max-error add-on-max-hint' : 'add-on-max-hint'}
                />
                <p id="add-on-max-hint" className="text-xs text-secondary">
                  1 to {MAX_ADD_ON_PER_RUNNER}.
                </p>
                <FieldError id="add-on-max-error" message={errorFor('maxPerRunner')} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="add-on-stock">
                  Stock <span className="text-secondary font-normal">(optional)</span>
                </label>
                <input
                  id="add-on-stock"
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  value={draft.stockLimit}
                  placeholder="No limit"
                  onChange={event => set({ stockLimit: event.target.value })}
                  aria-invalid={invalid('stockLimit')}
                  aria-describedby={problem?.field === 'stockLimit' ? 'add-on-stock-error add-on-stock-hint' : 'add-on-stock-hint'}
                />
                <p id="add-on-stock-hint" className="text-xs text-secondary">
                  {addOn ? `${sold} taken so far. ` : ''}Pieces on hand, every option together.
                </p>
                <FieldError id="add-on-stock-error" message={errorFor('stockLimit')} />
              </div>
            </div>

            <AdminDatePicker
              id="add-on-closes"
              label={
                <>
                  Sales close <span className="text-secondary font-normal">(optional)</span>
                </>
              }
              value={draft.salesCloseAt}
              onChange={next => set({ salesCloseAt: next })}
              withTime
              defaultTime="23:59"
              clearable
              placeholder="When registration closes"
              error={errorFor('salesCloseAt')}
              hint="Blank sells it until registration closes. Set one if the supplier needs the count early."
            />

            {categories.length > 1 && (
              <div className="form-group">
                <span className="form-label" id="add-on-scope-label">
                  Who can buy it
                </span>
                <div
                  role="group"
                  aria-labelledby="add-on-scope-label"
                  className="flex flex-wrap gap-1 rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-1"
                >
                  <Segment on={draft.categoryIds.length === 0} onClick={() => set({ categoryIds: [] })}>
                    All categories
                  </Segment>
                  {categories.map(category => (
                    <Segment
                      key={category.id}
                      on={draft.categoryIds.includes(category.id)}
                      onClick={() =>
                        set({
                          categoryIds: draft.categoryIds.includes(category.id)
                            ? draft.categoryIds.filter(id => id !== category.id)
                            : [...draft.categoryIds, category.id],
                        })
                      }
                    >
                      {category.name}
                    </Segment>
                  ))}
                </div>
                <FieldError id="add-on-scope-error" message={errorFor('categoryIds')} />
              </div>
            )}

            <div className="form-group">
              <span className="form-label" id="add-on-seller-label">
                Sold by
              </span>
              <div
                role="group"
                aria-labelledby="add-on-seller-label"
                aria-describedby="add-on-seller-hint"
                className="flex flex-wrap gap-1 rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-1"
              >
                {ADD_ON_SELLERS.map(seller => (
                  <Segment key={seller} on={draft.soldBy === seller} onClick={() => set({ soldBy: seller })}>
                    {ADD_ON_SELLER_LABELS[seller]}
                  </Segment>
                ))}
              </div>
              <p id="add-on-seller-hint" className="text-xs text-secondary">
                {SELLER_HINTS[draft.soldBy]} Orders already taken keep the seller they were sold under.
              </p>
              <FieldError id="add-on-seller-error" message={errorFor('soldBy')} />
            </div>
          </form>
        </div>

        <div className="admin-modal-footer px-6 pt-4 pb-6 max-sm:p-4 border-t border-[var(--dash-border)] shrink-0">
          {/* Saving mid-upload would store the item without its poster. */}
          <button type="submit" form="add-on-form" className="btn-light w-full" disabled={saving || uploading > 0}>
            {addOn ? <Pencil size={16} /> : <Plus size={16} />}
            {saving ? <BusyLabel>Saving</BusyLabel> : addOn ? 'Save Changes' : 'Add Add-on'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
