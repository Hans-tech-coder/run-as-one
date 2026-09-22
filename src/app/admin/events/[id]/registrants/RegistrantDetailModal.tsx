"use client";

/**
 * One registrant's order, opened from the Eye button on their row.
 *
 * Split out of `RegistrantsTable.tsx`, which was the largest file in the
 * repository: this panel is four hundred lines of *reading* an order —
 * runner, guardian, emergency contact, money, consent, email delivery and the
 * deposit slip — and it shares nothing with the table but the row it is handed
 * and the handlers it calls back on. Keeping it here means an edit to what the
 * modal says never has to scroll past the table's state.
 *
 * It holds no state of its own on purpose. Every way onward — validate, open
 * the receipt, write a remark, send the email by hand — belongs to a modal the
 * table owns, so this one asks rather than opens.
 */

import React from 'react';
import Link from 'next/link';
import {
  X, Eye, CheckCircle, MessageSquare, MessageSquareText, Mail, MailWarning,
  Maximize2, FileText, Printer, TriangleAlert
} from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { formatPesos } from '@/lib/money';
import { orderActivityPath } from '@/lib/activity';
import type { RegistrantPermissions } from './RegistrantsTable';
import {
  MinorBadge,
  PacerBadge,
  StatusProvenanceNote,
  consentSheetPath,
  needsValidation,
  statusPillClass,
} from './registrant-display';

