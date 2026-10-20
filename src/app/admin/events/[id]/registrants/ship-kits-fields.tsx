"use client";

/**
 * The sections of one receipt's *Ship kits* / *Back to pickup* panel
 * (`ShipKitsPanel.tsx`, LOGISTICS_CHANGE_PLAN.md L2, L5, L6, Revision 1
 * R3–R5): where the kits go, the live quote's parcels, how a fee is paid, and
 * why a reverse must wait for its riders. Kept apart from the panel's frame
 * to hold each file under the size the repository splits files at; every
 * section reads the state `useShipKits` hands the panel. There are no
 * checkboxes for other receipts: one receipt per switch (R3).
 */

import React from 'react';
import { TriangleAlert, Link2, Landmark, CircleCheck, Home } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';
import { formatPesos } from '@/lib/money';
import { formatRunnerAddress } from '@/lib/runner-address';
import { ridersRefusal, waitingRefusal } from '@/lib/logistics-change-parcels';
import {
  CHANGE_PAYMENT_CHOICES,
  MAX_TRANSACTION_NUMBER,
  ONLINE_CHANGE_HOLD_HOURS,
  OUTSIDE_CHANGE_HOLD_DAYS,
} from '@/lib/category-change-hold';
import { deliveryZoneLabelFor, paymentMethodLabel } from '@/lib/registration-codes';
import { deliveryTiers } from '@/app/events/[slug]/register/delivery';
import ShipKitsAddress from './ship-kits-address';
import { ProofPicker } from './CategoryChangePaymentChoice';
import type { ShipKitsState } from './useShipKits';

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

type Props = ShipKitsState;

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
  quote: Extract<Props['quote'], { ok: true }>;
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
          ? 'The kits stay on pickup until the fee is paid. The receipt is not changed.'
          : 'Switches at once. The receipt is not changed.'}
      </p>
    </div>
  );
}

/**
 * Ship kits without an address to type (Revision 3b T12): where the switch
 * starts from, and that the runner confirms it on the link. With no home
 * address on file (or the area to pick, L5) the runner gives it there and the
 * fee follows, so the tiers are listed.
 */
