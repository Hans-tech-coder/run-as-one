"use client";

import React, { useState } from 'react';
import { Landmark, Plus, Trash, Trash2, UploadCloud } from 'lucide-react';
import { blankBankAccount, type BankAccountDraft } from './bank-account-draft';

/**
 * The accounts runners transfer to for this event.
 *
 * Every event needs its own: these used to be a constant in the bundle, which
 * meant every organizer's runners were shown the same three banks. An event
 * with none configured simply does not offer bank transfer, which is why the
 * empty state says so rather than looking like an optional extra.
 *
 * Each account is a card rather than a table row because of the QR, which is a
 * full-width image with nowhere to sit in a row of three inputs — the same
 * reason CategoriesPanel uses cards.
 */
export default function BankAccountsPanel({
  accounts,
  offersBankTransfer,
  onChange,
  onError,
  onBusyChange,
}: {
  accounts: BankAccountDraft[];
  /** Whether this event's checkout can take a bank transfer at all. */
  offersBankTransfer: boolean;
  onChange: (next: BankAccountDraft[]) => void;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const update = (index: number, field: keyof BankAccountDraft, value: string) => {
    const next = [...accounts];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  };

  const remove = (index: number) => {
    const next = [...accounts];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">Bank Transfer Accounts</h2>
      </div>
      <div className="admin-panel-content">
        <p className="text-sm opacity-70 mb-6">
          Where runners send payment when they choose bank transfer. Shown to them
          with the account details and, if you upload one, a QR to scan.
          {!offersBankTransfer && (
            <>
              {' '}
              This event&apos;s registration form does not currently offer bank
              transfer, so these will not be shown until it does.
            </>
          )}
        </p>

        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center">
            <Landmark size={28} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm m-0 mb-1">No accounts added yet.</p>
            <p className="text-xs opacity-70 m-0">
              {offersBankTransfer
                ? 'Runners cannot pay by bank transfer until you add at least one.'
                : 'Add one if you plan to switch this event to bank transfer.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {accounts.map((account, idx) => (
              <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-secondary uppercase tracking-wider">
                    Account {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="btn-remove"
                    title="Remove Account"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Bank / Wallet</label>
                    <input
                      type="text"
                      value={account.bankName}
                      onChange={e => update(idx, 'bankName', e.target.value)}
                      className="form-input"
                      placeholder="BDO Unibank"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Account Name</label>
                    <input
                      type="text"
                      value={account.accountName}
                      onChange={e => update(idx, 'accountName', e.target.value)}
                      className="form-input"
                      placeholder="Juan Dela Cruz"
                    />
                  </div>
                  <div className="form-group form-group-full">
                    <label className="form-label">
                      Account Number{' '}
                      <span className="text-xs opacity-70">
                        - shown exactly as you type it, spacing and all
                      </span>
                    </label>
                    <input
                      type="text"
                      value={account.accountNumber}
                      onChange={e => update(idx, 'accountNumber', e.target.value)}
                      className="form-input"
                      placeholder="0012 3456 7890"
                    />
                  </div>
                </div>

                <QrField
                  value={account.qrImageUrl ?? ''}
                  bankName={account.bankName}
                  onChange={url => update(idx, 'qrImageUrl', url)}
                  onError={onError}
                  onBusyChange={onBusyChange}
                />
              </div>
            ))}
          </div>
        )}

        <div className="pt-6">
          <button
            type="button"
            onClick={() => onChange([...accounts, blankBankAccount()])}
            className="btn-add"
          >
            <Plus size={16} /> Add Account
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The optional QR for one account.
 *
 * Deliberately not PosterField: that one is labelled and worded for a category
 * inclusions poster, and reusing it here would put "Inclusions Poster" above a
 * bank QR. The upload mechanics are the same few lines either way.
 */
function QrField({
  value,
  bankName,
  onChange,
  onError,
  onBusyChange,
}: {
  value: string;
  bankName: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    onBusyChange(true);
    try {
      const body = new FormData();
      body.append('file', file);

      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      onChange(data.url);
    } catch (err: any) {
      onError(err.message || 'Upload failed');
      // Clearing lets the organizer retry the same file; otherwise the input
      // holds it and re-picking it fires no change event.
      e.target.value = '';
    } finally {
      setUploading(false);
      onBusyChange(false);
    }
  };

  return (
    <div className="form-group form-group-full">
      <label className="form-label">
        Payment QR <span className="text-xs opacity-70">- optional</span>
      </label>
      {!value ? (
        <div className="file-upload-wrapper" style={{ opacity: uploading ? 0.6 : 1 }}>
          <input
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="file-upload-input"
            disabled={uploading}
          />
          <div className="file-upload-content">
            <div className="file-upload-icon">
              <UploadCloud size={32} />
            </div>
            <div className="file-upload-title">
              {uploading ? 'Uploading…' : 'Click to upload QR'}
            </div>
            <div className="file-upload-desc">
              PNG or JPG • the QR runners scan to pay this account
            </div>
          </div>
        </div>
      ) : (
        <div className="file-preview">
          <img src={value} alt={bankName ? `${bankName} QR` : 'Payment QR'} />
          <div className="file-preview-overlay">
            <button type="button" onClick={() => onChange('')} className="btn-remove-preview">
              <Trash size={16} /> Remove QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
