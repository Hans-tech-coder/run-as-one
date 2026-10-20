"use client";

/**
 * A receipt's delivery switches (LOGISTICS_CHANGE_PLAN.md Revision 2), in its
 * *Switch History* / *Delivery Payment* modal (`OrderSwitchModal.tsx`): every
 * switch, newest first, with where it went, what the money did, who made it
 * and why. The switch still waiting for payment has its controls above the
 * list (`WaitingSwitchActions`), so it has none here.
 *
 * A paid switch shows how it was paid: the reference, and *View proof* for a
 * recorded screenshot (`proof:view`, through the proof route, which records
 * the opening). An applied switch whose email Resend refused offers *Send
 * email by hand* (`registration:email`).
 *
 * The receipt is never edited (L4), so this list is the only place on the
 * screen that says a receipt's logistics is not the one it was bought with.
 */

import React from 'react';
import { ArrowRight, Image as ImageIcon, Mail } from 'lucide-react';
import { formatEventInstant } from '@/lib/event-schedule';
import {
  LOGISTICS_CHANGE_STATUS_LABELS,
  LOGISTICS_CHANGE_STATUS_TONES,
  asLogisticsChangeStatus,
} from '@/lib/logistics-change';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import { switchDirectionLabel, switchMoneyLine } from './logistics-change-display';

/** What a history entry may offer, decided on the server; none when absent. */
type HistoryActions = {
  canViewProof?: boolean;
  /** Present when this person may send email: opens the by-hand send. */
  onSendEmail?: (change: LogisticsChangeView) => void;
};

/** Every switch of one receipt, newest first. */
export function SwitchHistoryList({
  changes,
  id,
  canViewProof,
  onSendEmail,
}: { changes: LogisticsChangeView[]; id?: string } & HistoryActions) {
  const newestFirst = [...changes].reverse();
  return (
    <ol id={id} className="m-0 mt-2 p-0 list-none space-y-2 text-sm">
      {newestFirst.map(change => {
        const status = asLogisticsChangeStatus(change.status);
        const way = switchDirectionLabel(change);
        return (
          <li key={change.id} className="rounded-lg border border-[var(--dash-hairline)] p-3 space-y-1">
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
            <p className="m-0 text-secondary">
              {switchMoneyLine(change)}
              {change.transactionNumber ? ` · ref ${change.transactionNumber}` : ''}
            </p>
            {change.reason && <p className="m-0 text-xs text-secondary [overflow-wrap:anywhere]">Asked: {change.reason}</p>}
            <p className="m-0 text-xs text-[var(--text-muted)] [overflow-wrap:anywhere]">
              {change.changeRef} &middot; by {change.createdBy} &middot; {formatEventInstant(change.createdAt)}
              {change.cancelledAt && change.cancelledBy
                ? ` · cancelled by ${change.cancelledBy}, ${formatEventInstant(change.cancelledAt)}`
                : ''}
              {change.expiredAt ? ` · expired unpaid ${formatEventInstant(change.expiredAt)}` : ''}
            </p>
            {((canViewProof && change.hasProof) || (onSendEmail && emailNotSent(change))) && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {canViewProof && change.hasProof && (
                  <a
                    href={`/api/admin/logistics-changes/${change.id}/proof`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={event => event.stopPropagation()}
                    className="btn-filter is-compact gap-1.5 no-underline"
                  >
                    <ImageIcon size={14} aria-hidden="true" /> View proof
                  </a>
                )}
                {onSendEmail && emailNotSent(change) && (
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onSendEmail(change);
                    }}
                    className="btn-filter is-compact gap-1.5"
                  >
                    <Mail size={14} aria-hidden="true" /> Send email by hand
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** An applied switch whose *switched* email Resend refused and nobody sent by hand. */
function emailNotSent(change: LogisticsChangeView): boolean {
  return change.status === 'APPLIED' && !change.appliedEmailSentAt && !!change.lastEmailError;
}
