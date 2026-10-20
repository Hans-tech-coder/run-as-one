'use client';

/**
 * A waiting delivery switch's link, in two steps (LOGISTICS_CHANGE_PLAN.md
 * Revision 3 T2–T5):
 *
 * 1. **Confirm the delivery details**: the registration wizard's own delivery
 *    step (`DeliveryStep`, `useDeliveryPlan`), starting from the address on the
 *    switch, with Runner 1's home address one tap away, the ZIP, landmark and
 *    *Someone else will receive the kit*. The fee shown is the event's tier
 *    for the address, worked out here as the wizard does. *Confirm* posts to
 *    `api/logistics-change/details`, which re-quotes under the switch locks
 *    with what the page cannot see (another receipt already paid for this
 *    address, or waiting on it), and either saves the new figures or applies
 *    the switch when it now rides free.
 * 2. **Pay**: the details as saved with *Edit details*, the amount, then Pay
 *    now (online, `PayNowButton`) or the accounts and the proof upload
 *    (GCash or bank, `SwitchBankProof`). Staff's method only (T10).
 *
 * Once the GCash or bank proof is in, step 2 is all there is: the details are
 * read-only and the proof shows as submitted, with *Replace proof* (T7).
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, Pencil } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { formatPesos } from '@/lib/money';
import { transactionFeeFor } from '@/lib/free-checkout';
import type { BankAccountView } from '@/lib/bank-accounts';
import { DEFAULT_COUNTRY } from '@/lib/phone';
import DeliveryStep from '@/app/events/[slug]/register/DeliveryStep';
import { useDeliveryPlan } from '@/app/events/[slug]/register/useDeliveryPlan';
import {
  deliveryAddressDetails,
  EMPTY_DELIVERY_ADDRESS,
  missingAddressParts,
} from '@/app/events/[slug]/register/delivery-address';
import type { AddressedRunner } from '@/app/events/[slug]/register/RunnerAddressFields';
import PayNowButton from '../../[token]/PayNowButton';
import SwitchBankProof from './SwitchBankProof';
import '@/app/events/[slug]/register/RegistrationWizard.css';

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

export type SwitchConfirmProps = {
  token: string;
  /** Start on the payment step: back from PayMongo without paying, or proof already in. */
  startOnPay: boolean;
  event: {
    location: string;
    province: string | null;
    format: string | null;
    logisticsDeliveryFeeInside: number;
    logisticsDeliveryFeeOutside: number;
  };
  /** Runner 1, with the home address on file. */
  runner: AddressedRunner;
  deliveryAddress: string | null;
  deliveryZone: string | null;
  /** The PayMongo method an online switch is paid by; null for GCash or bank. */
  onlineMethod: string | null;
  outside: boolean;
  /** Centavos, as stored on the switch. */
  fee: number;
  totalCharged: number;
  bankAccounts: BankAccountView[];
  /** The reference of a proof already submitted, else null. */
  submittedReference: string | null;
};

