/**
 * The client runner list's cells (`RunnerList.tsx`), split out so the list is
 * its table and its tools and these are what one runner's row reads as: the
 * same component in the table cell and on the card, so the two never differ.
 */

import React from 'react';
import type { ClientRunnerRow } from '@/lib/client-runners';
import { KitChangedChip } from '../../events/[id]/registrants/category-change-display';

export const NO_SHIRT = 'No shirt';

/**
 * The category now, "(from 5K)" when a change moved the runner, and the *Kit
 * changed* chip when the two kits differ (CATEGORY_CHANGE_PLAN.md D7) — the
 * staff chip itself, so a client and the kit team read one sign. No money
 * chip: what a change cost is not the client's (`client-runners.ts`).
 */
export function CategoryLine({ runner, detailed = false }: { runner: ClientRunnerRow; detailed?: boolean }) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span>
        {runner.category}
        {runner.changedFrom && (
          <span className="text-xs font-normal text-[var(--text-muted)]"> (from {runner.changedFrom})</span>
        )}
      </span>
      {runner.kitChange && <KitChangedChip kit={runner.kitChange} detailed={detailed} />}
    </span>
  );
}

export function StatusBadge({ status }: { status: ClientRunnerRow['status'] }) {
  return (
    <span className={`status-badge ${status === 'Paid' ? 'success' : 'pending'} whitespace-nowrap`}>{status}</span>
  );
}

/** A package with nothing to wear: no size is the answer, not a missing one. */
export function NoShirt() {
  return <span className="text-secondary">{NO_SHIRT}</span>;
}

/**
 * Pickup or delivery, the delivery area, and the switch notes the kit team
 * acts on (LOGISTICS_CHANGE_PLAN.md Session 4): "Switched from pickup" moves
 * the kit out of the pickup pile, "Ships with RM-…" puts it in that receipt's
 * parcel. No money: what a switch cost is not the client's (`client-runners.ts`).
 */
export function KitLine({ runner }: { runner: ClientRunnerRow }) {
  return (
    <span className="flex flex-col">
      <span>{runner.kit}</span>
      {runner.deliveryArea && <span className="text-xs text-secondary">{runner.deliveryArea}</span>}
      {runner.switchedFrom && (
        <span className="text-xs text-secondary">Switched from {runner.switchedFrom.toLowerCase()}</span>
      )}
      {runner.shipsWith && <span className="text-xs text-secondary">Ships with {runner.shipsWith}</span>}
    </span>
  );
}

/** The switch notes as one line, for the export: "Switched from pickup · Ships with RM-D918005C". */
export function kitNote(runner: Pick<ClientRunnerRow, 'switchedFrom' | 'shipsWith'>): string {
  return [
    runner.switchedFrom ? `Switched from ${runner.switchedFrom.toLowerCase()}` : null,
    runner.shipsWith ? `Ships with ${runner.shipsWith}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function ContactLines({ runner }: { runner: ClientRunnerRow }) {
  return (
    <span className="flex flex-col min-w-0">
      {runner.phone && (
        <a href={`tel:${runner.phone}`} className="text-primary hover:underline whitespace-nowrap">
          {runner.phone}
        </a>
      )}
      {runner.email && (
        <a href={`mailto:${runner.email}`} className="text-secondary hover:underline [overflow-wrap:break-word]">
          <EmailText email={runner.email} />
        </a>
      )}
    </span>
  );
}

/** An email that wraps at its `@` rather than mid-word, when it has to wrap at all. */
function EmailText({ email }: { email: string }) {
  const at = email.indexOf('@');
  if (at < 1) return <>{email}</>;
  return (
    <>
      {email.slice(0, at)}
      <wbr />
      {email.slice(at)}
    </>
  );
}

/**
 * Where the kit goes for a delivery, the home address for a pickup. `labelled`
 * when the card's field label already says which, so it is not said twice.
 */
export function AddressLine({ runner, labelled = false }: { runner: ClientRunnerRow; labelled?: boolean }) {
  const address = runner.kit === 'Delivery' ? runner.deliveryAddress : runner.homeAddress;
  if (!address) return <span className="text-secondary">Not given</span>;
  return (
    <span className="flex flex-col">
      {runner.kit === 'Delivery' && !labelled && <span className="text-xs text-secondary">Ship to</span>}
      <span>{address}</span>
    </span>
  );
}
