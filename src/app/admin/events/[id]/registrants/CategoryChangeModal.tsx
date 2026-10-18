"use client";

/**
 * Change category: moving one paid runner to another option of their race
 * (CATEGORY_CHANGE_PLAN.md, Session 2), opened from the row menu.
 *
 * **The quote is live and is the server's own arithmetic.** The modal reads the
 * runner, the order's money and every option once (`?preview=1`), then runs
 * `quoteCategoryChange` — the same function the route writes with — on every
 * pick and keystroke, so staff see the exact figure that will be recorded
 * before they confirm. The route recomputes it under the event lock; nothing
 * posted from here is trusted as a figure.
 *
 * It shows what the figure stands on (D3): the amount the runner is taken to
 * have paid, beside the order's real total, with an *Estimated* warning and
 * its reason when an order-level discount or a free order makes it a guess,
 * and the field to adjust it with a required reason. The kit difference (D7)
 * and the race's refund policy (D5) are said in words before the button, and
 * the button names its effect ("Change to 10K").
 *
 * An upgrade — anything with money to collect — asks how it is paid
 * (`CategoryChangePaymentChoice.tsx`, Session 3): a payment link with the
 * transaction fee on top, GCash or bank to come, or GCash or bank already
 * paid, recorded in the same step. The first two hold the seat and email the
 * runner how to pay; the runner moves once the money is in.
 *
 * Built on the remarks modal's panel, like the follow-up modal, and its option
 * tiles are that modal's radio tiles. Its state, the fetches and the table's
 * side of every change live in `useCategoryChangeModal.ts`.
 */

import React, { useEffect, useState } from 'react';
import { X, TriangleAlert } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { formatPesos } from '@/lib/money';
import { CATEGORY_CHANGE_STATUSES, asDowngradeRefundPolicy, kitDifference } from '@/lib/category-change';
import { CHANGE_PAYMENT_CHOICES } from '@/lib/category-change-hold';
import CategoryChangeQuote from './CategoryChangeQuote';
import CategoryChangePaymentChoice from './CategoryChangePaymentChoice';
import type { useCategoryChangeModal } from './useCategoryChangeModal';

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

