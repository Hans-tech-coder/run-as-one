"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import { FileText, UploadCloud } from 'lucide-react';
import AdminSelect from '../../../../AdminSelect';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, PDF_TYPE, acceptAttribute, allowedTypes, describeUploadTypes } from '@/lib/uploads';
import { useImageCompression } from '@/lib/image-compress';
import { pickupLabel } from '@/lib/pickup';
import { formatPesos } from '@/lib/money';
import {
  deliveryProvinceOf,
  deliveryTiers,
  needsDeliveryZoneChoice,
  offersDelivery,
} from '@/app/events/[slug]/register/delivery';
import { PaidToSelect } from '../paid-to';
import type { Kit, OrderDraft, StaffEvent } from './staff-registration';

/**
 * The order half of the staff registration form: how the kit reaches the
 * runner, the payment the runner sent (screenshot, reference, account), and
 * the staff member's confirmation of the runner's waiver consent.
 */

export type OrderErrors = Partial<Record<'zone' | 'proofFile' | 'transactionNumber' | 'paidTo' | 'consent', React.ReactNode>>;

export const ORDER_FIELD_IDS = {
  zone: 'staff-order-zone',
  proofFile: 'staff-order-proof',
  transactionNumber: 'staff-order-reference',
  paidTo: 'staff-order-paid-to',
  consent: 'staff-order-consent',
} as const;

/** Kept in step with `MAX_TRANSACTION_NUMBER` in lib/category-change-hold.ts. */
const MAX_REFERENCE = 100;

