"use client";

/**
 * The Transaction Details fields of the registrant detail modal: the
 * references, the payment status and who settled it, the payment method,
 * logistics and delivery, the money, and the waiver.
 *
 * Split out of `RegistrantDetailModal.tsx` (CATEGORY_CHANGE_PLAN.md Session 2),
 * which was past the size the repository splits files at, when the runner's
 * category change history joined the modal. Reads the row it is handed and
 * holds no state.
 */

import React from 'react';
import Link from 'next/link';
import { formatPesos } from '@/lib/money';
import { orderActivityPath } from '@/lib/activity';
import type { RegistrantPermissions, RegistrantRow } from './RegistrantsTable';
import {
  DeliveryParcels,
  StatusProvenanceNote,
  expiredExplanation,
  statusPillClass,
} from './registrant-display';
import { displayStatus } from './category-change-display';

export default function RegistrantTransactionFields({
  runner,
  orderRunners,
  eventId,
  permissions,
}: {
  runner: RegistrantRow;
  orderRunners: RegistrantRow[];
  eventId: string;
  permissions: RegistrantPermissions;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
      {/* Only on a group order, where the two differ. A solo
          registration's runner reference *is* its order reference,
          so printing it twice would say nothing twice. */}
      {runner.runnerRef !== runner.orderRef && (
        <p className="flex flex-col"><span className="text-[var(--text-muted)]">Runner Ref</span> <span className="text-primary font-medium">{runner.runnerRef}</span></p>
      )}
      {/* The order reference is kept beside it: this runner's ref
          identifies the person, the order ref is what the whole
          group paid under and what a bank line will match. */}
      <p className="flex flex-col"><span className="text-[var(--text-muted)]">Order Ref</span> <span className="text-primary font-medium">{runner.orderRef}</span></p>
      <p className="flex flex-col"><span className="text-[var(--text-muted)]">Status</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium w-fit mt-1 ${statusPillClass(displayStatus(runner))}`}>
          {displayStatus(runner)}
        </span>
        {/* An EXPIRED row is the one status nobody chose, so it is
            the one that has to explain itself: what happened, when,
            and what it gave back. Without this the organizer is
            looking at an order that changed on its own. */}
        {runner.status === 'EXPIRED' && (
          <span className="text-xs text-[var(--text-muted)] mt-1.5">
            {runner.expiredAt
              ? `Expired on ${new Date(runner.expiredAt).toLocaleString()}. `
              : ''}
            {expiredExplanation(runner)}
          </span>
        )}
        {/* Status checked too: validating moves the open modal's
            copy to PAID without reloading verifyBy. */}
        {runner.status === 'PENDING' && runner.verifyBy && (
          <span className="text-xs text-[var(--text-muted)] mt-1.5">
            Verify the slip by {runner.verifyBy}, or the slot is released.
          </span>
        )}
        <StatusProvenanceNote runner={runner} />
        {/* Everything that happened to this order — the proof
            opened, the remarks rewritten, the runner edited — for
            the people who can read the trail. */}
        {permissions.activity && (
          <Link
            href={orderActivityPath(runner.orderRef, eventId)}
            className="text-xs font-medium text-accent-blue-ink hover:underline mt-1.5 w-fit"
          >
            See this order&rsquo;s activity
          </Link>
        )}
      </p>
      <p className="flex flex-col">
        <span className="text-[var(--text-muted)]">Payment Method</span>
        <span className="text-primary font-medium">{runner.paymentMethod}</span>
        {/* COMPLIMENTARY on its own is a word an organizer has to
            guess at — it says nobody paid, not why nobody had to.
            Every complimentary order in this app today is a pacer's
            (PACER_DISCOUNT_PLAN.md Batch 2), so the line names the
            reason rather than leaving a ₱0 order looking unpaid. */}
        {runner.isComplimentary && (
          <span className="text-xs text-[var(--text-muted)] mt-1">
            Complimentary: pacer entry
          </span>
        )}
      </p>
      <p className="flex flex-col"><span className="text-[var(--text-muted)]">Logistics</span> <span className="text-primary font-medium">{runner.logisticsMethod}</span></p>
      {runner.isDelivery && runner.deliveryZone && (
        <p className="flex flex-col"><span className="text-[var(--text-muted)]">Delivery Area</span> <span className="text-primary font-medium">{runner.deliveryZone}</span></p>
      )}
      {runner.isDelivery && !runner.deliverySplit && (
        <p className="flex flex-col sm:col-span-2"><span className="text-[var(--text-muted)]">Address</span> <span className="text-primary font-medium">{runner.deliveryAddress}</span></p>
      )}
      {runner.isDelivery && runner.deliverySplit && (
        <DeliveryParcels runner={runner} orderRunners={orderRunners} />
      )}
      {runner.isBankTransfer && runner.transactionNumber && (
        <p className="flex flex-col"><span className="text-[var(--text-muted)]">Transaction No.</span> <span className="text-primary font-medium">{runner.transactionNumber}</span></p>
      )}
      {/* Only when there was one. A discount is the usual reason a
          transfer arrives short of the sticker price, so the code
          that caused it belongs next to the amount rather than in
          a report nobody opens mid-phone-call. */}
      {runner.discountAmount > 0 && (
        <p className="flex flex-col">
          <span className="text-[var(--text-muted)]">Discount</span>
          <span className="text-primary font-medium">
            −₱{formatPesos(runner.discountAmount)}
            {runner.promoCode && (
              <span className="text-[var(--text-muted)] font-normal"> &middot; {runner.promoCode}</span>
            )}
          </span>
        </p>
      )}
      <p className="flex flex-col"><span className="text-[var(--text-muted)]">Order Total</span> <span className="text-primary font-medium">₱{formatPesos(runner.totalAmount)}</span></p>
      <p className="flex flex-col">
        <span className="text-[var(--text-muted)]">Waiver Consent</span>
        {runner.consentGiven ? (
          <span className="inline-flex items-center gap-1 text-[var(--status-success)] font-medium w-fit mt-1">
            Agreed
            {runner.consentGivenAt && (
              <span className="text-[var(--text-muted)] font-normal">
                &middot; {new Date(runner.consentGivenAt).toLocaleString()}
              </span>
            )}
          </span>
        ) : (
          <span className="text-[var(--status-warning)] font-medium w-fit mt-1">
            Not on record
          </span>
        )}
      </p>
      <p className="flex flex-col">
        <span className="text-[var(--text-muted)]">Signed By</span>
        {/* The name typed under the tick. Registrations taken
            before a signature was asked for say so plainly rather
            than showing an empty line that reads like a bug. */}
        <span className={`font-medium ${runner.consentSignature ? 'text-primary' : 'text-[var(--text-muted)] italic'}`}>
          {runner.consentSignature || 'Not asked at the time'}
        </span>
      </p>
    </div>
  );
}
