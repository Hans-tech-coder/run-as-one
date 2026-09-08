"use client";

import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, Plus, Tag, Ticket, X } from 'lucide-react';
import PromoActionsMenu from './PromoActionsMenu';
import { useRouter } from 'next/navigation';
import { useAlert } from '@/components/ui/AlertProvider';
import FieldError from '@/components/ui/FieldError';
import AdminSelect from '../AdminSelect';
import {
  DISCOUNT_TYPES,
  DISCOUNT_TYPE_LABELS,
  DiscountType,
  MAX_PROMO_CODE_LENGTH,
  describePromo,
  isExhausted,
  normalizePromoCode,
  promoConditions,
} from '@/lib/discount';
import { MAX_VOUCHER_BATCH } from '@/lib/voucher-codes';

/**
 * The organizer's discount codes: what exists, and the form that makes more.
 *
 * The table groups a bulk-generated batch into a single row. Two hundred
 * single-use vouchers are one promotion an organizer thinks about as one
 * thing, and listing them individually would bury every ordinary code beneath
 * them — so the batch row carries the promotion and opens to show the codes
 * when somebody actually needs to hand them out.
 */

type PromoRow = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  usageLimit: number | null;
  usageCount: number;
  validFrom: string | null;
  validUntil: string | null;
  minSubtotal: number | null;
  minRunners: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  batchLabel: string | null;
  automatic: boolean;
  eventId: string | null;
  event: { id: string; title: string } | null;
};

type EventOption = { id: string; title: string; date: string };

/** One line of the table: a single code, or a whole batch of vouchers. */
type Group = {
  key: string;
  /** The batch's name, or null for a code created on its own. */
  batchLabel: string | null;
  codes: PromoRow[];
  /**
   * Any member — they share every term except the code itself, and its `id`
   * is what an edit or a delete is aimed at. The route treats a batch as one
   * promotion, so any of them will do.
   */
  terms: PromoRow;
  used: number;
  /** Redemptions still available across the group, or null when unlimited. */
  left: number | null;
};

const ALL_EVENTS = '';

/** An empty form. Named once so opening and clearing cannot drift apart. */
const BLANK_FORM = {
  code: '',
  eventId: ALL_EVENTS,
  discountType: DISCOUNT_TYPES.PERCENTAGE as DiscountType,
  discountValue: '',
  buyQuantity: '',
  getQuantity: '',
  usageLimit: '',
  minSubtotal: '',
  minRunners: '',
  validFrom: '',
  validUntil: '',
  batchLabel: '',
  batchPrefix: '',
  batchCount: '',
};

/** How a runner comes to have this promotion. */
type Claim = 'CODE' | 'VOUCHERS' | 'AUTOMATIC';

const CLAIMS: { value: Claim; label: string; hint: string }[] = [
  {
    value: 'CODE',
    label: 'One shared code',
    hint: 'One code you publish, redeemable by anyone who has it, up to the limit you set.',
  },
  {
    value: 'VOUCHERS',
    label: 'Single-use vouchers',
    hint: 'A batch of distinct codes, each good for exactly one order. For invites and prizes.',
  },
  {
    value: 'AUTOMATIC',
    label: 'Automatic',
    hint: 'No code at all. It applies on its own to every order that meets the conditions below, and it is shown on the event page. This is what an early bird is.',
  },
];