export default function RegistrantDetailModal({
  runner,
  eventId,
  permissions,
  updatingId,
  onClose,
  onValidate,
  onOpenProof,
  onOpenRemarks,
  onOpenEmail,
}: {
  runner: any;
  eventId: string;
  permissions: RegistrantPermissions;
  /** The registration currently being validated, so its button can say so. */
  updatingId: string | null;
  onClose: () => void;
  onValidate: (runner: any) => void;
  onOpenProof: (runner: any) => void;
  onOpenRemarks: (runnerId: string) => void;
  onOpenEmail: (runnerId: string) => void;
}) {
  return (
      // Below `sm` a full-height sheet (.admin-modal-sheet): the sections
      // stack, and the footer at the bottom edge carries every way onward.
      <div className="fixed inset-0 bg-[var(--dash-scrim)] backdrop-blur-sm z-50 flex items-center justify-center p-4 max-sm:p-0">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="registrant-details-title"
          className="admin-modal-panel admin-modal-sheet bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-clip shadow-2xl"
        >
          <div className="flex justify-between items-center gap-4 p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] shrink-0">
            <h3 id="registrant-details-title" className="text-xl font-semibold text-primary">Registrant Details</h3>
            <button
              onClick={() => onClose()}
              aria-label="Close"
              className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="admin-modal-body p-6 max-sm:p-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider">Runner Info</h4>
                <div className="space-y-2 text-sm">
                  <p className="flex flex-col">
                    <span className="text-[var(--text-muted)]">Name</span>
                    <span className="text-primary font-medium flex items-center gap-2 flex-wrap">
                      {runner.name}
                      {runner.isMinor && <MinorBadge />}
                    {runner.isPacer && <PacerBadge />}
                    </span>
                  </p>
                  <p className="flex flex-col"><span className="text-[var(--text-muted)]">Email</span> <span className="text-primary font-medium">{runner.email}</span></p>
                  <p className="flex flex-col"><span className="text-[var(--text-muted)]">Phone</span> <span className="text-primary font-medium">{runner.phone}</span></p>
                  <p className="flex flex-col"><span className="text-[var(--text-muted)]">Gender</span> <span className="text-primary font-medium capitalize">{runner.gender}</span></p>
                  <p className="flex flex-col">
                    <span className="text-[var(--text-muted)]">Birthdate</span>
                    <span className="text-primary font-medium">
                      {runner.birthdate}
                      {/* The age the consent rule is counted on, so the chip
                          above is never a verdict nobody can check. */}
                      {runner.isMinor && runner.ageOnRaceDay !== null && (
                        <span className="text-[var(--text-muted)] font-normal">
                          {' '}&middot; {runner.ageOnRaceDay} on race day
                        </span>
                      )}
                    </span>
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider">Race Details</h4>
                <div className="space-y-2 text-sm">
                  <p className="flex flex-col"><span className="text-[var(--text-muted)]">Category</span> <span className="text-primary font-medium">{runner.category}</span></p>
                  {/* Fun-run packages have none, and a blank row reads like
                      missing data rather than an absent field. */}
                  {runner.distance && <p className="flex flex-col"><span className="text-[var(--text-muted)]">Distance</span> <span className="text-primary font-medium">{runner.distance}</span></p>}
                  <p className="flex flex-col"><span className="text-[var(--text-muted)]">Shirt Size</span> <span className="text-primary font-medium">{runner.size}</span></p>
                </div>
              </div>
            </div>

            {/* Parent/Guardian consent (GUARDIAN_CONSENT_PLAN.md Batch 4).
                Shown for a minor, and for anyone with a guardian on file —
                a birthdate corrected upward leaves the consent that was
                given, and hiding it would hide what the guardian agreed to.
                A minor with none on file gets the amber line rather than
                nothing: a row from before consent was asked for, or a
                birthdate staff corrected later, is the case the organizer
                has to catch at kit claiming. */}
            {(runner.isMinor || runner.guardianName) && (
              <div className="mt-8 pt-8 border-t border-[var(--dash-border)] space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider m-0">Parent/Guardian Consent</h4>
                  {/* A new tab, so the list and this modal are still where
                      the organizer left them after printing. */}
                  <Link
                    href={consentSheetPath(eventId, runner.id)}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue-ink hover:underline min-h-11 -my-3"
                  >
                    <Printer size={14} aria-hidden="true" /> Print guardian consent
                  </Link>
                </div>
                {runner.guardianName ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <p className="flex flex-col"><span className="text-[var(--text-muted)]">Guardian</span> <span className="text-primary font-medium">{runner.guardianName}</span></p>
                    <p className="flex flex-col"><span className="text-[var(--text-muted)]">Relationship</span> <span className="text-primary font-medium">{runner.guardianRelationshipLabel || '—'}</span></p>
                    <p className="flex flex-col">
                      <span className="text-[var(--text-muted)]">Consent Given</span>
                      {/* Null when staff typed the guardian in afterwards:
                          that records who the guardian is, not that they
                          agreed, so it is not dressed up as a consent. */}
                      <span className={`font-medium ${runner.guardianConsentAtLabel ? 'text-primary' : 'text-[var(--text-muted)] italic'}`}>
                        {runner.guardianConsentAtLabel || 'Not through the form'}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="flex items-start gap-2 text-sm text-[var(--status-warning)] font-medium m-0">
                    <TriangleAlert size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      No guardian consent on file.
                      <span className="block text-xs font-normal text-[var(--text-muted)] mt-1">
                        Print the consent and have the parent or guardian sign it at kit claiming.
                      </span>
                    </span>
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8 pt-8 border-t border-[var(--dash-border)]">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider">Emergency Contact</h4>
                <div className="space-y-2 text-sm">
                  <p className="flex flex-col"><span className="text-[var(--text-muted)]">Name</span> <span className="text-primary font-medium">{runner.emergencyContactName}</span></p>
                  <p className="flex flex-col"><span className="text-[var(--text-muted)]">Phone</span> <span className="text-primary font-medium">{runner.emergencyContactPhone}</span></p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider">Medical Info</h4>
                <div className="text-sm text-primary font-medium whitespace-pre-wrap">{runner.medicalConditions || 'None provided'}</div>
              </div>
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider">Running Community</h4>
                <div className="text-sm text-primary font-medium">{runner.runningCommunity || 'Independent Runner'}</div>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-[var(--dash-border)] space-y-4">
              <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider">Transaction Details</h4>
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
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium w-fit mt-1 ${statusPillClass(runner.status)}`}>
                    {runner.status}
                  </span>
                  {/* An EXPIRED row is the one status nobody chose, so it is
                      the one that has to explain itself: what happened, when,
                      and what it gave back. Without this the organizer is
                      looking at an order that changed on its own. */}
                  {runner.status === 'EXPIRED' && (
                    <span className="text-xs text-[var(--text-muted)] mt-1.5">
                      Unpaid online checkout, released
                      {runner.expiredAt
                        ? ` on ${new Date(runner.expiredAt).toLocaleString()}`
                        : ''}
                      . The slot{runner.promoCode ? ' and the promo code' : ''} went back.
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
                {runner.isDelivery && (
                  <p className="flex flex-col sm:col-span-2"><span className="text-[var(--text-muted)]">Address</span> <span className="text-primary font-medium">{runner.deliveryAddress}</span></p>
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

              {/* The validator's notes. Internal - this block has no
                  equivalent anywhere the runner can see, and nothing here
                  emails them. */}
              <div className="mt-6">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <p className="text-[var(--text-muted)] text-sm m-0">Remarks (internal)</p>
                  {permissions.remark && (
                    <button
                      onClick={() => onOpenRemarks(runner.id)}
                      className="text-xs font-medium text-accent-blue-ink hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      {runner.remarks ? 'Edit remarks' : 'Add remarks'}
                    </button>
                  )}
                </div>
                {runner.remarks ? (
                  <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4">
                    <p className="text-sm text-primary whitespace-pre-wrap m-0">{runner.remarks}</p>
                    {(runner.remarksBy || runner.remarksAt) && (
                      <p className="text-xs text-[var(--text-muted)] mt-3 m-0">
                        {runner.remarksBy || 'Unknown'}
                        {runner.remarksAt && ` \u00b7 ${new Date(runner.remarksAt).toLocaleString()}`}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] italic m-0">No remarks yet.</p>
                )}
              </div>

              {/* Whether this order's emails actually left the building. It
                  belongs beside the payment details rather than in the runner
                  section above: like the remarks, it is a fact about the
                  order, not about the person on this row. */}
              <div className="mt-6">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <p className="text-[var(--text-muted)] text-sm m-0">Email Delivery</p>
                  {permissions.email && (
                    <button
                      onClick={() => onOpenEmail(runner.id)}
                      className="text-xs font-medium text-accent-blue-ink hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      {runner.emailPending ? 'Send by hand' : 'View email'}
                    </button>
                  )}
                </div>
                {runner.emailPending ? (
                  <div className="space-y-1">
                    <p className="text-sm text-[var(--status-danger)] m-0">
                      The {runner.emailPendingLabel} email has not gone out.
                    </p>
                    {runner.lastEmailError && (
                      <p className="text-xs text-[var(--text-muted)] m-0">{runner.lastEmailError}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--status-success)] m-0">
                    Sent
                    {runner.manualEmailSentBy
                      ? ` · last one by hand, by ${runner.manualEmailSentBy}`
                      : ''}
                  </p>
                )}
              </div>

              {/* The proof route needs `proof:view` — an encoder or a viewer
                  reads the order without the deposit slip, and is not shown
                  a thumbnail that could only fail to load. */}
              {permissions.proof && runner.isBankTransfer && (
                <div className="mt-6">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <p className="text-[var(--text-muted)] text-sm m-0">Proof of Payment</p>
                    {runner.proofOfPayment && (
                      <button
                        onClick={() => onOpenProof(runner)}
                        className="text-xs font-medium text-accent-blue-ink hover:underline bg-transparent border-none cursor-pointer p-0"
                      >
                        View fullscreen
                      </button>
                    )}
                  </div>
                  {runner.proofOfPayment ? (
                    // The thumbnail is the second door to the same viewer.
                    // A receipt this size says a slip was uploaded; nobody
                    // reads a reference number off it, so clicking it is
                    // the first thing an organizer tries.
                    <button
                      type="button"
                      onClick={() => onOpenProof(runner)}
                      aria-label="Open the proof of payment full screen"
                      className="group relative w-full rounded-lg overflow-hidden border border-[var(--dash-border)] max-h-[300px] max-sm:max-h-none flex items-center justify-center bg-[var(--dash-sunken)] cursor-zoom-in p-0 hover:border-[var(--ink-30)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                    >
                      {/*
                        Receipts are private blobs — there is no permanently valid
                        URL for one. This route checks that the logged-in admin owns
                        the event, then redirects to a short-lived signed URL.

                        A bank-emailed receipt arrives as a PDF, and the first page
                        of one is not something an <img> can draw — it would render
                        as a broken picture and read as a lost upload. That one gets
                        a card saying what it is instead; the viewer behind it
                        renders the document itself.
                      */}
                      {runner.proofIsPdf ? (
                        <span className="flex flex-col items-center gap-2 py-10 text-secondary">
                          <FileText size={32} className="text-accent-blue-ink" aria-hidden="true" />
                          <span className="text-sm font-medium text-primary">PDF receipt</span>
                          <span className="text-xs">Click to read it full screen</span>
                        </span>
                      ) : (
                        <img
                          src={`/api/admin/proof/${runner.registrationId}`}
                          alt="Proof of Payment"
                          className="max-w-full max-h-[300px] object-contain max-sm:w-full max-sm:max-h-[70dvh]"
                        />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-sm font-medium text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                        <Maximize2 size={16} aria-hidden="true" /> Click to enlarge
                      </span>
                    </button>
                  ) : (
                    <div className="border border-dashed border-[var(--ink-20)] rounded-lg p-8 flex flex-col items-center justify-center text-[var(--text-muted)]">
                      <Eye size={24} className="mb-2 opacity-50" />
                      <p className="text-sm">No proof attached yet</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* On a phone the footer holds only the actions below, so a role
              with none of them (an encoder, a viewer) gets no empty bar. */}
          <div
            className={`admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-between items-center bg-[var(--dash-sunken)] shrink-0 ${
              (permissions.validate && needsValidation(runner)) ||
              (permissions.proof && runner.isBankTransfer && runner.proofOfPayment) ||
              permissions.remark ||
              permissions.email
                ? ''
                : 'max-sm:hidden'
            }`}
          >
            <div className="max-sm:contents">
              {/* The dashboard's own action button, not the public site's
                  gradient — and the one in the receipt lightbox is now its
                  peer, so the two have to read alike. */}
              {permissions.validate && runner.status === 'PENDING' && runner.isBankTransfer && (
                <button
                  onClick={() => onValidate(runner)}
                  disabled={updatingId === runner.registrationId}
                  className="btn-light max-sm:basis-full"
                >
                  <CheckCircle className="w-4 h-4" />
                  {updatingId === runner.registrationId ? <BusyLabel>Validating</BusyLabel> : 'Validate Payment'}
                </button>
              )}
            </div>
            {/*
              Below `sm` only. On a phone the body's own links to the proof,
              the remarks and the email are a long scroll away, so the footer
              carries them beside Validate and nothing onward leaves reach.
              The header's close stands in for Close there.
            */}
            {permissions.proof && runner.isBankTransfer && runner.proofOfPayment && (
              <button
                type="button"
                onClick={() => onOpenProof(runner)}
                className="btn-filter justify-center dash-phone-only"
              >
                <Maximize2 size={16} aria-hidden="true" /> Proof
              </button>
            )}
            {permissions.remark && (
              <button
                type="button"
                onClick={() => onOpenRemarks(runner.id)}
                className={`btn-filter justify-center dash-phone-only ${runner.remarks ? 'is-primary' : ''}`}
              >
                {runner.remarks
                  ? <MessageSquareText size={16} aria-hidden="true" />
                  : <MessageSquare size={16} aria-hidden="true" />}
                Remarks
              </button>
            )}
            {permissions.email && (
              <button
                type="button"
                onClick={() => onOpenEmail(runner.id)}
                className={`btn-filter justify-center dash-phone-only ${runner.emailPending ? 'is-danger' : ''}`}
              >
                {runner.emailPending
                  ? <MailWarning size={16} aria-hidden="true" />
                  : <Mail size={16} aria-hidden="true" />}
                Email
              </button>
            )}
            <button
              onClick={() => onClose()}
              className="px-4 py-2 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors max-sm:hidden"
            >
              Close
            </button>
          </div>
        </div>
      </div>  );
}
