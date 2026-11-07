/**
 * **A note or an email mark belongs to the order, so it lands on every one of
 * its rows.** The registrants screen has one row per runner, and a remark or
 * an email sent by hand is about the order all of them are on: patched onto
 * one row, the icon would light up on one member of a group and stay grey on
 * the other four, and one would look handled while four did not.
 *
 * Split out of `RegistrantsTable.tsx` (ADD_ONS_PLAN.md Batch 4), which was on
 * the split-candidates list, as plain functions over the rows: the table
 * still owns the state and calls these from the modals' callbacks. A
 * corrected payment (PAYMENT_CORRECTION_PLAN.md Batch 2) lands the same way.
 */

import type { RegistrantRow } from './RegistrantsTable';
import type { SavedRemarks } from './RemarksModal';
import type { MarkedSentRegistration } from './ManualEmailModal';
import { isPdfProof } from '@/lib/uploads';

/** Every row of the order with the saved remark. */
export function withRemarks(runners: RegistrantRow[], registrationId: string, saved: SavedRemarks): RegistrantRow[] {
  return runners.map(r => (r.registrationId === registrationId ? { ...r, ...saved } : r));
}

/**
 * The detail modal's own copy of a row, when it is open on that order: it
 * holds the row rather than reading it back out of the list.
 */
export function remarked(row: RegistrantRow | null, registrationId: string, saved: SavedRemarks): RegistrantRow | null {
  return row && row.registrationId === registrationId ? { ...row, ...saved } : row;
}

/** Every row of the order with its email mark after a by-hand send, or the mark cleared. */
export function withEmailMark(
  runners: RegistrantRow[],
  registrationId: string,
  registration: MarkedSentRegistration,
  outstanding: string | null,
): RegistrantRow[] {
  return runners.map(r => r.registrationId === registrationId ? {
    ...r,
    emailPending: outstanding !== null,
    emailPendingKind: outstanding,
    emailPendingLabel: outstanding === 'CONFIRMATION' ? 'Payment Receipt' : outstanding === 'RECEIVED' ? 'Registration Received' : null,
    lastEmailError: registration?.lastEmailError ?? null,
    receivedEmailSentAt: registration?.receivedEmailSentAt ?? r.receivedEmailSentAt,
    confirmationEmailSentAt: registration?.confirmationEmailSentAt ?? r.confirmationEmailSentAt,
    manualEmailSentAt: registration?.manualEmailSentAt ?? null,
    manualEmailSentBy: registration?.manualEmailSentBy ?? null,
  } : r);
}

/** What the correction route answered with (PAYMENT_CORRECTION_PLAN.md Batch 2). */
export type PaymentCorrected = {
  changes: Record<string, [unknown, unknown]>;
  receipt: { sent: boolean; error?: string } | null;
  by: string;
  at: string;
};

/**
 * A corrected Transaction No. or proof, onto one row of the order (or the
 * detail modal's copy): the payment is the order's, so every runner shows it.
 */
function paymentCorrectedRow(row: RegistrantRow, saved: PaymentCorrected): RegistrantRow {
  const ref = saved.changes.transactionNumber?.[1];
  const proof = saved.changes.proofOfPayment?.[1];
  return {
    ...row,
    ...(typeof ref === 'string' ? { transactionNumber: ref } : {}),
    ...(typeof proof === 'string' ? { proofOfPayment: proof, proofIsPdf: isPdfProof(proof) } : {}),
    paymentCorrection: { by: saved.by, at: saved.at },
    ...(saved.receipt?.sent
      ? {
          confirmationEmailSentAt: saved.at,
          lastEmailError: null,
          ...(row.emailPendingKind === 'CONFIRMATION'
            ? { emailPending: false, emailPendingKind: null, emailPendingLabel: null }
            : {}),
        }
      : {}),
  };
}

/** Every row of the order with the corrected payment details. */
export function withPaymentCorrection(
  runners: RegistrantRow[],
  registrationId: string,
  saved: PaymentCorrected,
): RegistrantRow[] {
  return runners.map(r => (r.registrationId === registrationId ? paymentCorrectedRow(r, saved) : r));
}

/** The detail modal's own copy, when it is open on that order. */
export function paymentCorrected(
  row: RegistrantRow | null,
  registrationId: string,
  saved: PaymentCorrected,
): RegistrantRow | null {
  return row && row.registrationId === registrationId ? paymentCorrectedRow(row, saved) : row;
}
