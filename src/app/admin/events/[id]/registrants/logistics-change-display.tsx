/**
 * How an order's delivery switches are *read* on the registrants screen
 * (LOGISTICS_CHANGE_PLAN.md Session 2): the "Pickup → Delivery" chip, the
 * "Ships with RM-XXXX" note, a switch still waiting for its fee, and the money
 * line each switch in the history carries. The table cell, the card, the
 * history and the CSV draw them from here, as `category-change-display.tsx`
 * does for category moves, so a chip cannot mean one thing in a cell and
 * another in the file.
 */

import React from 'react';
import { ArrowRight, History } from 'lucide-react';
import { formatPesos } from '@/lib/money';
import { LOGISTICS_CHANGE_STATUSES, LOGISTICS_DIRECTIONS } from '@/lib/logistics-change';
import { logisticsMethodLabel } from '@/lib/registration-codes';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';

type WithSwitches = {
  registrationId: string;
  logisticsMethod: string;
  isDelivery: boolean;
  logisticsChanges?: LogisticsChangeView[];
};

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

function applied(row: WithSwitches): LogisticsChangeView[] {
  return (row.logisticsChanges ?? []).filter(change => change.status === LOGISTICS_CHANGE_STATUSES.APPLIED);
}

/**
 * Where this order started and where it is now, measured from the **first**
 * applied switch, as a category move is: switched to delivery and back is no
 * switch at all to the kit team.
 */
export function logisticsMove(row: WithSwitches): { from: string; to: string } | null {
  const first = applied(row)[0];
  const link = first?.orders.find(order => order.registrationId === row.registrationId);
  if (!link) return null;
  const from = logisticsMethodLabel(link.fromLogisticsMethod);
  const to = logisticsMethodLabel(row.isDelivery ? 'DELIVERY' : 'PICKUP');
  return from === to ? null : { from, to };
}

/** The paid order whose parcel this one rides on at ₱0 (L6), while it still does. */
export function shipsWith(row: WithSwitches): string | null {
  const last = applied(row).at(-1);
  return row.isDelivery && last?.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY ? last.ridesOnOrderRef : null;
}

/** A switch of this order's still waiting for its fee (L13: at most one). */
export function openSwitch(row: WithSwitches): LogisticsChangeView | null {
  return (row.logisticsChanges ?? []).find(change => change.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT) ?? null;
}

/** "SWITCHED FROM PICKUP · SHIPS WITH RM-D918005C", the CSV's Logistics Note. */
export function logisticsNote(row: WithSwitches): string {
  const move = logisticsMove(row);
  const host = shipsWith(row);
  const waiting = openSwitch(row);
  return [
    move ? `SWITCHED FROM ${move.from.toUpperCase()}` : null,
    host ? `SHIPS WITH ${host}` : null,
    waiting ? `DELIVERY SWITCH AWAITING ${peso(waiting.totalCharged || waiting.fee)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** What became of the money on one switch, in one line for the history. */
export function switchMoneyLine(change: LogisticsChangeView): string {
  const due = peso(change.totalCharged || change.fee);
  switch (change.status) {
    case LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT:
      return `${due} due`;
    // Never paid: what was asked, not what came in.
    case LOGISTICS_CHANGE_STATUSES.CANCELLED:
    case LOGISTICS_CHANGE_STATUSES.EXPIRED:
      return `${due} was due, not paid`;
    default:
      if (change.totalCharged > 0) return `${peso(change.totalCharged)} paid`;
      if (change.direction === LOGISTICS_DIRECTIONS.TO_PICKUP) return 'Nothing to pay, nothing refunded';
      if (change.ridesOnOrderRef) return `Ships with ${change.ridesOnOrderRef}, nothing to pay`;
      return 'Nothing to pay';
  }
}

/** "Pickup → Delivery", the way a switch is named in the history. */
export function switchDirectionLabel(change: Pick<LogisticsChangeView, 'direction'>) {
  return change.direction === LOGISTICS_DIRECTIONS.TO_PICKUP
    ? { from: 'Delivery', to: 'Pickup' }
    : { from: 'Pickup', to: 'Delivery' };
}

/**
 * The Logistics cell: the method, the "Pickup → Delivery" chip once the order
 * has switched, "Ships with RM-XXXX" while it rides on another order's parcel,
 * a switch still waiting for its fee, and the way into the switch history.
 * Blue for the chip, as *Kit changed* is: a fact the kit team acts on, not a
 * fault in the order.
 */
export function LogisticsWithSwitch({
  runner,
  onHistory,
}: {
  runner: WithSwitches;
  /** Opens the order's switch history; omitted where there is nowhere to open it. */
  onHistory?: () => void;
}) {
  const move = logisticsMove(runner);
  const host = shipsWith(runner);
  const waiting = openSwitch(runner);
  const count = runner.logisticsChanges?.length ?? 0;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="capitalize">{runner.logisticsMethod}</span>
      {move && (
        <span className="status-badge info gap-1" aria-label={`Switched from ${move.from} to ${move.to}`}>
          {move.from} <ArrowRight size={12} aria-hidden="true" /> {move.to}
        </span>
      )}
      {host && <span className="text-xs text-[var(--text-muted)]">Ships with {host}</span>}
      {waiting && (
        <span className="status-badge pending" title={`Waiting for payment to switch to delivery (${waiting.changeRef}).`}>
          {peso(waiting.totalCharged || waiting.fee)} due · to delivery
        </span>
      )}
      {count > 0 && onHistory && (
        <button
          type="button"
          onClick={onHistory}
          className="inline-flex items-center gap-1 min-h-11 -my-3 text-xs font-medium text-accent-blue-ink hover:underline bg-transparent border-none p-0 cursor-pointer"
        >
          <History size={12} aria-hidden="true" /> Switch history ({count})
        </button>
      )}
    </span>
  );
}
