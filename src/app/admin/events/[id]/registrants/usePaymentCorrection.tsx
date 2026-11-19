"use client";

/**
 * *Correct payment*'s state for the registrants table: which order is open,
 * and the rows it patches after a save. Split out of
 * `PaymentCorrectionModal.tsx`, which was on the split-candidates list, when
 * *Paid to* joined the correction (PAYMENT_CHANNELS_PLAN.md Batch 3).
 */

import React, { useState } from 'react';
import PaymentCorrectionModal from './PaymentCorrectionModal';
import type { RegistrantRow } from './RegistrantsTable';
import type { PaymentCorrected } from './registrant-row-patches';

/**
 * The modal's state for the registrants table: which order is open, and the
 * rows it patches after a save.
 */
export function usePaymentCorrection({
  runners,
  onCorrected,
}: {
  runners: RegistrantRow[];
  onCorrected: (registrationId: string, saved: PaymentCorrected) => void;
}) {
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const runner = runnerId ? runners.find(r => r.id === runnerId) ?? null : null;
  const contact = runner
    ? runners.filter(r => r.registrationId === runner.registrationId).sort((a, b) => a.runnerNo - b.runnerNo)[0]
    : null;

  const element = runner ? (
    <PaymentCorrectionModal
      key={runner.registrationId}
      runner={runner}
      contactEmail={contact?.email ?? null}
      onClose={() => setRunnerId(null)}
      onCorrected={onCorrected}
    />
  ) : null;

  return { open: setRunnerId, element };
}
