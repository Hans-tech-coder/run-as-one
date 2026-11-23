"use client";

/**
 * *Where did you send the payment?* — the account a bank transfer went into
 * (PAYMENT_CHANNELS_PLAN.md D1, D2). The runner picks one of the event's
 * accounts beside the reference field; staff confirm it when they validate.
 *
 * Asked only when there is a choice: with one account the answer is that
 * account (`paidToFor`) and nothing is shown, and a free order is never asked
 * because the caller does not render it. The server checks the answer against
 * the event's own accounts (`asPaidTo` in `lib/payment-channel.ts`) whatever
 * this sends.
 *
 * Shared by both sign-up wizards' bank-transfer step and the pay links'
 * `SwitchBankProof` (delivery switch and category change).
 */

import React from "react";
import FieldError from "@/components/ui/FieldError";

type Account = { id: string; bankName: string };

/**
 * The `paidTo` to send: the only account when there is one, otherwise what
 * the runner picked ("" until they pick).
 */
export function paidToFor(accounts: readonly Account[], picked: string): string {
  return accounts.length === 1 ? accounts[0].bankName : picked;
}

/** Whether the runner still has to answer before the form can go. */
export function paidToMissing(accounts: readonly Account[], picked: string): boolean {
  return accounts.length > 1 && !picked;
}

export default function PaidToPicker({
  id,
  accounts,
  value,
  onChange,
  error,
}: {
  /** Prefix for the radios' ids, the error's id, and focus on a refusal. */
  id: string;
  accounts: readonly Account[];
  value: string;
  onChange: (bankName: string) => void;
  error?: string;
}) {
  if (accounts.length < 2) return null;
  const errorId = `${id}-error`;

  return (
    <fieldset
      id={id}
      className="m-0 min-w-0 border-0 p-0"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-2 p-0 font-bold text-white">
        Where Did You Send the Payment? <span className="text-red-500">*</span>
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
        {accounts.map((account, index) => {
          const checked = value === account.bankName;
          return (
            <label
              key={account.id}
              htmlFor={`${id}-${index}`}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${
                checked
                  ? "border-accent-blue bg-accent-blue/10"
                  : error
                    ? "border-red-500/60 bg-black/40 hover:border-white/30"
                    : "border-white/10 bg-black/40 hover:border-white/30"
              }`}
            >
              <input
                id={`${id}-${index}`}
                type="radio"
                name={id}
                value={account.bankName}
                checked={checked}
                onChange={() => onChange(account.bankName)}
                className="h-5 w-5 shrink-0 accent-accent-blue"
              />
              <span className="min-w-0 break-words font-semibold text-white">
                {account.bankName}
              </span>
            </label>
          );
        })}
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
