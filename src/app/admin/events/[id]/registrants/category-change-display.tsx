/**
 * How a runner's category changes are *read* on the registrants screen
 * (CATEGORY_CHANGE_PLAN.md D7): the "10K (from 5K)" line, the Kit changed
 * chip, and the money line each change in the history carries. The table cell,
 * the card and the detail modal draw them from here, as registrant-display.tsx
 * does for the payment chips, so a chip cannot mean one thing in a cell and
 * another in the modal it opens.
 */

import React from 'react';
import { Shirt } from 'lucide-react';
import { formatPesos } from '@/lib/money';
import {
  CATEGORY_CHANGE_STATUSES,
  hasMoved,
  kitDifference,
} from '@/lib/category-change';
import type { CategoryChangeView } from '@/lib/category-change-view';

type WithChanges = { category: string; categoryChanges?: CategoryChangeView[] };

/** All a move is read from — so the client runner list (`client-runners.ts`) reads it by the same rule. */
export type MoveSource = Pick<CategoryChangeView, 'status' | 'fromCategory' | 'toCategory' | 'fromInclusions' | 'toInclusions'>;

/**
 * Where this runner started and what their kit difference is against it.
 *
 * Measured from the **first** applied change to the last, not from the last
 * one alone: a runner moved 5K → 10K → 21K is "from 5K" to the kit team, who
 * packed a 5K kit, and moved back to 5K is no change at all.
 */
export function categoryMove(runner: { categoryChanges?: MoveSource[] }) {
  const moved = (runner.categoryChanges ?? []).filter(change => hasMoved(change.status));
  if (moved.length === 0) return null;
  const first = moved[0];
  const last = moved[moved.length - 1];
  if (first.fromCategory === last.toCategory) return null;
  return {
    from: first.fromCategory,
    kit: kitDifference(first.fromInclusions, last.toInclusions),
  };
}

/** A refund this runner is still owed, from any change, for the amber chip. */
export function refundOwed(runner: WithChanges): number {
  return (runner.categoryChanges ?? [])
    .filter(change => change.status === CATEGORY_CHANGE_STATUSES.REFUND_DUE)
    .reduce((sum, change) => sum + change.refundAmount, 0);
}

/** An upgrade of this runner's still waiting for its payment, for the amber chip. */
export function openUpgrade(runner: WithChanges): CategoryChangeView | null {
  return (runner.categoryChanges ?? []).find(change => change.status === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT) ?? null;
}

/** "Added: Medal · Removed: Singlet", the chip's full reading. */
export function kitSummary(kit: { added: string[]; removed: string[] }): string {
  return [
    kit.added.length > 0 ? `Added: ${kit.added.join(', ')}` : null,
    kit.removed.length > 0 ? `Removed: ${kit.removed.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The *Kit changed* chip. Blue, the informational tone of *Minor* and *Pacer*:
 * a different kit is a fact the kit team acts on, not a fault in the order.
 * The list rides the title for the table; `detailed` says it in words, for the
 * card and the modal, where there is no hover.
 */
export function KitChangedChip({
  kit,
  detailed = false,
}: {
  kit: { added: string[]; removed: string[] };
  detailed?: boolean;
}) {
  const summary = kitSummary(kit);
  return (
    <>
      <span className="status-badge info gap-1" title={summary} aria-label={`Kit changed. ${summary}`}>
        <Shirt size={12} aria-hidden="true" /> Kit changed
      </span>
      {detailed && (
        <span className="block text-xs text-[var(--text-muted)] mt-1 [overflow-wrap:anywhere]">{summary}</span>
      )}
    </>
  );
}

/**
 * The Category cell: the current option, "(from 5K)" when it moved, and the
 * chips that follow from a move — the kit difference, an upgrade still waiting
 * for its payment ("₱400 due · to 10K"), and a refund still owed.
 */
export function CategoryWithChange({ runner, detailed = false }: { runner: WithChanges; detailed?: boolean }) {
  const move = categoryMove(runner);
  const owed = refundOwed(runner);
  const upgrade = openUpgrade(runner);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span>
        {runner.category}
        {move && <span className="text-xs font-normal text-[var(--text-muted)]"> (from {move.from})</span>}
      </span>
      {move?.kit.changed && <KitChangedChip kit={move.kit} detailed={detailed} />}
      {upgrade && (
        <span className="status-badge pending" title={`Waiting for payment to move to ${upgrade.toCategory} (${upgrade.changeRef}).`}>
          ₱{formatPesos(upgrade.totalCharged || upgrade.amount)} due · to {upgrade.toCategory}
        </span>
      )}
      {owed > 0 && (
        <span className="status-badge pending" title="A downgrade's refund has not been recorded as paid.">
          ₱{formatPesos(owed)} to refund
        </span>
      )}
    </span>
  );
}

/** What became of the money on one change, in one line for the history. */
export function changeMoneyLine(change: CategoryChangeView): string {
  const peso = (centavos: number) => `₱${formatPesos(centavos)}`;
  switch (change.status) {
    case CATEGORY_CHANGE_STATUSES.REFUND_DUE:
      return `${peso(change.refundAmount)} to refund by hand`;
    case CATEGORY_CHANGE_STATUSES.REFUNDED:
      return `${peso(change.refundAmount)} refunded${change.refundReference ? ` · ref ${change.refundReference}` : ''}`;
    case CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT:
      return `${peso(change.totalCharged || change.amount)} due`;
    // Never paid: what was asked, not what came in.
    case CATEGORY_CHANGE_STATUSES.CANCELLED:
    case CATEGORY_CHANGE_STATUSES.EXPIRED:
      return `${peso(change.totalCharged || change.amount)} was due, not paid`;
    default:
      if (change.totalCharged > 0) return `${peso(change.totalCharged)} paid`;
      if (change.amount < 0) return `${peso(-change.amount)} not refunded (race policy)`;
      return 'Nothing to pay';
  }
}
