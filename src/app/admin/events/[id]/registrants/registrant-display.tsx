/**
 * How one registrant row is *read* — the tones, the chips and the one-line
 * facts the table, the cards and the detail modal all have to agree on.
 *
 * Split out of `RegistrantsTable.tsx` when that file was the largest in the
 * repository and `PACER_DISCOUNT_PLAN.md` Batch 3 had to add a chip to all
 * three of those places at once. Keeping them here is what stops a chip from
 * meaning one thing in a table cell and another in the modal the cell opens.
 */

import React from 'react';
import { statusProvenance } from '@/lib/activity';
import { GUARDIAN_CONSENT_MAX_AGE } from '@/lib/minor-consent';

/**
 * The badge tone a payment status wears.
 *
 * EXPIRED is **neutral**, not amber and not red. It is an online checkout
 * nobody came back to finish, swept by lib/pending-expiry.ts so its slot and
 * its promo redemption go back into circulation — a fact that simply is, in
 * the same voice as a race that has been run. Amber would put it beside
 * PENDING, which is a payment still expected; red would call the organizer to
 * act on something already handled on their behalf.
 */
export function statusTone(status: string): string {
  if (status === 'PAID') return 'success';
  if (status === 'EXPIRED') return 'neutral';
  return 'pending';
}

/** The same three tones as Tailwind classes, for the detail modal's pill. */
export function statusPillClass(status: string): string {
  if (status === 'PAID') return 'bg-green-500/20 text-[var(--status-success)] border border-green-500/20';
  if (status === 'EXPIRED') return 'bg-[var(--ink-10)] text-[var(--ink-85)] border border-[var(--dash-border)]';
  return 'bg-orange-500/20 text-[var(--status-warning)] border border-orange-500/20';
}

/**
 * Whether this row is waiting on a person to check a payment.
 *
 * PENDING alone is not the question. An online checkout sitting at PENDING is
 * one nobody came back to finish, and lib/pending-expiry.ts sweeps it away on
 * its own — there is nothing for a validator to do with it. A bank transfer at
 * PENDING is the opposite: somebody uploaded a deposit slip and is waiting for
 * a human to look at it. That pair is the same rule the detail modal and the
 * receipt lightbox already use to decide whether to offer the Validate button,
 * kept in one place so the queue and the button can never disagree about what
 * is in it.
 *
 * A complimentary order (`PACER_DISCOUNT_PLAN.md` Batch 3) cannot reach this
 * queue and needs no clause of its own: it is written `PAID` with
 * `paymentMethod = COMPLIMENTARY`, so it fails both halves. The same is true
 * of the bell's count, which asks the database for PENDING bank transfers
 * (`notification-store.ts`) — there is no second definition to keep in step.
 */
export function needsValidation(runner: { status: string; isBankTransfer: boolean }): boolean {
  return runner.status === 'PENDING' && runner.isBankTransfer;
}

/**
 * Who settled this order, under its status in the detail modal — "Validated
 * by Ana Cruz · Sep 13, 2026, 4:02 PM" — beside the remarks line that already
 * names its author. The wording, and when it declines to name anyone, is
 * statusProvenance in lib/activity.ts.
 */
export function StatusProvenanceNote({ runner }: { runner: any }) {
  const line = statusProvenance(
    runner.status,
    { isBankTransfer: runner.isBankTransfer, isComplimentary: runner.isComplimentary },
    runner.statusRecord ?? null,
  );
  return line ? <span className="text-xs text-[var(--text-muted)] mt-1.5">{line}</span> : null;
}

/**
 * The *Minor* chip beside a runner 12 or under on race day. Blue, the
 * informational tone: being a minor is a fact about the runner, not a problem
 * with the order — the amber "No guardian consent on file" line is what says
 * when something is missing.
 */
export function MinorBadge() {
  return (
    <span
      className="status-badge info"
      title={`${GUARDIAN_CONSENT_MAX_AGE} or under on race day, so a parent or guardian consents for them.`}
    >
      Minor
    </span>
  );
}

/**
 * The *Pacer* chip on an order made with a pacer code
 * (`PACER_DISCOUNT_PLAN.md` Batch 3), read from the snapshot the registration
 * already carries (`Registration.discountType`) rather than from the code,
 * which the organizer may since have paused or deleted.
 *
 * Blue, the same informational tone as *Minor* and for the same reason: being
 * a pacer is a fact about the entry, not a problem with it. It matters on this
 * screen because a pacer holds a slot and needs a bib and a singlet like
 * anyone else, while the money beside them reads like an order that was never
 * paid — the chip is what says why.
 */
export function PacerBadge() {
  return (
    <span
      className="status-badge info"
      title="Registered with a pacer code — a free entry for one of this race's pacers."
    >
      Pacer
    </span>
  );
}

/** Where an organizer prints one runner's consent sheet for kit claiming. */
export function consentSheetPath(eventId: string, runnerId: string): string {
  return `/admin/events/${eventId}/registrants/${runnerId}/consent`;
}
