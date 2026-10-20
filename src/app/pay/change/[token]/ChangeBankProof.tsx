'use client';

/**
 * Paying a GCash or bank category change on its link (the owner, 2026-10-20):
 * the delivery switch's form (`SwitchBankProof`) — the event's accounts, then
 * the screenshot and the reference — posted to `api/category-change/proof`.
 * Once a proof is in it reads as received, as `SwitchConfirm` does, and the
 * form comes back only on *Replace proof*.
 */

import React, { useState } from 'react';
import { CircleCheck } from 'lucide-react';
import type { BankAccountView } from '@/lib/bank-accounts';
import SwitchBankProof from '../../logistics/[token]/SwitchBankProof';

export default function ChangeBankProof({
  token,
  amount,
  toCategory,
  bankAccounts,
  submittedReference,
}: {
  token: string;
  /** "₱400.00", the exact figure to send. */
  amount: string;
  toCategory: string;
  bankAccounts: BankAccountView[];
  /** The reference already sent, or null while no proof is in. */
  submittedReference: string | null;
}) {
  const [replacing, setReplacing] = useState(false);
  const proofIn = submittedReference !== null;

  if (proofIn && !replacing) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-[16px] border border-emerald-400/20 bg-emerald-400/5 p-4 text-left">
          <CircleCheck size={20} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
          <p className="m-0 text-sm leading-relaxed text-secondary">
            We received your proof, reference <strong className="text-white [overflow-wrap:anywhere]">{submittedReference}</strong>.
            We check it against our account, then move you to {toCategory} and email you. Your seat stays held meanwhile.
          </p>
        </div>
        <button type="button" onClick={() => setReplacing(true)} className="btn-secondary justify-center">
          Replace proof
        </button>
      </div>
    );
  }

  return (
    <SwitchBankProof
      token={token}
      amount={amount}
      bankAccounts={bankAccounts}
      replacing={proofIn}
      onCancel={proofIn ? () => setReplacing(false) : undefined}
      endpoint="/api/category-change/proof"
    />
  );
}
