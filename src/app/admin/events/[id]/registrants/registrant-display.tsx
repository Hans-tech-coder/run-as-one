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
import { MailWarning } from 'lucide-react';
import { statusProvenance } from '@/lib/activity';
import { GUARDIAN_CONSENT_MAX_AGE } from '@/lib/minor-consent';
import { formatRunnerAddress, groupByAddress, type RunnerAddress } from '@/lib/runner-address';
import type { RegistrantRow } from './RegistrantsTable';
import { BALANCE_DUE, FOR_VALIDATION, displayStatus, proofForValidation, switchForValidation } from './category-change-display';

/**
 * The badge tone a payment status wears.
 *
 * EXPIRED is **neutral**, not amber and not red. It is an online checkout
 * nobody came back to finish, or a bank transfer whose slip nobody verified in
 * seven days, swept by lib/pending-expiry.ts so its slot and
 * its promo redemption go back into circulation — a fact that simply is, in
 * the same voice as a race that has been run. Amber would put it beside
 * PENDING, which is a payment still expected; red would call the organizer to
 * act on something already handled on their behalf.
 */
export function statusTone(status: string): string {
  if (status === 'PAID') return 'success';
  // Blue, as the Logistics cell's *Proof submitted* chip: the runner did their part.
  if (status === FOR_VALIDATION) return 'info';
  if (status === 'EXPIRED') return 'neutral';
  return 'pending';
}

/** The same three tones as Tailwind classes, for the detail modal's pill. */
export function statusPillClass(status: string): string {
  if (status === 'PAID') return 'bg-green-500/20 text-[var(--status-success)] border border-green-500/20';
  if (status === FOR_VALIDATION) return 'bg-[color-mix(in_srgb,var(--accent-blue-ink)_12%,transparent)] text-accent-blue-ink border border-[color-mix(in_srgb,var(--accent-blue-ink)_25%,transparent)]';
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
 *
 * **A paid entry joins the queue while a change's proof waits** (the owner,
 * 2026-10-20): the runner sent their GCash or bank screenshot on a delivery
 * switch's or an upgrade's link, and the row reads FOR VALIDATION until staff
 * validate it, in *Delivery Payment* or *Category Payment* (row menu).
 * The bell asks the same of the database (`switchProofSubmitted`,
 * `changeProofSubmitted`).
 */
export function needsValidation(
  runner: { status: string; isBankTransfer: boolean } & Parameters<typeof proofForValidation>[0],
): boolean {
  return (runner.status === 'PENDING' && runner.isBankTransfer) || proofForValidation(runner);
}

/**
 * Whether the Validate Payment button is offered: the queue above, plus a bank
 * transfer the sweep expired because nobody checked its slip within
 * `BANK_TRANSFER_EXPIRY_DAYS` (lib/pending-expiry.ts). The money may still
 * have arrived, so the organizer can still validate it; the status route takes
 * the slot back only if the race has room. An expired transfer is left out of
 * the queue on purpose — junk slips are what the window exists to clear.
 */
export function canValidatePayment(runner: { status: string; isBankTransfer: boolean }): boolean {
  return runner.isBankTransfer && (runner.status === 'PENDING' || runner.status === 'EXPIRED');
}

/**
 * Why an EXPIRED order is expired, in one sentence. The two kinds expire for
 * different reasons, and an expired bank transfer has a slip attached, so
 * "never paid" would be a claim this app cannot make about it.
 *
 * The "7 days" is `BANK_TRANSFER_EXPIRY_DAYS`, written out because that module
 * reaches the database and cannot be bundled into this client screen. Change
 * the two together.
 */
