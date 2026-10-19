"use client";

/**
 * A receipt's delivery switches on Pickup & Delivery (LOGISTICS_CHANGE_PLAN.md
 * R2): every switch, newest first, with where it went, what the money did, who
 * made it and why. `SwitchHistoryList` is the list itself, which the table's
 * opened row shows; `SwitchHistory` folds it behind *Switch history (n)* so a
 * card stays a few lines tall. The switch still waiting for payment has its
 * Cancel on the row or card, so it has no button here.
 *
 * The receipt is never edited (L4), so this list is the only place on the
 * screen that says a receipt's logistics is not the one it was bought with.
 */

import React, { useId, useState } from 'react';
import { ArrowRight, ChevronDown, History } from 'lucide-react';
import { formatEventInstant } from '@/lib/event-schedule';
import {
  LOGISTICS_CHANGE_STATUS_LABELS,
  LOGISTICS_CHANGE_STATUS_TONES,
  asLogisticsChangeStatus,
} from '@/lib/logistics-change';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import { switchDirectionLabel, switchMoneyLine } from '../registrants/logistics-change-display';

export default function SwitchHistory({ changes }: { changes: LogisticsChangeView[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (changes.length === 0) return null;

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(value => !value)}
        className="inline-flex items-center gap-1.5 min-h-11 -my-2 text-xs font-medium text-accent-blue-ink hover:underline bg-transparent border-none p-0 cursor-pointer"
      >
        <History size={14} aria-hidden="true" /> Switch history ({changes.length})
        <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <SwitchHistoryList id={listId} changes={changes} />}
    </div>
  );
}

/** Every switch of one receipt, newest first. */
export function SwitchHistoryList({ changes, id }: { changes: LogisticsChangeView[]; id?: string }) {
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
            <p className="m-0 text-secondary">{switchMoneyLine(change)}</p>
            {change.reason && <p className="m-0 text-xs text-secondary [overflow-wrap:anywhere]">Asked: {change.reason}</p>}
            <p className="m-0 text-xs text-[var(--text-muted)] [overflow-wrap:anywhere]">
              {change.changeRef} &middot; by {change.createdBy} &middot; {formatEventInstant(change.createdAt)}
              {change.cancelledAt && change.cancelledBy
                ? ` · cancelled by ${change.cancelledBy}, ${formatEventInstant(change.cancelledAt)}`
                : ''}
              {change.expiredAt ? ` · expired unpaid ${formatEventInstant(change.expiredAt)}` : ''}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
