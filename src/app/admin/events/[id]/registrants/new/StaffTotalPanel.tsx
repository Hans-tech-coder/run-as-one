"use client";

import React from 'react';
import { TicketPercent } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { formatPesos } from '@/lib/money';
import type { Quote } from './staff-registration';

/**
 * The staff registration form's Total: the promo code, and the server's quote
 * of the order as it stands (`…/registrations/quote`), so the amount a
 * validator checks against the screenshot is the amount the save checks.
 */
export default function StaffTotalPanel({
  runnerCount,
  promoInput,
  setPromoInput,
  appliedCode,
  applyCode,
  allCategorized,
  quote,
  quoteError,
  quoting,
  disabled,
}: {
  runnerCount: number;
  promoInput: string;
  setPromoInput: (next: string) => void;
  appliedCode: string;
  applyCode: (code: string) => void;
  allCategorized: boolean;
  quote: Quote | null;
  quoteError: string;
  quoting: boolean;
  disabled: boolean;
}) {
  const discount = quote?.discount ?? 0;
  return (
    <section className="admin-panel" aria-labelledby="staff-total-title">
      <div className="admin-panel-header">
        <h2 id="staff-total-title" className="admin-panel-title">Total</h2>
      </div>
      <div className="admin-panel-content flex flex-col gap-5">
        <div className="form-group">
          <label className="form-label" htmlFor="staff-order-promo">
            Promo Code <span className="text-xs opacity-70">- optional</span>
          </label>
          <div className="flex gap-2 max-sm:flex-col">
            <input
              id="staff-order-promo"
              value={promoInput}
              onChange={ev => setPromoInput(ev.target.value.toUpperCase())}
              onKeyDown={ev => {
                if (ev.key === 'Enter') {
                  ev.preventDefault();
                  applyCode(promoInput.trim());
                }
              }}
              className="form-input flex-1"
              disabled={disabled}
            />
            <button
              type="button"
              className="btn-light inline-flex items-center justify-center gap-2 min-h-11"
              onClick={() => applyCode(appliedCode === promoInput.trim() && promoInput ? '' : promoInput.trim())}
              disabled={disabled || (!promoInput.trim() && !appliedCode)}
            >
              <TicketPercent size={16} aria-hidden="true" />
              {appliedCode && appliedCode === promoInput.trim() ? 'Remove Code' : 'Apply Code'}
            </button>
          </div>
          {quote?.promoApplied && (
            <p className="m-0 text-xs text-[var(--status-success)]">{quote.promoApplied} applied.</p>
          )}
        </div>

        <div id="staff-total" tabIndex={-1} aria-live="polite" className="outline-none">
          {!allCategorized ? (
            <p className="m-0 text-sm text-secondary">Choose every runner’s category to see the total.</p>
          ) : quoteError && !quote ? (
            <FieldError id="staff-total-error" message={quoteError} />
          ) : quote ? (
            <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-secondary">Subtotal · {runnerCount} {runnerCount === 1 ? 'runner' : 'runners'}</dt>
              <dd className="m-0 text-right tabular-nums text-primary">{formatPesos(quote.subtotal)}</dd>
              {(quote.addOnTotal ?? 0) > 0 && (
                <>
                  <dt className="text-secondary">Add-ons</dt>
                  <dd className="m-0 text-right tabular-nums text-primary">{formatPesos(quote.addOnTotal)}</dd>
                </>
              )}
              {quote.deliveryFee > 0 && (
                <>
                  <dt className="text-secondary">Delivery</dt>
                  <dd className="m-0 text-right tabular-nums text-primary">{formatPesos(quote.deliveryFee)}</dd>
                </>
              )}
              {discount > 0 && (
                <>
                  <dt className="text-secondary">Discount</dt>
                  <dd className="m-0 text-right tabular-nums text-primary">−{formatPesos(discount)}</dd>
                </>
              )}
              <dt className="text-secondary">Platform fee</dt>
              <dd className="m-0 text-right tabular-nums text-primary">{formatPesos(quote.platformFee ?? 0)}</dd>
              <dt className="pt-2 mt-1 border-t border-[var(--dash-border)] font-semibold text-primary">The runner should have paid</dt>
              <dd className="m-0 pt-2 mt-1 border-t border-[var(--dash-border)] text-right tabular-nums font-semibold text-primary text-base">
                {formatPesos(quote.total ?? 0)}
              </dd>
            </dl>
          ) : null}
          {quoting && (
            <p role="status" className="m-0 mt-2 text-xs text-secondary">
              <BusyLabel>Updating Total</BusyLabel>
            </p>
          )}
          {quote && quoteError && <FieldError id="staff-total-error" message={quoteError} />}
          {quote?.free && (
            <FieldError id="staff-total-free" message="This order comes to ₱0, so there is no transfer to record. A free entry is not added from here." />
          )}
        </div>
        <p className="m-0 text-xs text-[var(--text-muted)]">
          Check it against the screenshot. The order is saved as a pending bank transfer and waits for validation like any other.
        </p>
      </div>
    </section>
  );
}
