"use client";

/**
 * The sections of Switch to delivery / Switch to pickup
 * (`LogisticsChangeModal.tsx`, LOGISTICS_CHANGE_PLAN.md Session 2): where the
 * kits go and which orders join (L2, L5, L6), the riders that go back with a
 * reverse (L10), the live quote's parcels, and how a fee is paid. Split out of
 * the modal to keep each file under the size the repository splits files at;
 * every section reads the same props the hook hands the modal.
 */

import React from 'react';
import { TriangleAlert, Link2, Landmark } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';
import { formatPesos } from '@/lib/money';
import { formatRunnerAddress } from '@/lib/runner-address';
import {
  CHANGE_PAYMENT_CHOICES,
  ONLINE_CHANGE_HOLD_HOURS,
  OUTSIDE_CHANGE_HOLD_DAYS,
} from '@/lib/category-change-hold';
import { paymentMethodLabel } from '@/lib/registration-codes';
import { deliveryTiers } from '@/app/events/[slug]/register/delivery';
import RunnerAddressEditor from './RunnerAddressEditor';
import type { useLogisticsChangeModal } from './useLogisticsChangeModal';

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

export type SwitchModalProps = ReturnType<typeof useLogisticsChangeModal>['modalProps'];
type Props = SwitchModalProps;

/** A radio tile, the same as Change category's option tiles. */
function Tile({
  name,
  checked,
  onChange,
  title,
  hint,
  icon,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <label
      className={`flex min-h-11 items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ink-30)] ${
        checked ? 'border-accent-blue bg-accent-blue/10' : 'border-[var(--dash-border)] bg-[var(--ink-02)] hover:border-[var(--ink-20)]'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
          checked ? 'border-accent-blue bg-accent-blue shadow-[inset_0_0_0_2px_var(--dash-panel-solid)]' : 'border-[var(--ink-30)]'
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-1.5 text-primary ${checked ? 'font-semibold' : 'font-medium'}`}>
          {icon}
          {title}
        </span>
        {hint && <span className="block text-xs text-[var(--text-muted)]">{hint}</span>}
      </span>
    </label>
  );
}

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-primary">
      <TriangleAlert size={18} className="shrink-0 text-[var(--status-warning)]" aria-hidden="true" />
      <p className="m-0">{children}</p>
    </div>
  );
}

/** The parcels and what each costs, from the live quote. */
export function SwitchQuote({ quote, onlineFee, needsPayment, paymentChoice, existingRef }: {
  quote: Extract<NonNullable<Props['quote']>, { ok: true }>;
  onlineFee: number;
  needsPayment: boolean;
  paymentChoice: Props['paymentChoice'];
  existingRef: (registrationId: string) => string;
}) {
  return (
    <div className="rounded-lg border border-[var(--dash-border)] p-3 space-y-2" aria-live="polite">
      <ol className="m-0 p-0 list-none space-y-1.5">
        {quote.parcels.map((parcel, i) => (
          <li key={i} className="flex items-start justify-between gap-3">
            <span className="min-w-0 text-secondary [overflow-wrap:anywhere]">
              {quote.parcels.length > 1 ? `Parcel ${i + 1}: ` : ''}
              {formatRunnerAddress(parcel.address) || 'No address'}
              {parcel.ridesOnRegistrationId && (
                <span className="block text-xs text-[var(--text-muted)]">
                  Ships with {existingRef(parcel.ridesOnRegistrationId)}, already paid
                </span>
              )}
            </span>
            <span className="tabular-nums whitespace-nowrap text-primary">{peso(parcel.fee)}</span>
          </li>
        ))}
      </ol>
      {needsPayment && paymentChoice === CHANGE_PAYMENT_CHOICES.ONLINE && onlineFee > 0 && (
        <p className="m-0 flex justify-between text-xs text-[var(--text-muted)]">
          <span>Transaction fee</span>
          <span className="tabular-nums">{peso(onlineFee)}</span>
        </p>
      )}
      <p className="m-0 flex justify-between border-t border-[var(--dash-border)] pt-2 font-semibold text-primary">
        <span>{quote.fee > 0 ? 'Runner pays' : 'Nothing to pay'}</span>
        <span className="tabular-nums">{peso(quote.totalCharged || quote.fee)}</span>
      </p>
      <p className="m-0 text-xs text-[var(--text-muted)]">
        {quote.fee > 0
          ? 'The order stays on pickup until the fee is paid. The receipt is not changed.'
          : 'Switches at once. The receipt is not changed.'}
      </p>
    </div>
  );
}