export default function PromoCodesClient({
  initialPromos,
  events,
}: {
  initialPromos: PromoRow[];
  events: EventOption[];
}) {
  const router = useRouter();
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert, confirm } = useAlert();
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // The promotion the modal is editing, or null when it is creating one.
  // One form serves both, so an edit can never offer a field the create
  // form validates differently.
  const [editing, setEditing] = useState<Group | null>(null);

  // Which field the API refused, so the message lands under the control that
  // caused it rather than in a dialog that names none of them.
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);

  // How this promotion is claimed. Three shapes, one form: a shared code,
  // a batch of one-shot vouchers, or nothing to type at all.
  const [claim, setClaim] = useState<Claim>('CODE');
  const [form, setForm] = useState(BLANK_FORM);

  const set = (patch: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...patch }));
    setFieldError(null);
  };

  const openCreate = () => {
    setEditing(null);
    setClaim('CODE');
    setForm(BLANK_FORM);
    setFieldError(null);
    setShowModal(true);
  };

  const openEdit = (group: Group) => {
    setEditing(group);
    // The shape is not editable: turning a code into a codeless promotion
    // would take it away from everyone already holding the code. The
    // segmented control is hidden while editing for the same reason.
    setClaim(group.terms.automatic ? 'AUTOMATIC' : group.batchLabel ? 'VOUCHERS' : 'CODE');
    setForm(formFrom(group));
    setFieldError(null);
    setShowModal(true);
  };

  const groups = useMemo(() => groupPromos(initialPromos), [initialPromos]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFieldError(null);

    try {
      // An edit targets any member of the group: the route treats a batch as
      // the one promotion the table already shows it to be.
      const res = await fetch(
        editing ? `/api/admin/promos/${editing.terms.id}` : '/api/admin/promos',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            eventId: form.eventId || null,
            // A batch is what the count turns this into; the other two
            // shapes send none, which is what the route branches on.
            batchCount: claim === 'VOUCHERS' ? form.batchCount : '',
            automatic: claim === 'AUTOMATIC',
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        if (data?.field) {
          setFieldError({ field: data.field, message: data.error });
          return;
        }
        throw new Error(data.error || 'Failed to save');
      }

      setShowModal(false);
      setEditing(null);
      setClaim('CODE');
      setForm(BLANK_FORM);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyCodes = async (group: Group) => {
    try {
      await navigator.clipboard.writeText(group.codes.map(c => c.code).join('\n'));
      setCopied(group.key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      alert('Your browser would not let us reach the clipboard. Select the codes and copy them by hand.');
    }
  };

  const handleDelete = async (group: Group) => {
    const name = group.batchLabel ?? group.terms.code;
    const many = group.codes.length > 1;

    // The redemption count is the fact that changes the decision, so it is
    // in the question rather than discovered afterwards. Deleting is safe
    // for those orders — Registration.promoCode and discountAmount are
    // snapshots taken at checkout — and saying so is what stops an
    // organizer assuming it will unwind a discount somebody already had.
    const used =
      group.used > 0
        ? ` It has been used ${group.used} time${group.used === 1 ? '' : 's'}; those registrations keep the discount they were given.`
        : '';

    const ok = await confirm({
      title: `Delete ${name}?`,
      message: many
        ? `All ${group.codes.length} vouchers in this batch will stop working, and any that have not been claimed cannot be recovered.${used}`
        : `Runners will no longer be able to use this ${group.terms.automatic ? 'promotion' : 'code'}.${used}`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/promos/${group.terms.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const errorFor = (field: string) =>
    fieldError?.field === field ? fieldError.message : undefined;

  const type = form.discountType;

  return (
    <>
      <div className="admin-panel">
        <div className="admin-panel-header">
          <h2 className="admin-panel-title">Discount Codes</h2>
          <button
            onClick={openCreate}
            className="btn-gradient px-4 py-2 flex items-center gap-2 text-sm"
          >
            <Plus size={16} /> New Promotion
          </button>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Applies To</th>
                <th>Conditions</th>
                <th>Used</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-secondary">
                    No promotions yet. A code you create here is redeemed by runners in the
                    registration wizard, and an automatic promotion applies on its own.
                  </td>
                </tr>
              ) : (
                groups.map(group => {
                  const isBatch = group.codes.length > 1;
                  const isOpen = expanded === group.key;
                  const spent = group.left !== null && group.left <= 0;

                  return (
                    <React.Fragment key={group.key}>
                      <tr>
                        <td>
                          {isBatch ? (
                            <button
                              type="button"
                              onClick={() => setExpanded(isOpen ? null : group.key)}
                              aria-expanded={isOpen}
                              className="flex items-center gap-2 text-left"
                            >
                              <ChevronDown
                                size={14}
                                aria-hidden="true"
                                className={`text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
                              />
                              <span>
                                <span className="font-bold text-accent-blue block">
                                  {group.batchLabel}
                                </span>
                                <span className="text-xs text-secondary">
                                  {group.codes.length} single-use vouchers
                                </span>
                              </span>
                            </button>
                          ) : (
                            <span>
                              <span className="font-bold text-accent-blue block">
                                {group.terms.code}
                              </span>
                              {/* Naming it here rather than in a column of
                                  its own: what an organizer needs at a glance
                                  is whether this is something they have to
                                  hand out. */}
                              {group.terms.automatic && (
                                <span className="text-xs text-secondary">
                                  Automatic &middot; no code to give out
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td>{describePromo(group.terms)}</td>
                        <td className="text-secondary">
                          {group.terms.event ? group.terms.event.title : 'All my events'}
                        </td>
                        <td className="text-secondary text-xs">
                          {promoConditions(group.terms).join(' \u00b7 ') || '—'}
                        </td>
                        <td>
                          {group.used}
                          {group.left !== null && (
                            <span className="text-secondary"> / {group.used + group.left}</span>
                          )}
                        </td>
                        <td>
                          <span className={`status-badge ${spent ? 'neutral' : 'success'}`}>
                            {spent ? 'Fully Used' : 'Active'}
                          </span>
                        </td>
                        {/* The menu sits at the column's left edge, under its
                            own header, rather than pushed to the row's right
                            edge — standing rule, and the same thing the events
                            and registrants tables do. */}
                        <td>
                          <div className="action-dropdown-container flex">
                            <PromoActionsMenu
                              label={group.batchLabel ?? group.terms.code}
                              onEdit={() => openEdit(group)}
                              onDelete={() => handleDelete(group)}
                            />
                          </div>
                        </td>
                      </tr>

                      {isBatch && isOpen && (
                        <tr>
                          <td colSpan={7} className="bg-black/30">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs uppercase tracking-wider text-secondary">
                                Vouchers in {group.batchLabel}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyCodes(group)}
                                className="flex items-center gap-2 text-xs font-bold text-white hover:text-accent-orange transition-colors"
                              >
                                {copied === group.key ? <Check size={14} /> : <Copy size={14} />}
                                {copied === group.key ? 'Copied' : 'Copy all codes'}
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {group.codes.map(voucher => (
                                <span
                                  key={voucher.id}
                                  className={`rounded-md border px-2.5 py-1 font-mono text-xs ${
                                    voucher.usageCount > 0
                                      ? 'border-white/5 bg-white/5 text-secondary line-through'
                                      : 'border-white/10 bg-black/40 text-white'
                                  }`}
                                >
                                  {voucher.code}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#111] border border-white/10 rounded-xl w-full max-w-lg p-6 relative my-8">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-secondary hover:text-white"
              aria-label="Close"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Tag size={20} className="text-accent-orange" />
              {editing ? 'Edit Promotion' : 'Create Discount'}
            </h2>

            {/* What an edit cannot change, said once at the top rather than
                as a surprise on a greyed-out field further down. */}
            {editing && (
              <p className="mb-6 text-sm text-secondary">
                {editing.batchLabel
                  ? `Editing all ${editing.codes.length} vouchers in this batch. The codes themselves stay as they are, and each stays single-use.`
                  : editing.used > 0
                    ? `Used ${editing.used} time${editing.used === 1 ? '' : 's'} already. Those registrations keep the discount they were given — a change here only affects new ones.`
                    : 'Not used yet, so a change here affects every registration from now on.'}
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* Scope first: what a code is worth reads differently once you
                  know whether it is for one race or all of them. */}
              <AdminSelect
                label="Applies to"
                listboxLabel="Event this code applies to"
                value={form.eventId}
                onChange={next => set({ eventId: next })}
                error={errorFor('eventId')}
                options={[
                  { value: ALL_EVENTS, label: 'All my events', hint: 'Every event you run, now and later' },
                  ...events.map(event => ({
                    value: event.id,
                    label: event.title,
                    hint: event.date,
                  })),
                ]}
              />

              <AdminSelect
                label="Discount type"
                listboxLabel="Kind of discount"
                value={type}
                onChange={next => set({ discountType: next as DiscountType })}
                error={errorFor('discountType')}
                options={[
                  { value: DISCOUNT_TYPES.PERCENTAGE, label: DISCOUNT_TYPE_LABELS.PERCENTAGE, hint: 'A share of the entry fees' },
                  { value: DISCOUNT_TYPES.FIXED, label: DISCOUNT_TYPE_LABELS.FIXED, hint: 'A flat peso amount off' },
                  { value: DISCOUNT_TYPES.FREE_DELIVERY, label: DISCOUNT_TYPE_LABELS.FREE_DELIVERY, hint: 'Waives the race-kit delivery fee' },
                  { value: DISCOUNT_TYPES.BUY_X_GET_Y, label: DISCOUNT_TYPE_LABELS.BUY_X_GET_Y, hint: 'Register 5, the 6th is free' },
                ]}
              />

              {type === DISCOUNT_TYPES.PERCENTAGE && (
                <div className="form-group">
                  <label className="form-label" htmlFor="promo-value">Percentage off</label>
                  <input
                    id="promo-value"
                    type="number"
                    min="1"
                    max="100"
                    step="0.5"
                    className="form-input"
                    placeholder="10"
                    aria-invalid={errorFor('discountValue') ? true : undefined}
                    value={form.discountValue}
                    onChange={e => set({ discountValue: e.target.value })}
                  />
                  <FieldError id="promo-value-error" message={errorFor('discountValue')} />
                </div>
              )}

              {type === DISCOUNT_TYPES.FIXED && (
                <div className="form-group">
                  <label className="form-label" htmlFor="promo-value">Amount off (₱)</label>
                  <input
                    id="promo-value"
                    type="number"
                    min="1"
                    step="0.01"
                    className="form-input"
                    placeholder="200"
                    aria-invalid={errorFor('discountValue') ? true : undefined}
                    value={form.discountValue}
                    onChange={e => set({ discountValue: e.target.value })}
                  />
                  <FieldError id="promo-value-error" message={errorFor('discountValue')} />
                </div>
              )}

              {type === DISCOUNT_TYPES.FREE_DELIVERY && (
                <p className="text-xs text-secondary -mt-2">
                  Takes the whole delivery fee off. A runner who chose to collect their race kit
                  themselves has no fee to waive, and is told so rather than shown a discount of
                  nothing.
                </p>
              )}

              {type === DISCOUNT_TYPES.BUY_X_GET_Y && (
                <>
                  <div className="flex gap-4">
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-buy">Register</label>
                      <input
                        id="promo-buy"
                        type="number"
                        min="1"
                        className="form-input"
                        placeholder="5"
                        aria-invalid={errorFor('buyQuantity') ? true : undefined}
                        value={form.buyQuantity}
                        onChange={e => set({ buyQuantity: e.target.value })}
                      />
                      <FieldError id="promo-buy-error" message={errorFor('buyQuantity')} />
                    </div>
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-get">Get free</label>
                      <input
                        id="promo-get"
                        type="number"
                        min="1"
                        className="form-input"
                        placeholder="1"
                        aria-invalid={errorFor('getQuantity') ? true : undefined}
                        value={form.getQuantity}
                        onChange={e => set({ getQuantity: e.target.value })}
                      />
                      <FieldError id="promo-get-error" message={errorFor('getQuantity')} />
                    </div>
                  </div>
                  <p className="text-xs text-secondary -mt-2">
                    Counted per whole group on one order, and the cheapest entries are the free
                    ones. Register 5 and get 1 means a group of six pays for five.
                  </p>
                </>
              )}

              {/* How the runner claims it. An automatic promotion is the one
                  nobody has to be told about: it applies on its own to any
                  order that meets the conditions below.

                  Hidden while editing: turning a code into a codeless
                  promotion would take it away from everyone already holding
                  the code, and the reverse would leave a promotion nobody
                  was ever told about. Creating the other one is the honest
                  way, and the route refuses the change too. */}
              <div className="form-group" hidden={Boolean(editing)}>
                <span className="form-label">How runners get it</span>
                <div className="flex rounded-[10px] border border-white/10 bg-black/30 p-1">
                  {CLAIMS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => { setClaim(option.value); setFieldError(null); }}
                      aria-pressed={claim === option.value}
                      className={`flex-1 rounded-[8px] px-3 py-2 text-sm font-bold transition-colors ${
                        claim === option.value
                          ? 'bg-white/10 text-white'
                          : 'text-secondary hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-secondary">
                  {CLAIMS.find(option => option.value === claim)?.hint}
                </p>
              </div>

              {claim === 'AUTOMATIC' ? (
                <div className="form-group">
                  <label className="form-label" htmlFor="promo-name">Promotion name</label>
                  <input
                    id="promo-name"
                    type="text"
                    maxLength={MAX_PROMO_CODE_LENGTH}
                    className="form-input"
                    placeholder="EARLY BIRD"
                    aria-invalid={errorFor('code') ? true : undefined}
                    value={form.code}
                    onChange={e => set({ code: normalizePromoCode(e.target.value) })}
                  />
                  <FieldError id="promo-name-error" message={errorFor('code')} />
                  <p className="text-xs text-secondary">
                    Nobody types this — it is what the runner sees on the event page and
                    on their receipt, so name it the way you would say it out loud.
                  </p>
                </div>
              ) : claim === 'VOUCHERS' ? (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="promo-batch">Batch name</label>
                    <input
                      id="promo-batch"
                      type="text"
                      className="form-input"
                      placeholder="Summer VIP invites"
                      aria-invalid={errorFor('batchLabel') ? true : undefined}
                      value={form.batchLabel}
                      onChange={e => set({ batchLabel: e.target.value })}
                      // The label is what groups these rows into one
                      // promotion, so renaming it would split the batch in
                      // two rather than rename it.
                      disabled={Boolean(editing)}
                    />
                    <FieldError id="promo-batch-error" message={errorFor('batchLabel')} />
                  </div>
                  <div className="flex gap-4" hidden={Boolean(editing)}>
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-prefix">Code prefix (optional)</label>
                      <input
                        id="promo-prefix"
                        type="text"
                        className="form-input"
                        placeholder="SUMMER"
                        value={form.batchPrefix}
                        onChange={e => set({ batchPrefix: normalizePromoCode(e.target.value) })}
                      />
                    </div>
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-count">How many</label>
                      <input
                        id="promo-count"
                        type="number"
                        min="1"
                        max={MAX_VOUCHER_BATCH}
                        className="form-input"
                        placeholder="50"
                        aria-invalid={errorFor('batchCount') ? true : undefined}
                        value={form.batchCount}
                        onChange={e => set({ batchCount: e.target.value })}
                      />
                      <FieldError id="promo-count-error" message={errorFor('batchCount')} />
                    </div>
                  </div>
                  {!editing && (
                    <p className="text-xs text-secondary -mt-2">
                      Each voucher is redeemable once. Codes are random rather than numbered,
                      so handing one out does not hand out the rest.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="promo-code">Code</label>
                    <input
                      id="promo-code"
                      type="text"
                      maxLength={MAX_PROMO_CODE_LENGTH}
                      className="form-input"
                      placeholder="EARLYBIRD20"
                      aria-invalid={errorFor('code') ? true : undefined}
                      value={form.code}
                      onChange={e => set({ code: normalizePromoCode(e.target.value) })}
                    />
                    <FieldError id="promo-code-error" message={errorFor('code')} />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="promo-limit">
                      Total uses (leave blank for unlimited)
                    </label>
                    <input
                      id="promo-limit"
                      type="number"
                      min="1"
                      className="form-input"
                      value={form.usageLimit}
                      onChange={e => set({ usageLimit: e.target.value })}
                    />
                  </div>
                </>
              )}

              <details className="rounded-[10px] border border-white/10 bg-black/20 p-4">
                <summary className="cursor-pointer text-sm font-bold text-white">
                  Conditions (optional)
                </summary>
                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex gap-4">
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-min-spend">Minimum spend (₱)</label>
                      <input
                        id="promo-min-spend"
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-input"
                        value={form.minSubtotal}
                        onChange={e => set({ minSubtotal: e.target.value })}
                      />
                    </div>
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-min-runners">Minimum runners</label>
                      <input
                        id="promo-min-runners"
                        type="number"
                        min="1"
                        className="form-input"
                        value={form.minRunners}
                        onChange={e => set({ minRunners: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-from">Starts</label>
                      <input
                        id="promo-from"
                        type="date"
                        className="form-input"
                        style={{ colorScheme: 'dark' }}
                        value={form.validFrom}
                        onChange={e => set({ validFrom: e.target.value })}
                      />
                    </div>
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-until">Ends</label>
                      <input
                        id="promo-until"
                        type="date"
                        className="form-input"
                        style={{ colorScheme: 'dark' }}
                        aria-invalid={errorFor('validUntil') ? true : undefined}
                        value={form.validUntil}
                        onChange={e => set({ validUntil: e.target.value })}
                      />
                      <FieldError id="promo-until-error" message={errorFor('validUntil')} />
                    </div>
                  </div>
                  <p className="text-xs text-secondary">
                    Dates are Manila days: a code that ends on the 30th works to the end of the
                    30th. The minimum is on the entry fees, not on the platform fee.
                  </p>
                </div>
              </details>

              <button
                type="submit"
                className="btn-gradient w-full mt-2 flex items-center justify-center gap-2"
                disabled={isSubmitting}
              >
                {claim === 'VOUCHERS' ? <Ticket size={16} /> : <Tag size={16} />}
                {isSubmitting
                  ? 'Saving'
                  : editing
                    ? 'Save Changes'
                    : claim === 'VOUCHERS'
                      ? 'Generate Vouchers'
                      : claim === 'AUTOMATIC'
                        ? 'Create Automatic Promotion'
                        : 'Create Promo Code'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * One row per promotion: a batch's vouchers collapse into their label, and a
 * code created on its own stands alone.
 */
function groupPromos(promos: PromoRow[]): Group[] {
  const groups = new Map<string, Group>();

  for (const promo of promos) {
    const key = promo.batchLabel ? `batch:${promo.batchLabel}` : `code:${promo.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.codes.push(promo);
      existing.used += promo.usageCount;
      if (existing.left !== null) {
        existing.left += remaining(promo) ?? 0;
      }
      continue;
    }
    groups.set(key, {
      key,
      batchLabel: promo.batchLabel,
      codes: [promo],
      terms: promo,
      used: promo.usageCount,
      left: remaining(promo),
    });
  }

  return [...groups.values()];
}

/** Redemptions still available on one code, or null when it is unlimited. */
function remaining(promo: PromoRow): number | null {
  if (!promo.usageLimit || promo.usageLimit <= 0) return null;
  return isExhausted(promo) ? 0 : promo.usageLimit - promo.usageCount;
}

/**
 * A stored promotion back into the form that made it.
 *
 * The units have to be undone as carefully as they were applied: basis points
 * become a percentage again and centavos become pesos, because those are what
 * the organizer typed. Getting this backwards would show a ₱200 discount as
 * ₱20,000 and invite them to "correct" it.
 */
function formFrom(group: Group): typeof BLANK_FORM {
  const promo = group.terms;
  return {
    ...BLANK_FORM,
    // A batch has no single code to show; its name is the batch label.
    code: group.batchLabel ?? promo.code,
    eventId: promo.eventId ?? ALL_EVENTS,
    discountType: (promo.discountType as DiscountType) ?? DISCOUNT_TYPES.PERCENTAGE,
    discountValue:
      promo.discountType === DISCOUNT_TYPES.PERCENTAGE
        ? String(promo.discountValue / 100)
        : promo.discountType === DISCOUNT_TYPES.FIXED
          ? String(promo.discountValue / 100)
          : '',
    buyQuantity: promo.buyQuantity ? String(promo.buyQuantity) : '',
    getQuantity: promo.getQuantity ? String(promo.getQuantity) : '',
    usageLimit: promo.usageLimit ? String(promo.usageLimit) : '',
    minSubtotal: promo.minSubtotal ? String(promo.minSubtotal / 100) : '',
    minRunners: promo.minRunners ? String(promo.minRunners) : '',
    // The date inputs want a Manila calendar day, not an instant: a window
    // that ends at 23:59 Manila is already the next day in UTC, and reading it
    // back as one would move every end date forward by a day on every save.
    validFrom: manilaCalendarDay(promo.validFrom),
    validUntil: manilaCalendarDay(promo.validUntil),
    batchLabel: group.batchLabel ?? '',
  };
}

/** An ISO instant as the `YYYY-MM-DD` a Manila organizer meant by it. */
function manilaCalendarDay(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  // en-CA formats as YYYY-MM-DD, which is what <input type="date"> wants.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
}
