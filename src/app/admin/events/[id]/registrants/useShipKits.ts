"use client";

/**
 * The state behind one receipt's *Ship kits* / *Back to pickup* panel
 * (`ShipKitsPanel.tsx`, LOGISTICS_CHANGE_PLAN.md Revision 1 R3): the
 * address (one parcel for the whole receipt), the zone when staff pick it, the live quote, the
 * payment choice, the reason, and the save.
 *
 * **Confirm and send** (Revision 3b T12, the owner after trying RM-1D5EEF1B):
 * staff do not type an address. With Runner 1's home address on file the
 * switch is quoted from it; with none, or
 * when the race's area must be picked (L5), it is sent with no address
 * (`askRunner`) and the runner gives it on the link, where the fee follows.
 * Only *Already paid* (T13), which switches at once, opens the address below.
 *
 * **The address works like the registration wizard's Logistics step**
 * (`useDeliveryPlan.ts`): it is Runner 1's home address, shown as a card,
 * until staff press Change, which copies it into the editable fields. ZIP,
 * landmark and another receiver are added either way, and the whole is joined
 * by `composeDeliveryAddress`, the checkout's own join, so a switched order
 * reads like one that chose delivery at checkout. A runner who registered
 * before home addresses were asked has none on file: then the panel starts on
 * the editable fields, holding whatever parts there are, and claims nothing.
 *
 * **One receipt, mounted fresh.** The panel is keyed on the order id, so this
 * hook starts over for every receipt: nothing typed for one can show on
 * another (the owner's report on the Session 2 modal, which kept one copy of
 * this state for the whole table).
 *
 * **The quote is the server's own arithmetic.** `quoteLogisticsChange` runs
 * here on what the page read, on every keystroke, and the store runs it again
 * under the event's locks. It is quoted from this receipt alone: a delivery
 * fee is charged per order, never waived for another order's parcel (the
 * owner, 2026-10-21). Nothing posted from here is trusted as a figure. A
 * refusal from the route reloads the page's data, since the receipt may have
 * moved since the page was read.
 */

import { useMemo, useState } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import {
  LOGISTICS_CHANGE_STATUSES,
  LOGISTICS_DIRECTIONS,
  quoteLogisticsChange,
  type LogisticsQuote,
} from '@/lib/logistics-change';
import {
  CHANGE_PAYMENT_CHOICES,
  onlineChangeMethod,
  paymentMethodForChoice,
  readTransactionNumber,
  type ChangePaymentChoice,
} from '@/lib/category-change-hold';
import { compressImage } from '@/lib/image-compress';
import { transactionFeeFor } from '@/lib/free-checkout';
import { formatPesos } from '@/lib/money';
import { formatRunnerAddress, type RunnerAddress } from '@/lib/runner-address';
import type { DeliveryZone } from '@/lib/registration-codes';
import type { Receipt, ReceiptEvent } from '@/lib/logistics-receipts';
import type { SwitchEmailAnswer } from './WaitingSwitchActions';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import {
  ADDRESS_PART_LABELS,
  addressProblems,
  composeDeliveryAddress,
  EMPTY_DELIVERY_ADDRESS,
  missingAddressParts,
  type DeliveryAddressParts,
} from '@/app/events/[slug]/register/delivery-address';
import {
  defaultDeliveryZone,
  deliveryProvinceOf,
  needsDeliveryZoneChoice,
  zoneForProvince,
  zoneNoteFor,
} from '@/app/events/[slug]/register/delivery';

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

type Place = Pick<DeliveryAddressParts, 'street' | 'barangay' | 'city' | 'province'>;

function placeOf(address: RunnerAddress | undefined): Place {
  return {
    street: address?.addressStreet ?? '',
    barangay: address?.addressBarangay ?? '',
    city: address?.addressCity ?? '',
    province: address?.addressProvince ?? '',
  };
}