export default function CategoryChangeModal({
  runner,
  preview,
  loadError,
  isOpen,
  isClosing,
  isSaving,
  toCategoryId,
  setToCategoryId,
  reason,
  setReason,
  adjusting,
  setAdjusting,
  basisText,
  setBasisText,
  basisReason,
  setBasisReason,
  adjustmentError,
  pendingBasis,
  quote,
  needsPayment,
  onlineMethod,
  onlineFee,
  paymentChoice,
  setPaymentChoice,
  transactionNumber,
  setTransactionNumber,
  proofFile,
  setProofFile,
  paymentErrors,
  onClose,
  onSave,
}: ReturnType<typeof useCategoryChangeModal>['modalProps']) {
  // The quote's own fields are announced once settled, not on every keystroke.
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => {
      setAnnounce(
        quote.status === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT
          ? `Runner would pay ${peso(quote.totalCharged)}`
          : quote.refundAmount > 0
            ? `Refund due ${peso(quote.refundAmount)}`
            : 'Nothing to pay',
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [quote]);

  const current = preview?.categories.find(c => c.id === preview.runner.categoryId) ?? null;
  const target = preview?.categories.find(c => c.id === toCategoryId) ?? null;
  const eligibility = preview?.eligibility;
  // SAME_CATEGORY is the preview's answer before a pick, not a refusal.
  const refused = eligibility && !eligibility.allowed && eligibility.reason !== 'SAME_CATEGORY' ? eligibility : null;
  const kit = current && target ? kitDifference(current.inclusions, target.inclusions) : null;
  const policy = preview ? asDowngradeRefundPolicy(preview.event.downgradeRefundPolicy) : null;
  const canSave = !!quote && !refused && !isSaving && !(adjusting && adjustmentError);
  const saveLabel = !target
    ? 'Change Category'
    : !needsPayment || !paymentChoice || paymentChoice === CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID
      ? `Change to ${target.name}`
      : paymentChoice === CHANGE_PAYMENT_CHOICES.ONLINE
        ? 'Hold Seat & Send Link'
        : 'Hold Seat & Email Runner';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isOpen && !isClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-change-title"
        className={`t-modal admin-modal-panel admin-modal-sheet w-full max-w-xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-clip ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id="category-change-title" className="text-xl font-semibold text-primary m-0">Change Category</h3>
            {runner && (
              <p className="text-sm text-secondary mt-1 m-0 [overflow-wrap:anywhere]">
                {runner.name} &middot; {runner.runnerRef}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body p-6 max-sm:p-4 overflow-y-auto flex-1 space-y-5 text-sm">
          {loadError && (
            <p role="alert" className="m-0 text-[var(--status-danger)]">{loadError}</p>
          )}
          {!preview && !loadError && (
            <p className="m-0 text-[var(--text-muted)]"><BusyLabel>Loading this runner</BusyLabel></p>
          )}

          {preview && refused && (
            <div role="alert" className="flex gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-primary">
              <TriangleAlert size={18} className="shrink-0 text-[var(--status-warning)]" aria-hidden="true" />
              <p className="m-0">{refused.message}</p>
            </div>
          )}

          {preview && !refused && (
            <>
              <fieldset className="p-0 border-none m-0">
                <legend className="block text-secondary mb-2 p-0">Move to</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {preview.categories.map(category => {
                    const isCurrent = category.id === preview.runner.categoryId;
                    const disabled = isCurrent || category.full;
                    const selected = category.id === toCategoryId;
                    const left = category.slotLimit ? Math.max(0, category.slotLimit - category.taken) : null;
                    return (
                      <label
                        key={category.id}
                        className={`flex min-h-11 items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ink-30)] ${
                          disabled
                            ? 'cursor-not-allowed border-[var(--dash-border)] bg-[var(--ink-02)] opacity-60'
                            : selected
                              ? 'cursor-pointer border-accent-blue bg-accent-blue/10'
                              : 'cursor-pointer border-[var(--dash-border)] bg-[var(--ink-02)] hover:border-[var(--ink-20)]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="category-change-target"
                          value={category.id}
                          checked={selected}
                          disabled={disabled}
                          onChange={() => setToCategoryId(category.id)}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                            selected ? 'border-accent-blue bg-accent-blue shadow-[inset_0_0_0_2px_var(--dash-panel-solid)]' : 'border-[var(--ink-30)]'
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`text-primary ${selected ? 'font-semibold' : 'font-medium'}`}>{category.name}</span>
                            <span className="text-secondary tabular-nums whitespace-nowrap">{peso(category.price)}</span>
                          </span>
                          <span className="block text-xs text-[var(--text-muted)]">
                            {isCurrent
                              ? 'Current category'
                              : category.full
                                ? 'Full'
                                : left !== null
                                  ? `${left} ${left === 1 ? 'slot' : 'slots'} left`
                                  : 'No slot limit'}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {quote && target && current && (
                <CategoryChangeQuote
                  quote={quote}
                  preview={preview}
                  current={current}
                  target={target}
                  kit={kit}
                  policy={policy}
                  pendingBasis={pendingBasis}
                  announce={announce}
                />
              )}

              {quote && needsPayment && (
                <CategoryChangePaymentChoice
                  amount={quote.amount}
                  onlineFee={onlineFee}
                  onlineMethod={onlineMethod}
                  choice={paymentChoice}
                  setChoice={setPaymentChoice}
                  transactionNumber={transactionNumber}
                  setTransactionNumber={setTransactionNumber}
                  proofFile={proofFile}
                  setProofFile={setProofFile}
                  errors={paymentErrors}
                />
              )}

              {quote && current && (
                <div className="space-y-3">
                  {!adjusting ? (
                    <button
                      type="button"
                      onClick={() => setAdjusting(true)}
                      className="min-h-11 text-sm font-medium text-accent-blue-ink hover:underline bg-transparent border-none p-0 cursor-pointer"
                    >
                      Runner paid a different amount?
                    </button>
                  ) : (
                    <div className="space-y-3 rounded-lg border border-[var(--dash-border)] p-3">
                      {/* Said in plain words, because staff meet this rarely: the
                          computed amount is right for almost every order (D3). */}
                      <p className="m-0 text-xs text-secondary">
                        Only use this if {peso(quote.computedBasis)} is not what the runner really paid for their{' '}
                        {current.name} entry, for example the {current.name} price changed after they registered. What
                        they pay or get back is worked out from the amount you enter.
                      </p>
                      <div className="space-y-1.5">
                        <label htmlFor="category-change-basis" className="block text-secondary">
                          What the runner really paid for {current.name} (₱)
                        </label>
                        <input
                          id="category-change-basis"
                          // Never autofilled: a browser's remembered amount here would
                          // quietly change what the runner is charged or refunded.
                          autoComplete="off"
                          inputMode="decimal"
                          value={basisText}
                          onChange={e => setBasisText(e.target.value)}
                          placeholder={formatPesos(quote.computedBasis).replace(/,/g, '')}
                          aria-invalid={!!adjustmentError && !adjustmentError.startsWith('Say')}
                          aria-describedby="category-change-basis-error"
                          className="form-input w-full text-base"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="category-change-basis-reason" className="block text-secondary">
                          Why is it different from {peso(quote.computedBasis)}?
                        </label>
                        <input
                          id="category-change-basis-reason"
                          autoComplete="off"
                          value={basisReason}
                          onChange={e => setBasisReason(e.target.value)}
                          placeholder={`e.g. Paid ₱800 before the ${current.name} price went up`}
                          aria-invalid={!!adjustmentError && adjustmentError.startsWith('Say')}
                          aria-describedby="category-change-basis-error category-change-basis-reason-hint"
                          className="form-input w-full text-base"
                        />
                        {pendingBasis !== null && !adjustmentError && (
                          <p id="category-change-basis-reason-hint" className="m-0 text-xs text-[var(--status-warning)]">
                            Add a reason to use this amount. Until then the quote stays at {peso(quote.computedBasis)}.
                          </p>
                        )}
                      </div>
                      <FieldError id="category-change-basis-error" message={adjustmentError ?? undefined} />
                      <button
                        type="button"
                        onClick={() => {
                          setAdjusting(false);
                          setBasisText('');
                          setBasisReason('');
                        }}
                        className="min-h-11 text-sm text-secondary hover:text-primary bg-transparent border-none p-0 cursor-pointer"
                      >
                        Never mind, keep {peso(quote.computedBasis)}
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor="category-change-reason" className="block text-secondary">
                      What the runner asked for <span className="text-[var(--text-muted)]">(optional)</span>
                    </label>
                    <input
                      id="category-change-reason"
                      autoComplete="off"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      maxLength={300}
                      placeholder="e.g. Asked by Messenger to move up to the 10K"
                      className="form-input w-full text-base"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end gap-3 bg-[var(--dash-sunken)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-11 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            {refused || loadError ? 'Close' : 'Cancel'}
          </button>
          {!refused && !loadError && (
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="px-6 py-2 min-h-11 bg-[var(--dash-inverse-bg)] text-[var(--dash-inverse-fg)] rounded-lg text-sm font-medium hover:bg-[var(--dash-inverse-hover)] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {isSaving ? <BusyLabel>{needsPayment && paymentChoice !== CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID ? 'Holding seat' : 'Changing'}</BusyLabel> : saveLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