export default function StaffOrderPanel({
  event,
  kit,
  setKit,
  order,
  setOrder,
  errors,
  clearError,
  setProofError,
  disabled,
  canValidate,
}: {
  event: StaffEvent;
  kit: Kit;
  setKit: (patch: Partial<Kit>) => void;
  order: OrderDraft;
  setOrder: (patch: Partial<OrderDraft>) => void;
  errors: OrderErrors;
  clearError: (field: keyof OrderErrors) => void;
  setProofError: (message: string) => void;
  disabled: boolean;
  /** Offers "I checked the money landed" (PAID on entry) to validators only. */
  canValidate: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { optimizing, compress } = useImageCompression('proof');
  const delivers = offersDelivery(event);
  const autoZone = deliveryProvinceOf(event) !== null;
  const askZone = !autoZone && needsDeliveryZoneChoice(event);

  const methods = [
    ...(event.pickup ? [{ value: 'PICKUP', label: pickupLabel(event) }] : []),
    ...(delivers ? [{ value: 'DELIVERY', label: 'Delivery' }] : []),
  ];

  // The picked image, previewed; its object URL freed when it is replaced.
  const proofUrl = useMemo(
    () => (order.proofFile && order.proofFile.type !== PDF_TYPE ? URL.createObjectURL(order.proofFile) : null),
    [order.proofFile],
  );
  useEffect(() => () => {
    if (proofUrl) URL.revokeObjectURL(proofUrl);
  }, [proofUrl]);

  const pickFile = async (picked: File | null) => {
    clearError('proofFile');
    if (!picked) return;
    if (!allowedTypes('proof').includes(picked.type)) {
      setProofError(`The screenshot must be a ${describeUploadTypes('proof')} file.`);
      return;
    }
    const file = await compress(picked);
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setProofError(`The screenshot must be ${MAX_UPLOAD_MB} MB or smaller.`);
      return;
    }
    setOrder({ proofFile: file });
  };

  return (
    <>
      <section className="admin-panel" aria-labelledby="staff-kit-title">
        <div className="admin-panel-header">
          <h2 id="staff-kit-title" className="admin-panel-title">Race Kit</h2>
        </div>
        <div className="admin-panel-content flex flex-col gap-4">
          {methods.length > 1 ? (
            <AdminSelect
              id="staff-order-method"
              label="How the Kit Reaches the Runner"
              listboxLabel="Kit options"
              value={kit.method}
              options={methods}
              onChange={method => setKit({ method: method as Kit['method'] })}
            />
          ) : (
            <p className="m-0 text-sm text-primary">{methods[0]?.label ?? pickupLabel(event)}</p>
          )}
          {kit.method === 'DELIVERY' && (
            <>
              <p className="m-0 text-xs text-[var(--text-muted)]">
                Ships to Runner 1’s home address, one parcel for the whole order, as on the website.
                {autoZone && ' The fee follows that address’s province.'}
              </p>
              {askZone && (
                <AdminSelect
                  id={ORDER_FIELD_IDS.zone}
                  label="Delivery Area"
                  listboxLabel="Delivery areas"
                  value={kit.zone}
                  placeholder="Choose the area"
                  options={deliveryTiers(event).map(tier => ({ value: tier.zone, label: tier.label, hint: formatPesos(tier.fee) }))}
                  error={typeof errors.zone === 'string' ? errors.zone : undefined}
                  onChange={zone => {
                    setKit({ zone });
                    clearError('zone');
                  }}
                />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label" htmlFor="staff-order-zip">
                    ZIP Code <span className="text-xs opacity-70">- optional</span>
                  </label>
                  <input id="staff-order-zip" inputMode="numeric" value={kit.zip} onChange={e => setKit({ zip: e.target.value })} className="form-input" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="staff-order-landmark">
                    Landmark <span className="text-xs opacity-70">- optional</span>
                  </label>
                  <input id="staff-order-landmark" value={kit.landmark} onChange={e => setKit({ landmark: e.target.value })} className="form-input" />
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="admin-panel" aria-labelledby="staff-payment-title">
        <div className="admin-panel-header">
          <h2 id="staff-payment-title" className="admin-panel-title">Payment the Runner Sent</h2>
        </div>
        <div className="admin-panel-content flex flex-col gap-5">
          <div className="form-group">
            <span className="form-label" id="staff-order-proof-label">Payment Screenshot</span>
            {order.proofFile ? (
              <div className="relative h-44 w-full overflow-hidden rounded-panel border border-[var(--dash-border)] bg-[var(--dash-sunken)] flex items-center justify-center">
                {proofUrl ? (
                  <img src={proofUrl} alt="The payment screenshot" className="max-w-full max-h-full object-contain" />
                ) : (
                  <FileText size={28} className="text-secondary" aria-hidden="true" />
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 pl-3 pr-1 bg-[var(--dash-panel-solid)] border-t border-[var(--dash-border)]">
                  <span className="text-xs text-primary min-w-0 truncate">{order.proofFile.name}</span>
                  <button
                    type="button"
                    className="shrink-0 min-h-11 px-2 text-xs font-medium text-accent-blue-ink hover:underline bg-transparent border-none cursor-pointer"
                    onClick={() => {
                      setOrder({ proofFile: null });
                      if (fileRef.current) fileRef.current.value = '';
                    }}
                    disabled={disabled}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="file-upload-wrapper h-44" style={{ padding: '0.75rem' }}>
                <input
                  ref={fileRef}
                  id={ORDER_FIELD_IDS.proofFile}
                  type="file"
                  accept={acceptAttribute('proof')}
                  className="file-upload-input"
                  onChange={e => pickFile(e.target.files?.[0] ?? null)}
                  disabled={disabled}
                  aria-labelledby="staff-order-proof-label"
                  aria-invalid={errors.proofFile ? true : undefined}
                  aria-describedby={errors.proofFile ? 'staff-order-proof-error' : undefined}
                />
                <div className="file-upload-content">
                  <UploadCloud size={22} className="text-accent-blue-ink" aria-hidden="true" />
                  <div className="text-sm text-primary">Upload the GCash or Bank Screenshot</div>
                  <div className="text-xs">
                    {describeUploadTypes('proof')}, up to {MAX_UPLOAD_MB} MB
                  </div>
                </div>
              </div>
            )}
            {optimizing && (
              <p role="status" className="m-0 text-xs text-secondary">
                <BusyLabel>Optimizing Image</BusyLabel>
              </p>
            )}
            <FieldError id="staff-order-proof-error" message={errors.proofFile} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label" htmlFor={ORDER_FIELD_IDS.transactionNumber}>Reference No.</label>
              <input
                id={ORDER_FIELD_IDS.transactionNumber}
                value={order.transactionNumber}
                maxLength={MAX_REFERENCE}
                onChange={e => {
                  setOrder({ transactionNumber: e.target.value });
                  clearError('transactionNumber');
                }}
                placeholder="As printed on the screenshot"
                className="form-input"
                disabled={disabled}
                aria-invalid={errors.transactionNumber ? true : undefined}
                aria-describedby={errors.transactionNumber ? 'staff-order-reference-error' : undefined}
              />
              <FieldError id="staff-order-reference-error" message={errors.transactionNumber} />
            </div>
            <PaidToSelect
              id={ORDER_FIELD_IDS.paidTo}
              value={order.paidTo}
              onChange={paidTo => {
                setOrder({ paidTo });
                clearError('paidTo');
              }}
              error={typeof errors.paidTo === 'string' ? errors.paidTo : undefined}
            />
          </div>

          {/* Validating as it is entered (the owner, 2026-11-25). Off by
              default: a screenshot alone is not a check of the account. */}
          {canValidate && (
            <label
              htmlFor="staff-order-payment-checked"
              className={`flex items-start gap-3 rounded-control border px-4 py-3 cursor-pointer min-h-11 ${
                order.paymentChecked
                  ? 'border-[color-mix(in_srgb,var(--status-success)_45%,transparent)] bg-[color-mix(in_srgb,var(--status-success)_8%,transparent)]'
                  : 'border-[var(--dash-border)] bg-[var(--ink-02)]'
              }`}
            >
              <input
                id="staff-order-payment-checked"
                type="checkbox"
                checked={order.paymentChecked}
                onChange={e => setOrder({ paymentChecked: e.target.checked })}
                disabled={disabled}
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-describedby="staff-order-payment-checked-hint"
              />
              <span className="text-sm">
                <span className="block text-primary font-medium">
                  I checked the money landed in {order.paidTo || 'the account'}
                </span>
                <span id="staff-order-payment-checked-hint" className="block text-xs text-[var(--text-muted)] mt-0.5">
                  The order is saved as Paid, with you as the validator, and the runner gets the receipt. Leave it
                  off if you only saw the screenshot; it then waits in Needs Validation.
                </span>
              </span>
            </label>
          )}

          <div>
            <label
              htmlFor={ORDER_FIELD_IDS.consent}
              className="flex items-start gap-3 rounded-control border border-[var(--dash-border)] bg-[var(--ink-02)] px-4 py-3 cursor-pointer min-h-11"
            >
              <input
                id={ORDER_FIELD_IDS.consent}
                type="checkbox"
                checked={order.consent}
                onChange={e => {
                  setOrder({ consent: e.target.checked });
                  clearError('consent');
                }}
                disabled={disabled}
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby="staff-order-consent-hint"
              />
              <span className="text-sm">
                <span className="block text-primary font-medium">
                  The runner agreed to the waiver (over Messenger or a call)
                </span>
                <span id="staff-order-consent-hint" className="block text-xs text-[var(--text-muted)] mt-0.5">
                  The Disclaimer, Consent &amp; Data Privacy Waiver, the same one the website asks for. Your name is
                  recorded as the one who confirmed it.
                </span>
              </span>
            </label>
            <FieldError id="staff-order-consent-error" message={errors.consent} />
          </div>
        </div>
      </section>
    </>
  );
}
