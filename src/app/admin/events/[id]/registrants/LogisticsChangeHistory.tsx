"use client";

/**
 * An order's delivery switches (LOGISTICS_CHANGE_PLAN.md Session 2), opened
 * from *Switch history* in the Logistics cell: every switch, newest first,
 * with where it went, what the money did, the orders that moved with it, who
 * made it and why. A switch still waiting for its fee says how much, how, and
 * until when, and staff with `registration:edit` can cancel it here; paying
 * it is Session 3.
 *
 * The receipt is never edited (L4), so this list is the only place on the
 * screen that says an order's logistics is not the one it was bought with.
 * The rows are read from the table's own copy, so a cancel moves both.
 */

import React from 'react';
import { ArrowRight, X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { formatEventInstant } from '@/lib/event-schedule';
import { isOutsidePayment } from '@/lib/category-change-hold';
import { paymentMethodLabel } from '@/lib/registration-codes';
import {
  LOGISTICS_CHANGE_STATUSES,
  LOGISTICS_CHANGE_STATUS_LABELS,
  LOGISTICS_CHANGE_STATUS_TONES,
  asLogisticsChangeStatus,
} from '@/lib/logistics-change';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import type { RegistrantRow } from './RegistrantsTable';
import { switchDirectionLabel, switchMoneyLine } from './logistics-change-display';

export default function LogisticsChangeHistory({
  runner,
  canEdit,
  cancellingId,
  onCancel,
  onClose,
}: {
  runner: RegistrantRow | null;
  canEdit: boolean;
  cancellingId: string | null;
  onCancel: (change: LogisticsChangeView) => void;
  onClose: () => void;
}) {
  if (!runner) return null;
  const changes: LogisticsChangeView[] = [...(runner.logisticsChanges ?? [])].reverse();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0 bg-[var(--dash-scrim)] backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="logistics-history-title"
        className="t-modal admin-modal-panel admin-modal-sheet is-open w-full max-w-xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-clip"
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id="logistics-history-title" className="text-xl font-semibold text-primary m-0">Switch History</h3>
            <p className="text-sm text-secondary mt-1 m-0">
              Order {runner.orderRef} &middot; now {String(runner.logisticsMethod).toLowerCase()}
            </p>
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

        <ol className="admin-modal-body m-0 p-6 max-sm:p-4 list-none overflow-y-auto flex-1 space-y-3 text-sm">
          {changes.length === 0 && <li className="text-[var(--text-muted)]">No switches yet.</li>}
          {changes.map(change => {
            const status = asLogisticsChangeStatus(change.status);
            const way = switchDirectionLabel(change);
            const awaiting = change.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT;
            const others = change.orders.filter(order => order.registrationId !== runner.registrationId);
            const method = change.paymentMethod
              ? isOutsidePayment(change.paymentMethod)
                ? 'GCash or bank transfer'
                : paymentMethodLabel(change.paymentMethod)
              : null;
            return (
              <li key={change.id} className="rounded-lg border border-[var(--dash-border)] p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="flex items-center gap-1.5 font-medium text-primary">
                    {way.from} <ArrowRight size={14} aria-label="to" /> {way.to}
                  </span>
                  {status && (
                    <span className={`status-badge ${LOGISTICS_CHANGE_STATUS_TONES[status]}`}>
                      {LOGISTICS_CHANGE_STATUS_LABELS[status]}
                    </span>
                  )}
                </div>
                {change.direction === 'TO_DELIVERY' && (
                  <p className="m-0 text-secondary [overflow-wrap:anywhere]">
                    {change.deliverySplit ? "To each runner's home address" : `To ${change.deliveryAddress}`}
                  </p>
                )}
                <p className="m-0 text-secondary">{switchMoneyLine(change)}</p>
                {others.length > 0 && (
                  <p className="m-0 text-xs text-secondary">
                    Together with {others.map(order => order.orderRef).join(', ')}
                  </p>
                )}
                {change.reason && <p className="m-0 text-xs text-secondary">Asked: {change.reason}</p>}
                {awaiting && (
                  <p className="m-0 text-xs text-secondary">
                    {method ? `To pay by ${method}` : 'To pay'}
                    {change.holdUntil ? ` · waits until ${formatEventInstant(change.holdUntil)}` : ''}
                  </p>
                )}
                <p className="m-0 text-xs text-[var(--text-muted)]">
                  {change.changeRef} &middot; by {change.createdBy} &middot; {formatEventInstant(change.createdAt)}
                  {change.cancelledAt && change.cancelledBy
                    ? ` · cancelled by ${change.cancelledBy}, ${formatEventInstant(change.cancelledAt)}`
                    : ''}
                  {change.expiredAt ? ` · expired unpaid ${formatEventInstant(change.expiredAt)}` : ''}
                </p>
                {awaiting && canEdit && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onCancel(change)}
                      disabled={cancellingId === change.id}
                      className="btn-filter is-compact is-danger w-fit"
                    >
                      {cancellingId === change.id ? <BusyLabel>Cancelling</BusyLabel> : 'Cancel switch'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