export default function SwitchConfirm(props: SwitchConfirmProps) {
  const router = useRouter();
  const proofIn = props.submittedReference !== null;
  // Revision 3b T12: with no address yet, there is nothing to pay until step 1 is done.
  const hasAddress = props.deliveryAddress !== null;
  const [step, setStep] = useState<'details' | 'pay'>(hasAddress && (props.startOnPay || proofIn) ? 'pay' : 'details');
  const [saved, setSaved] = useState({ address: props.deliveryAddress, fee: props.fee, totalCharged: props.totalCharged });
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  const plan = useDeliveryPlan({
    event: props.event,
    runners: [props.runner],
    logisticsMethod: 'DELIVERY',
    restored: { deliveryAddress: props.deliveryAddress, deliveryZone: props.deliveryZone },
    // No home address on file: the fields start open, with nothing claimed from home.
    startTyped: missingAddressParts({ ...EMPTY_DELIVERY_ADDRESS, ...homeParts(props.runner) }).length > 0,
  });
  // The tier for the address as typed; the server's answer on Confirm is final.
  const previewTotal = plan.fee + (props.onlineMethod ? transactionFeeFor(plan.fee, props.onlineMethod) : 0);

  const confirm = async () => {
    const problem = plan.problem();
    if (problem) {
      setShowErrors(true);
      setError(problem.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/logistics-change/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: props.token, deliveryAddress: plan.address, deliveryZone: plan.zone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Your delivery details could not be saved. Try again.');
        return;
      }
      if (data.outcome === 'applied') {
        // Rides free on a parcel already paid for: the page now says switched.
        router.refresh();
        return;
      }
      setSaved({ address: plan.address, fee: data.fee, totalCharged: data.totalCharged });
      setStep('pay');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'details') {
    return (
      <div className="flex flex-col gap-6 text-left">
        <StepLabel n={1} title="Confirm your delivery details" />
        <DeliveryStep
          plan={plan}
          event={props.event}
          runners={[props.runner]}
          showErrors={showErrors}
          defaultCountry={DEFAULT_COUNTRY}
        />
        <div className="flex items-baseline justify-between gap-4 rounded-[16px] border border-white/[0.08] px-4 py-3">
          <span className="text-sm text-secondary">
            {props.onlineMethod && plan.fee > 0 ? 'Delivery and transaction fee' : 'Delivery fee'}
          </span>
          {plan.fee > 0 ? (
            <span className="text-lg font-black tabular-nums text-white">{peso(previewTotal)}</span>
          ) : (
            <span className="text-sm text-secondary">Fill in the address to see it</span>
          )}
        </div>
        {error && (
          <p role="alert" className="m-0 text-center text-sm font-medium text-red-400">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="btn-gradient justify-center rounded-[16px] px-8 py-4 text-base shadow-xl shadow-accent-orange/20 disabled:opacity-60"
        >
          {busy ? <BusyLabel>Saving</BusyLabel> : 'Confirm Details'}
        </button>
      </div>
    );
  }

  const details = deliveryAddressDetails(saved.address);
  const amount = peso(saved.totalCharged);

  return (
    <div className="flex flex-col gap-6 text-left">
      <StepLabel n={2} title={proofIn ? 'Payment proof submitted' : 'Pay for the delivery'} />

      <dl className="m-0 grid grid-cols-1 overflow-hidden rounded-[16px] border border-white/[0.08]">
        <Row label="Ships to" value={details.place || 'The address on your order'} />
        {details.landmark && <Row label="Landmark" value={details.landmark} />}
        <Row
          label="Receiver"
          value={details.receiver ? `${details.receiver.name} · ${details.receiver.phone}` : `${props.runner.firstName} ${props.runner.lastName}`.trim()}
        />
        {!proofIn && (
          <div className="px-4 py-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep('details');
              }}
              className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-accent-orange transition-colors hover:text-white"
            >
              <Pencil size={14} aria-hidden="true" /> Edit details
            </button>
          </div>
        )}
      </dl>

      <dl className="m-0 grid grid-cols-1 overflow-hidden rounded-[16px] border border-white/[0.08]">
        <Row label="Delivery fee" value={peso(saved.fee)} />
        {saved.totalCharged > saved.fee && <Row label="Transaction fee" value={peso(saved.totalCharged - saved.fee)} />}
        <div className="flex items-baseline justify-between gap-4 bg-white/[0.03] px-4 py-4">
          <dt className="text-sm font-bold uppercase tracking-wide text-secondary">Amount due</dt>
          <dd className="m-0 text-xl font-black tabular-nums text-white">{amount}</dd>
        </div>
      </dl>

      {!props.outside ? (
        props.onlineMethod ? (
          <div className="flex flex-col items-stretch gap-3">
            <PayNowButton token={props.token} amount={amount} kind="switch" />
            <p className="m-0 text-center text-xs leading-relaxed text-secondary">
              You will be taken to PayMongo to pay. Any payment page opened for this switch before stops working once you
              press Pay now.
            </p>
          </div>
        ) : (
          <p role="alert" className="m-0 text-center text-sm font-medium text-red-400">
            Online payment is not available right now. Reply to the email we sent and we will help you pay.
          </p>
        )
      ) : proofIn && !replacing ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-[16px] border border-emerald-400/20 bg-emerald-400/5 p-4">
            <CircleCheck size={20} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
            <p className="m-0 text-sm leading-relaxed text-secondary">
              We received your proof, reference <strong className="text-white">{props.submittedReference}</strong>. We
              check it against our account, then switch your kits to delivery and email you.
            </p>
          </div>
          <button type="button" onClick={() => setReplacing(true)} className="btn-secondary justify-center">
            Replace proof
          </button>
        </div>
      ) : (
        <SwitchBankProof
          token={props.token}
          amount={amount}
          bankAccounts={props.bankAccounts}
          replacing={proofIn}
          onCancel={proofIn ? () => setReplacing(false) : undefined}
        />
      )}

      {!proofIn && (
        <p className="m-0 text-center text-xs leading-relaxed text-secondary">
          Changed your mind? Do nothing, or reply to our email. Your kits stay for pickup until this is paid.
        </p>
      )}
    </div>
  );
}

/** Runner 1's home address as the address parts. */
function homeParts(runner: AddressedRunner) {
  return {
    street: runner.addressStreet,
    barangay: runner.addressBarangay,
    city: runner.addressCity,
    province: runner.addressProvince,
  };
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm font-bold text-white">
        {n}
      </span>
      <h2 className="m-0 text-lg font-bold text-white">{title}</h2>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] px-4 py-3 last:border-b-0">
      <dt className="shrink-0 text-sm text-secondary">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-right text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}
