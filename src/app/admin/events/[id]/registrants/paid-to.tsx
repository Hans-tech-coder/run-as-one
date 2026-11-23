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
import { PAYMONGO_LABEL, UNTAGGED_LABEL, channelOf, normalizePaidTo } from '@/lib/payment-channel';

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

/**
 * The channel a registrant row's payment came in through (D4), read from the
 * method code the row carries. The table's *Paid To* column and filter and the
 * CSV's Paid To all ask this, so they can never disagree. Re-read on every
 * render, so a row just tagged or corrected moves channel at once.
 */
export function rowChannel(row: { paymentMethodCode?: string | null; paidTo?: string | null }) {
  return channelOf({ paymentMethod: row.paymentMethodCode, paidTo: row.paidTo });
}

/**
 * `?paidTo=` as a *Paid to* filter value (a channel key: `paymongo`,
 * `untagged` or `account:<name>`), or null for anything else. The remittance
 * page's *Untagged* line links here with `?paidTo=untagged`.
 */
export function paidToFilterFromUrl(value: string | undefined): string | null {
  const raw = (value ?? '').trim().toLowerCase();
  if (raw === 'paymongo' || raw === 'untagged') return raw;
  const name = raw.startsWith('account:') ? normalizePaidTo(raw.slice('account:'.length)) : '';
  return name ? `account:${name}` : null;
}

/**
 * The *Paid to* filter's choices: the race's accounts in the order the runner
 * sees them, then any other account name a row carries (an account since
 * renamed or removed), then PayMongo and Untagged when a row has one. A
 * choice already selected stays listed so it can be unticked.
 */
export function paidToFilterOptions(
  accounts: readonly string[],
  rows: readonly { paymentMethodCode?: string | null; paidTo?: string | null }[],
  selected: readonly string[],
): { value: string; label: string }[] {
  const options = new Map<string, string>();
  for (const account of accounts) {
    const key = normalizePaidTo(account);
    if (key && !options.has(`account:${key}`)) options.set(`account:${key}`, account.trim());
  }
  const fixed = new Set<string>();
  for (const row of rows) {
    const channel = rowChannel(row);
    if (!channel) continue;
    if (channel.kind === 'ACCOUNT') {
      if (!options.has(channel.key)) options.set(channel.key, channel.label);
    } else {
      fixed.add(channel.key);
    }
  }
  if (fixed.has('paymongo') || selected.includes('paymongo')) options.set('paymongo', PAYMONGO_LABEL);
  if (fixed.has('untagged') || selected.includes('untagged')) options.set('untagged', UNTAGGED_LABEL);
  for (const value of selected) {
    if (!options.has(value)) options.set(value, value.replace(/^account:/, ''));
  }
  return [...options].map(([value, label]) => ({ value, label }));
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
  label = 'Paid To',
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