/** Where the kits go, which orders join (L6), and the zone when staff must pick it (L5). */
export function DeliveryFields(props: Props) {
  const { preview, address, setAddress, zip, setZip, landmark, setLandmark, canSplit, split, setSplit } = props;
  if (!preview) return null;
  const groupSize = preview.order.runners.length + props.offered.filter(o => props.included.includes(o.id)).reduce((n, o) => n + o.runners.length, 0);
  return (
    <>
      {props.offered.length > 0 && (
        <fieldset className="p-0 border-none mx-0 space-y-2">
          <legend className="block text-secondary mb-2 p-0">Same customer&apos;s other pickup orders</legend>
          {props.offered.map(order => (
            <label key={order.id} className="flex min-h-11 items-start gap-3 rounded-lg border border-[var(--dash-border)] px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={props.included.includes(order.id)}
                onChange={() => props.toggleIncluded(order.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ink)]"
              />
              <span className="min-w-0">
                <span className="block font-medium text-primary">Include {order.orderRef}</span>
                <span className="block text-xs text-[var(--text-muted)] [overflow-wrap:anywhere]">
                  {order.runners.map(r => r.name).join(', ')} · ships in the same parcel when it goes to the same address
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {canSplit && (
        <fieldset className="p-0 border-none mx-0">
          <legend className="block text-secondary mb-2 p-0">Ship to</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Tile name="logistics-split" checked={!split} onChange={() => setSplit(false)} title="One address" hint={`All ${groupSize} kits in one parcel`} />
            <Tile name="logistics-split" checked={split} onChange={() => setSplit(true)} title="Each runner's home" hint="One parcel per household" />
          </div>
        </fieldset>
      )}

      {!split && (
        <div className="space-y-3">
          <p className="m-0 text-secondary">Delivery address <span className="text-[var(--text-muted)]">(from Runner 1&apos;s home address)</span></p>
          <RunnerAddressEditor value={address} onChange={setAddress} />
          <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3">
            <div className="space-y-1.5">
              <label htmlFor="logistics-zip" className="block text-secondary">
                ZIP Code <span className="text-[var(--text-muted)]">(optional)</span>
              </label>
              <input
                id="logistics-zip"
                autoComplete="off"
                inputMode="numeric"
                maxLength={4}
                value={zip}
                onChange={e => setZip(e.target.value.replace(/\D/g, ''))}
                className="form-input w-full text-base"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="logistics-landmark" className="block text-secondary">
                Landmark <span className="text-[var(--text-muted)]">(optional)</span>
              </label>
              <input
                id="logistics-landmark"
                autoComplete="off"
                value={landmark}
                onChange={e => setLandmark(e.target.value)}
                className="form-input w-full text-base"
              />
            </div>
          </div>
        </div>
      )}

      {props.zoneChoice && (
        <fieldset className="p-0 border-none mx-0">
          <legend className="block text-secondary mb-2 p-0">Delivery area</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {deliveryTiers(preview.event).map(tier => (
              <Tile
                key={tier.zone}
                name="logistics-zone"
                checked={props.zone === tier.zone}
                onChange={() => props.setZone(tier.zone)}
                title={tier.label}
                hint={peso(tier.fee)}
              />
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}

/** Back to pickup: free, nothing refunded (L9), riders go back with it (L10). */
export function PickupFields(props: Props) {
  const { preview, ridersLeft } = props;
  if (!preview) return null;
  return (
    <div className="space-y-4">
      <p className="m-0 text-secondary">
        The {preview.order.runners.length === 1 ? 'kit is' : 'kits are'} claimed at pickup instead. Nothing is refunded:
        the delivery fee on the receipt stays as paid.
      </p>
      {preview.riders.length > 0 && (
        <fieldset className="p-0 border-none mx-0 space-y-2">
          <legend className="block text-secondary mb-2 p-0">
            Orders shipping with this one at no charge go back to pickup with it
          </legend>
          {preview.riders.map(order => (
            <label key={order.id} className="flex min-h-11 items-start gap-3 rounded-lg border border-[var(--dash-border)] px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={props.included.includes(order.id)}
                onChange={() => props.toggleIncluded(order.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ink)]"
              />
              <span className="min-w-0">
                <span className="block font-medium text-primary">Include {order.orderRef}</span>
                <span className="block text-xs text-[var(--text-muted)] [overflow-wrap:anywhere]">
                  {order.runners.map(r => r.name).join(', ')}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {ridersLeft.length > 0 && (
        <Warning>
          {ridersLeft.map(o => o.orderRef).join(', ')} {ridersLeft.length === 1 ? 'ships' : 'ship'} with this order at no
          charge, so this order cannot go back to pickup alone. Tick {ridersLeft.length === 1 ? 'it' : 'them'} to switch
          together.
        </Warning>
      )}
    </div>
  );
}

/** How the fee is paid: the way the entry was paid (category-change-hold.ts). */
export function PaymentChoice(props: Props) {
  const { quote, paymentChoices, paymentChoice, setPaymentChoice, onlineFee, onlineMethod, choiceError } = props;
  if (!quote?.ok) return null;
  return (
    <fieldset className="p-0 border-none mx-0">
      <legend className="block text-secondary mb-2 p-0">How the runner pays</legend>
      <div className="grid grid-cols-1 gap-2">
        {paymentChoices.includes(CHANGE_PAYMENT_CHOICES.ONLINE) && (
          <Tile
            name="logistics-payment"
            checked={paymentChoice === CHANGE_PAYMENT_CHOICES.ONLINE}
            onChange={() => setPaymentChoice(CHANGE_PAYMENT_CHOICES.ONLINE)}
            icon={<Link2 size={16} aria-hidden="true" />}
            title="Online"
            hint={`Runner pays ${peso(quote.fee + onlineFee)} by ${paymentMethodLabel(onlineMethod)}, ${peso(onlineFee)} transaction fee included. Waits ${ONLINE_CHANGE_HOLD_HOURS} hours.`}
          />
        )}
        {paymentChoices.includes(CHANGE_PAYMENT_CHOICES.OUTSIDE_LATER) && (
          <Tile
            name="logistics-payment"
            checked={paymentChoice === CHANGE_PAYMENT_CHOICES.OUTSIDE_LATER}
            onChange={() => setPaymentChoice(CHANGE_PAYMENT_CHOICES.OUTSIDE_LATER)}
            icon={<Landmark size={16} aria-hidden="true" />}
            title="GCash or bank"
            hint={`Runner sends ${peso(quote.fee)}, no fee. Waits ${OUTSIDE_CHANGE_HOLD_DAYS} days.`}
          />
        )}
      </div>
      <FieldError id="logistics-payment-error" message={choiceError || undefined} />
    </fieldset>
  );
}
