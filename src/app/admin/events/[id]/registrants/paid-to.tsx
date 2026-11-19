"use client";

/**
 * *Paid to* on the registrants screen (PAYMENT_CHANNELS_PLAN.md Batch 3): the
 * bank-transfer account a payment went into, as staff confirm, record, correct
 * or tag it. The race's account names come down once from page.tsx through
 * `PaidToAccountsProvider`, wrapped around the whole table, so every hook and
 * modal that asks reads the same list without it being threaded through each.
 *
 * What the server accepts is decided there, by `asPaidTo` / `staffPaidTo` in
 * lib/payment-channel.ts; this only offers the same names.
 */

import React, { createContext, useContext, useState } from 'react';
import AdminSelect from '../../../AdminSelect';
import { UNTAGGED_LABEL, normalizePaidTo } from '@/lib/payment-channel';

const PaidToAccounts = createContext<readonly string[]>([]);

/** The race's account names, in the order the runner sees them. */
export function PaidToAccountsProvider({ accounts, children }: { accounts: string[]; children: React.ReactNode }) {
  return <PaidToAccounts.Provider value={accounts}>{children}</PaidToAccounts.Provider>;
}

/** Whether a staff record still has to say which account (several, none picked). */
export function paidToMissing(accounts: readonly string[], value: string): boolean {
  return accounts.length > 1 && !value;
}

export function usePaidToAccounts(): readonly string[] {
  return useContext(PaidToAccounts);
}

/** What a screen prints for an order's or a change's `paidTo`. */
export function paidToLabel(paidTo: string | null | undefined): string {
  return paidTo || UNTAGGED_LABEL;
}

/**
 * Where a staff pick starts: the stored account when it is still one of the
 * race's (in the account's own spelling), the only account when there is one,
 * otherwise nothing picked.
 */
export function initialPaidTo(stored: string | null | undefined, accounts: readonly string[]): string {
  const key = normalizePaidTo(stored);
  const match = key ? accounts.find(account => normalizePaidTo(account) === key) : undefined;
  if (match) return match;
  return accounts.length === 1 ? accounts[0] : '';
}

/**
 * A pick that starts at `initialPaidTo(stored)` and follows `stored` until
 * staff choose, so a modal reused for another change starts from that one's.
 */
export function usePaidToPick(stored: string | null | undefined) {
  const accounts = usePaidToAccounts();
  const [picked, setPicked] = useState<{ for: string | null | undefined; value: string } | null>(null);
  const value = picked && picked.for === stored ? picked.value : initialPaidTo(stored, accounts);
  return { value, setValue: (next: string) => setPicked({ for: stored, value: next }), accounts };
}

/**
 * The *Paid to* field. Renders nothing for a race with no accounts, where a
 * staff record stays *Untagged* (`staffPaidTo`).
 */
export function PaidToSelect({
  id,
  value,
  onChange,
  error,
  hint,
  label = 'Paid to',
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  hint?: React.ReactNode;
  label?: React.ReactNode;
}) {
  const accounts = usePaidToAccounts();
  if (accounts.length === 0) return null;
  return (
    <AdminSelect
      id={id}
      label={label}
      value={value}
      options={accounts.map(account => ({ value: account, label: account }))}
      placeholder="Choose the account"
      listboxLabel="Accounts"
      onChange={onChange}
      error={error}
      hint={hint}
    />
  );
}

/**
 * *Correct payment*'s Paid to section (lib/payment-correction.ts): the account
 * on file beside the one that replaces it, as the Transaction No. section
 * shows its before and after.
 */
export function CorrectionPaidTo({
  current,
  value,
  onChange,
  changed,
}: {
  current: string | null;
  value: string;
  onChange: (next: string) => void;
  changed: boolean;
}) {
  return (
    <section className="space-y-3">
      <h4 className="m-0 text-sm font-semibold text-primary">Paid to</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-sunken)] px-4 py-3">
          <p className="m-0 text-xs text-[var(--text-muted)]">On file now</p>
          <p className={`m-0 mt-1 font-medium [overflow-wrap:anywhere] ${current ? 'text-primary' : 'text-[var(--text-muted)] italic'}`}>
            {paidToLabel(current)}
          </p>
        </div>
        <div className="min-w-0">
          <PaidToSelect
            id="correction-paid-to"
            label="Corrected account"
            value={value}
            onChange={onChange}
            hint={changed ? 'Will replace the one on file.' : 'Unchanged. Pick another to correct it.'}
          />
        </div>
      </div>
    </section>
  );
}