export function expiredExplanation(runner: { isBankTransfer: boolean; promoCode?: string | null }): string {
  const released = runner.promoCode ? 'its slot and promo code were released' : 'its slot was released';
  return runner.isBankTransfer
    ? `Nobody verified the deposit slip within 7 days, so ${released}. If the money arrived, validate it; that takes a slot back if the race has room.`
    : `This online checkout was never paid, so ${released}.`;
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

/**
 * The Status cell's badges: the payment status, and under it the one thing
 * that can be wrong about this row without the payment being wrong — the
 * email never went out. It sits in the Status cell rather than a column of
 * its own because it is an exception, and a column that is empty for
 * ninety-nine rows in a hundred costs width every organizer pays. Drawn once
 * for the table cell and the card's badge row, so the two cannot disagree.
 */
export function RegistrantStatusBadges({ runner }: { runner: RegistrantRow }) {
  return (
    <>
      <span
        className={`status-badge ${statusTone(displayStatus(runner))}`}
        title={
          runner.status === 'EXPIRED'
            ? expiredExplanation(runner)
            : displayStatus(runner) === FOR_VALIDATION
              ? switchForValidation(runner)
                ? 'The entry is paid; the runner sent proof for a delivery fee. Open Delivery Payment to validate it.'
                : 'The entry is paid; the runner sent proof for a category change. Open Category Payment to validate it.'
              : displayStatus(runner) === BALANCE_DUE
                ? 'The entry is paid; an upgrade or a delivery switch is waiting for its payment.'
                : undefined
        }
      >
        {displayStatus(runner)}
      </span>
      {/* Under the status rather than beside the name, because it explains
          the status: a pacer's order reads PAID with nothing collected, and
          without this chip that looks like a payment somebody forgot to
          record (PACER_DISCOUNT_PLAN.md Batch 3). Drawn here, so the table
          cell and the card's badge row carry it alike. */}
      {runner.isPacer && <PacerBadge />}
      {runner.emailPending && (
        /* The project's own badge rather than a new one (standing rule
           §8.2), in the danger tone: an unsent email is a failure, not a
           waiting state, and amber would put it in the same voice as the
           PENDING badge directly above it. */
        <span
          className="status-badge danger gap-1"
          title={`The ${runner.emailPendingLabel} email has not gone out.`}
        >
          <MailWarning size={12} /> Email Unsent
        </span>
      )}
    </>
  );
}

/** Where an organizer prints one runner's consent sheet for kit claiming. */
export function consentSheetPath(eventId: string, runnerId: string): string {
  return `/admin/events/${eventId}/registrants/${runnerId}/consent`;
}

/**
 * Which runners ship where, on an order that ships each kit to its runner's
 * own home (RUNNER_ADDRESS_PLAN.md Batch 3). Runners who share an address are
 * one parcel, grouped by the same rule the checkout charged by, so the list
 * here is the list of parcels the order paid for — unless staff have since
 * corrected an address, in which case it is where the kits should now go.
 */
export function DeliveryParcels({
  runner,
  orderRunners,
}: {
  runner: { id: string };
  /** The order's live runners, in runner order, as the table holds them. */
  orderRunners: ({ id: string; name: string; runnerRef: string } & Partial<RunnerAddress>)[];
}) {
  const parcels = groupByAddress(orderRunners);
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <span className="text-[var(--text-muted)]">
        Shipped to each runner&apos;s home &middot; {parcels.length} {parcels.length === 1 ? 'parcel' : 'parcels'}
      </span>
      <ol className="m-0 p-0 list-none flex flex-col gap-2">
        {parcels.map((parcel, i) => {
          const members = parcel.runners.map(index => orderRunners[index]);
          const mine = members.some(member => member.id === runner.id);
          return (
            <li
              key={i}
              className={`rounded-lg border border-[var(--dash-border)] px-3 py-2 ${mine ? 'bg-[var(--ink-05)]' : ''}`}
            >
              <span className="block text-xs text-[var(--text-muted)]">
                Parcel {i + 1} of {parcels.length}{mine ? ' · this runner' : ''}
              </span>
              <span className="block text-primary font-medium">
                {members.map(member => `${member.name} (${member.runnerRef})`).join(', ')}
              </span>
              <span className="block text-secondary break-words">
                {formatRunnerAddress(parcel.address) || 'No home address on file'}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