export function SendSummary({ receipt, event, hasHome, homeText, askRunner }: Props) {
  const runner1 = receipt.runners.length === 1 ? 'The runner' : 'Runner 1';
  const tiers = deliveryTiers(event)
    .map(tier => `${peso(tier.fee)} ${deliveryZoneLabelFor(event, tier.zone).toLowerCase() || tier.label.toLowerCase()}`)
    .join(' · ');
  return (
    <div className="flex gap-3 rounded-lg border border-[var(--dash-border)] bg-[var(--ink-02)] p-3">
      <Home size={16} className="mt-0.5 shrink-0 text-[var(--accent-blue-text)]" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        {askRunner ? (
          <>
            <p className="m-0 text-primary">
              {hasHome
                ? 'The runner picks the delivery area and the address on the link.'
                : `${runner1} has no home address on file. The runner types where to ship on the link.`}
            </p>
            {tiers && <p className="m-0 text-xs text-[var(--text-muted)]">The fee follows the address: {tiers}.</p>}
          </>
        ) : (
          <>
            <p className="m-0 text-xs text-secondary">Starts from {runner1 === 'The runner' ? "the runner's" : "Runner 1's"} home address</p>
            <p className="m-0 text-primary [overflow-wrap:anywhere]">{homeText}</p>
            <p className="m-0 text-xs text-[var(--text-muted)]">The runner may change it on the link; the fee follows.</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Where the kits go (`ship-kits-address.tsx`), and the zone when staff must pick it (L5). */
export function DeliveryFields(props: Props) {
  return (
    <>
      <ShipKitsAddress {...props} />

      {props.zoneChoice && (
        <fieldset className="p-0 border-none mx-0">
          <legend className="block text-secondary mb-2 p-0">Delivery area</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {deliveryTiers(props.event).map(tier => (
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

/** Back to pickup: free, nothing refunded (L9); riders go back first (R5). */
export function PickupFields({ receipt, ridersLeft }: Props) {
  return (
    <div className="space-y-4">
      <p className="m-0 text-secondary">
        The {receipt.runners.length === 1 ? 'kit is' : 'kits are'} claimed at pickup instead. Nothing is refunded:
        the delivery fee on the receipt stays as paid.
      </p>
      {ridersLeft.length > 0 && <Warning>{ridersRefusal(ridersLeft)}</Warning>}
    </div>
  );
}

/** R4: an address already waiting for another receipt's fee. */
export function WaitingWarning({ waitingOn }: Pick<Props, 'waitingOn'>) {
  return waitingOn ? <Warning>{waitingRefusal(waitingOn)}</Warning> : null;
}

/**
 * How the fee is paid: a link or GCash or bank to come, the way the entry was
 * paid (category-change-hold.ts), or *Already paid* for staff who may record a
 * payment (`logistics-receipts.ts`).
 */
export function PaymentChoice(props: Props) {
  const { quote, paymentChoices, paymentChoice, setPaymentChoice, onlineFee, onlineMethod, choiceError } = props;
  // With no address yet (T12) the fee is not known: the hints say so.
  const known = quote?.ok && !props.askRunner ? quote : null;
  if (!known && !props.askRunner && !props.pickedPaid) return null;
  const fee = known ? peso(known.fee) : 'the fee';
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
            hint={
              known
                ? `Runner pays ${peso(known.fee + onlineFee)} by ${paymentMethodLabel(onlineMethod)}, ${peso(onlineFee)} transaction fee included. Waits ${ONLINE_CHANGE_HOLD_HOURS} hours.`
                : `Runner pays the fee by ${paymentMethodLabel(onlineMethod)}, the transaction fee on top. Waits ${ONLINE_CHANGE_HOLD_HOURS} hours.`
            }
          />
        )}
        {paymentChoices.includes(CHANGE_PAYMENT_CHOICES.OUTSIDE_LATER) && (
          <Tile
            name="logistics-payment"
            checked={paymentChoice === CHANGE_PAYMENT_CHOICES.OUTSIDE_LATER}
            onChange={() => setPaymentChoice(CHANGE_PAYMENT_CHOICES.OUTSIDE_LATER)}
            icon={<Landmark size={16} aria-hidden="true" />}
            title="GCash or bank"
            hint={`Runner sends ${fee}, no transaction fee. Waits ${OUTSIDE_CHANGE_HOLD_DAYS} days.`}
          />
        )}
        {paymentChoices.includes(CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID) && (
          <Tile
            name="logistics-payment"
            checked={paymentChoice === CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID}
            onChange={() => setPaymentChoice(CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID)}
            icon={<CircleCheck size={16} aria-hidden="true" />}
            title="Already paid, record it now"
            hint={`Runner already sent ${fee} by GCash or bank. Type the address; switches at once, no payment request is emailed.`}
          />
        )}
      </div>
      <FieldError id="logistics-payment-error" message={choiceError || undefined} />
      {props.pickedPaid && <AlreadyPaidFields {...props} />}
    </fieldset>
  );
}

/** Already paid: the reference and the proof *Record payment* asks for, asked up front. */
function AlreadyPaidFields({ transactionNumber, setTransactionNumber, proofFile, setProofFile, paidErrors }: Props) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-[var(--dash-border)] p-3">
      <div className="space-y-1.5">
        <label htmlFor="ship-kits-transaction" className="block text-secondary">
          GCash or bank reference number
        </label>
        <input
          id="ship-kits-transaction"
          autoComplete="off"
          value={transactionNumber}
          onChange={e => setTransactionNumber(e.target.value)}
          maxLength={MAX_TRANSACTION_NUMBER}
          placeholder="e.g. 7012 345 678901"
          aria-invalid={!!paidErrors.transactionNumber}
          aria-describedby="ship-kits-transaction-error"
          className="form-input w-full text-base"
        />
        <FieldError id="ship-kits-transaction-error" message={paidErrors.transactionNumber} />
      </div>
      <ProofPicker id="ship-kits-proof" file={proofFile} onChange={setProofFile} error={paidErrors.proofFile} />
    </div>
  );
}
