"use client";

/**
 * Where a *Ship kits* switch sends the kits (`ShipKitsPanel.tsx`), laid out
 * like the registration wizard's Logistics step (`DeliveryStep.tsx`,
 * `DeliveryAddressFields.tsx`): Runner 1's home address as a card with
 * Change, the delivery fee under it, then ZIP, landmark and *Someone else
 * will receive the kit* with the receiver's name and mobile. The rules are
 * the wizard's own (`delivery-address.ts`, `delivery.ts`); only the controls
 * are the admin's, since the wizard's are drawn for its dark page and this
 * panel follows the dashboard's light or dark theme. The place pickers are
 * `RunnerAddressEditor`, the edit modal's.
 *
 * When Runner 1 has no home address on file (registered before addresses were
 * asked, RUNNER_ADDRESS_PLAN.md) there is no card: the fields start open and
 * nothing says the address came from home.
 */

import React from 'react';
import { Check, Home, Pencil } from 'lucide-react';
import { DEFAULT_COUNTRY } from '@/lib/phone';
import { upperCaseAsTyped } from '@/lib/text-case';
import PhoneField from '@/app/events/[slug]/register/PhoneField';
import { ADDRESS_PART_LABELS } from '@/app/events/[slug]/register/delivery-address';
import RunnerAddressEditor from './RunnerAddressEditor';
import type { ShipKitsState } from './useShipKits';

export default function ShipKitsAddress(props: ShipKitsState) {
  const { receipt, address, setAddress, ownAddress, hasHome, homeText, zoneNote } = props;
  const homeLabel = receipt.runners.length === 1 ? "the runner's home address" : "Runner 1's home address";
  const note = zoneNote?.error ? (
    <p className="text-xs text-[var(--status-warning)]" role="status">{zoneNote.error}</p>
  ) : zoneNote?.text ? (
    <p className="text-xs text-[var(--text-muted)]">{zoneNote.text}</p>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="font-medium text-primary">Delivery Address</p>
          {ownAddress && hasHome && (
            <button
              type="button"
              onClick={props.useHomeAddress}
              className="inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-[var(--accent-blue-text)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0"
            >
              <Home size={14} aria-hidden="true" />
              Use {homeLabel}
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          {!hasHome
            ? `${receipt.runners.length === 1 ? 'The runner has' : 'Runner 1 has'} no home address on file. Type where the kits go.`
            : ownAddress
              ? 'Type where the kits go.'
              : 'Add a ZIP code or landmark if it helps the courier find the door.'}
        </p>
      </div>

      {ownAddress ? (
        <div className="space-y-2">
          <RunnerAddressEditor
            value={{
              addressStreet: address.street,
              addressBarangay: address.barangay,
              addressCity: address.city,
              addressProvince: address.province,
            }}
            onChange={patch =>
              setAddress({
                ...(patch.addressStreet !== undefined ? { street: patch.addressStreet } : {}),
                ...(patch.addressBarangay !== undefined ? { barangay: patch.addressBarangay } : {}),
                ...(patch.addressCity !== undefined ? { city: patch.addressCity } : {}),
                ...(patch.addressProvince !== undefined ? { province: patch.addressProvince } : {}),
              })
            }
          />
          {note}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--dash-border)] bg-[var(--ink-02)] px-4 py-3">
            <Home size={16} className="shrink-0 text-[var(--accent-blue-text)]" aria-hidden="true" />
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-xs text-secondary">Deliver to {homeLabel}</p>
              <p className="text-sm leading-relaxed text-primary [overflow-wrap:anywhere]">{homeText}</p>
            </div>
            <button
              type="button"
              onClick={props.typeOwnAddress}
              className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-[var(--dash-border)] bg-[var(--ink-05)] px-4 min-h-11 text-sm font-semibold text-primary transition-colors hover:bg-[var(--ink-10)] cursor-pointer"
            >
              <Pencil size={14} aria-hidden="true" />
              Change
            </button>
          </div>
          {note}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3">
        <div className="space-y-1.5">
          <label htmlFor="ship-kits-zip" className="block text-secondary">
            {ADDRESS_PART_LABELS.zip} <span className="text-[var(--text-muted)]">(optional)</span>
          </label>
          <input
            id="ship-kits-zip"
            autoComplete="off"
            inputMode="numeric"
            maxLength={4}
            value={address.zip}
            onChange={e => setAddress({ zip: e.target.value.replace(/\D/g, '') })}
            placeholder="e.g. 2300"
            className="form-input w-full text-base"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ship-kits-landmark" className="block text-secondary">
            {ADDRESS_PART_LABELS.landmark} <span className="text-[var(--text-muted)]">(optional)</span>
          </label>
          <textarea
            id="ship-kits-landmark"
            rows={2}
            maxLength={200}
            value={address.landmark}
            onChange={e => setAddress({ landmark: upperCaseAsTyped(e.target.value) })}
            placeholder="e.g. BLUE GATE ACROSS 7-ELEVEN"
            className="form-input w-full text-base"
          />
        </div>
      </div>

      <div>
        <label className="group flex items-center gap-3 cursor-pointer w-fit min-h-11">
          {/* A real checkbox, visually hidden: the box beside it carries the look, as in the wizard. */}
          <input
            type="checkbox"
            className="sr-only peer"
            checked={address.otherReceiver}
            onChange={e => setAddress({ otherReceiver: e.target.checked })}
          />
          <span
            aria-hidden="true"
            className={`shrink-0 w-5 h-5 rounded-[6px] border-2 flex items-center justify-center transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ink-30)] ${
              address.otherReceiver ? 'border-accent-blue bg-accent-blue' : 'border-[var(--ink-30)] group-hover:border-[var(--ink-50)]'
            }`}
          >
            {address.otherReceiver && <Check size={14} strokeWidth={3} className="text-white" />}
          </span>
          <span className="text-sm text-primary">Someone else will receive the kit</span>
        </label>
        <p className="text-xs text-[var(--text-muted)]">
          {address.otherReceiver
            ? 'The courier will ask for this person at the door.'
            : `Otherwise the courier will look for ${receipt.runners.length === 1 ? 'the runner' : 'Runner 1'} at this address.`}
        </p>
      </div>

      {address.otherReceiver && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="ship-kits-receiver-name" className="block text-secondary">
              {ADDRESS_PART_LABELS.receiverName}
            </label>
            <input
              id="ship-kits-receiver-name"
              autoComplete="off"
              maxLength={80}
              value={address.receiverName}
              onChange={e => setAddress({ receiverName: upperCaseAsTyped(e.target.value) })}
              placeholder="e.g. MARIA SANTOS"
              className="form-input w-full text-base"
            />
          </div>
          <div className="min-w-0">
            <PhoneField
              id="ship-kits-receiver-phone"
              label={ADDRESS_PART_LABELS.receiverPhone}
              value={address.receiverPhone}
              defaultCountry={DEFAULT_COUNTRY}
              onChange={next => setAddress({ receiverPhone: next })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