export function useShipKits({
  receipt,
  event,
  onSaved,
  onStale,
}: {
  receipt: Receipt;
  event: ReceiptEvent;
  /** Saved; `email` is how the switch's email went (refused: send it by hand). */
  onSaved: (result: { change: LogisticsChangeView; email?: SwitchEmailAnswer | null }) => void;
  /** The page's data may be out of date: read it again. */
  onStale: () => void;
}) {
  const { alert, toast } = useAlert();
  const homes = receipt.runners.map(runner => runner.address);
  const toDelivery = receipt.canSwitch.allowed
    ? receipt.canSwitch.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY
    : !receipt.isDelivery;

  // Runner 1's home address (RUNNER_ADDRESS_PLAN.md), when it is whole: a
  // runner from before the plan has none, or only some of it.
  const home = placeOf(homes[0]);
  const hasHome = missingAddressParts({ ...EMPTY_DELIVERY_ADDRESS, ...home }).length === 0;
  const [parts, setParts] = useState<DeliveryAddressParts>(() =>
    hasHome ? EMPTY_DELIVERY_ADDRESS : { ...EMPTY_DELIVERY_ADDRESS, ...home },
  );
  // Whether the place is typed here rather than Runner 1's home.
  const [ownAddress, setOwnAddress] = useState(!hasHome);
  const [zone, setZone] = useState<DeliveryZone | null>(() => defaultDeliveryZone(event));
  const [reason, setReason] = useState('');
  const [pickedChoice, setPickedChoice] = useState<ChangePaymentChoice | null>(null);
  const [choiceError, setChoiceError] = useState('');
  // Already paid: what *Record payment* asks for, asked up front.
  const [transactionNumber, setTransactionNumber] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [paidErrors, setPaidErrors] = useState<{ transactionNumber?: string; proofFile?: string }>({});
  const [isSaving, setIsSaving] = useState(false);

  // Staff pick the zone only when the race's province is unknown and the two
  // tiers cost differently (L5); otherwise the address decides it.
  const zoneChoice = toDelivery && !deliveryProvinceOf(event) && needsDeliveryZoneChoice(event);
  const address: DeliveryAddressParts = ownAddress ? parts : { ...parts, ...home };
  const deliveryAddress = composeDeliveryAddress(address);
  // The wizard's line under the address: which tier applies, and its fee.
  const zoneNote = toDelivery
    ? zoneNoteFor(event, deliveryProvinceOf(event) ? zoneForProvince(event, address.province) : zone)
    : undefined;

  const paymentChoices = receipt.paymentChoices;
  const paymentChoice = pickedChoice ?? (paymentChoices.length === 1 ? paymentChoices[0] : null);

  const quoted = useMemo(
    () =>
      quoteLogisticsChange({
        event,
        direction: toDelivery ? LOGISTICS_DIRECTIONS.TO_DELIVERY : LOGISTICS_DIRECTIONS.TO_PICKUP,
        orders: [{ id: receipt.id, runners: homes }],
        target: { deliveryAddress, deliveryZone: zone },
        paymentMethod: paymentChoice ? paymentMethodForChoice(paymentChoice) : null,
      }),
    // `homes` is rebuilt every render from the receipt it is read from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [receipt, event, toDelivery, deliveryAddress, zone, paymentChoice],
  );
  // A receiver ticked but left blank composes to no receiver at all, so the
  // quote cannot see it: held here, as the wizard holds it on the parts.
  const receiverProblems = toDelivery && address.otherReceiver ? addressProblems(address) : {};
  const receiverPart = (['receiverName', 'receiverPhone'] as const).find(part => receiverProblems[part]);
  const quote: LogisticsQuote = receiverPart
    ? {
        ok: false,
        reason: 'ADDRESS_INCOMPLETE',
        message: `Delivery address — ${ADDRESS_PART_LABELS[receiverPart]}: ${receiverProblems[receiverPart]!.toLowerCase()}`,
      }
    : quoted;
  const pickedPaid = toDelivery && paymentChoice === CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID;
  // T12: no address to quote from, so the runner gives it on the link.
  const askRunner = toDelivery && !pickedPaid && (!hasHome || zoneChoice);
  const quotedFee = quote.ok && quote.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT;
  const needsPayment = askRunner || quotedFee || pickedPaid;
  const alreadyPaid = pickedPaid && quotedFee;
  const onlineMethod = onlineChangeMethod();
  const onlineFee = quote.ok && quotedFee ? transactionFeeFor(quote.fee, onlineMethod) : 0;

  const save = async () => {
    if (!receipt.canSwitch.allowed || (!askRunner && !quote.ok)) return;
    if (needsPayment && !paymentChoice) {
      setChoiceError('Choose how the runner pays');
      return;
    }
    if (alreadyPaid) {
      const reference = readTransactionNumber(transactionNumber);
      setPaidErrors(reference.error ? { transactionNumber: reference.error } : {});
      if (reference.error) return;
    }
    setIsSaving(true);
    try {
      const fields = {
        // Sent with none when the runner gives it on the link (T12).
        deliveryAddress: toDelivery && !askRunner ? deliveryAddress : null,
        deliveryZone: askRunner ? null : zone,
        reason,
        ...(needsPayment ? { paymentChoice } : {}),
      };
      const res = await fetch(`/api/admin/registrations/${receipt.id}/logistics-change`, {
        method: 'POST',
        // Already paid sends its proof, shrunk here as *Record payment* does,
        // so it goes as a form; everything else is JSON.
        ...(alreadyPaid
          ? { body: await paidForm(fields, transactionNumber, proofFile) }
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) }),
      });
      const data = await res.json().catch(() => ({}));
      setIsSaving(false);
      if (!res.ok && (data?.field === 'transactionNumber' || data?.field === 'proofFile')) {
        setPaidErrors({ [data.field]: data.error });
        return;
      }
      if (!res.ok) {
        await alert({
          variant: 'error',
          title: 'Receipt Not Switched',
          message: data?.error || 'The receipt could not be switched. Try again.',
        });
        onStale();
        return;
      }
      const change = (data as { change: LogisticsChangeView }).change;
      const emailed = data?.email?.sent ? ` Emailed ${data.email.to}.` : '';
      const saved =
        change.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT
          ? change.awaitsAddress
            ? `Sent to the runner: ${receipt.orderRef} waits for them to give the address and pay. It stays on pickup until paid.`
            : `Switch saved for ${receipt.orderRef}: ${peso(change.totalCharged)} awaiting payment. It stays on pickup until paid.`
          : change.direction === LOGISTICS_DIRECTIONS.TO_PICKUP
            ? `${receipt.orderRef} switched to pickup.`
            : change.transactionNumber
              ? `${receipt.orderRef} switched to delivery: ${peso(change.totalCharged)} recorded as paid.`
              : `${receipt.orderRef} switched to delivery.`;
      toast(saved + emailed);
      onSaved(data);
    } catch {
      setIsSaving(false);
      await alert({
        variant: 'error',
        title: 'Receipt Not Switched',
        message: 'Could not reach the server. Check your connection and try again.',
      });
    }
  };

  return {
    receipt,
    event,
    isSaving,
    toDelivery,
    address,
    setAddress: (patch: Partial<DeliveryAddressParts>) => setParts({ ...address, ...patch }),
    ownAddress,
    hasHome,
    homeText: hasHome ? formatRunnerAddress(homes[0]) : '',
    typeOwnAddress: () => {
      setParts(address);
      setOwnAddress(true);
    },
    useHomeAddress: () => setOwnAddress(false),
    zoneNote,
    zoneChoice,
    zone,
    setZone,
    quote,
    needsPayment,
    askRunner,
    pickedPaid,
    onlineMethod,
    onlineFee,
    paymentChoices,
    paymentChoice,
    setPaymentChoice: (choice: ChangePaymentChoice) => {
      setPickedChoice(choice);
      setChoiceError('');
    },
    choiceError,
    alreadyPaid,
    transactionNumber,
    // A field's error goes once staff change that field.
    setTransactionNumber: (value: string) => {
      setTransactionNumber(value);
      setPaidErrors(current => ({ ...current, transactionNumber: undefined }));
    },
    proofFile,
    setProofFile: (file: File | null) => {
      setProofFile(file);
      setPaidErrors(current => ({ ...current, proofFile: undefined }));
    },
    paidErrors,
    reason,
    setReason,
    save,
  };
}

/** The already-paid switch as a form: the panel's fields, the reference, and the shrunk proof. */
async function paidForm(
  fields: Record<string, string | boolean | null | undefined>,
  transactionNumber: string,
  proof: File | null,
): Promise<FormData> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined) form.set(name, String(value));
  }
  form.set('transactionNumber', transactionNumber);
  if (proof) form.set('proofFile', await compressImage(proof, 'proof'));
  return form;
}

export type ShipKitsState = ReturnType<typeof useShipKits>;
