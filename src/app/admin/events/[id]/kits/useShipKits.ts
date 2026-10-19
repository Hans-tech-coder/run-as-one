"use client";

/**
 * The state behind one receipt's *Ship kits* / *Back to pickup* panel
 * (`ShipKitsPanel.tsx`, LOGISTICS_CHANGE_PLAN.md Revision 1 R3–R5): the
 * address, the split, the zone when staff pick it, the live quote, the
 * payment choice, the reason, and the save.
 *
 * **One receipt, mounted fresh.** The panel is keyed on the order id, so this
 * hook starts over for every receipt: nothing typed for one can show on
 * another (the owner's report on the Session 2 modal, which kept one copy of
 * this state for the whole table).
 *
 * **The quote is the server's own arithmetic.** `quoteLogisticsChange` runs
 * here on what the page read, on every keystroke, and the store runs it again
 * under the event's locks; so do R4 (`waitingConflict`) and R5. Nothing posted
 * from here is trusted as a figure. A refusal from the route reloads the page's
 * data, since another receipt may have moved since the page was read.
 */

import { useMemo, useState } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import { LOGISTICS_CHANGE_STATUSES, LOGISTICS_DIRECTIONS, quoteLogisticsChange, type ExistingDelivery } from '@/lib/logistics-change';
import { waitingConflict, type WaitingSwitch } from '@/lib/logistics-change-parcels';
import { onlineChangeMethod, paymentMethodForChoice, type ChangePaymentChoice } from '@/lib/category-change-hold';
import { transactionFeeFor } from '@/lib/free-checkout';
import { formatPesos } from '@/lib/money';
import type { RunnerAddress } from '@/lib/runner-address';
import type { DeliveryZone } from '@/lib/registration-codes';
import type { Receipt, ReceiptEvent } from '@/lib/logistics-receipts';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import { composeDeliveryAddress, EMPTY_DELIVERY_ADDRESS } from '@/app/events/[slug]/register/delivery-address';
import { canShipSeparately } from '@/app/events/[slug]/register/delivery-split';
import { defaultDeliveryZone, deliveryProvinceOf, needsDeliveryZoneChoice } from '@/app/events/[slug]/register/delivery';

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

export function useShipKits({
  receipt,
  event,
  existing,
  waiting,
  refOf,
  onSaved,
  onStale,
}: {
  receipt: Receipt;
  event: ReceiptEvent;
  /** The event's PAID deliveries, the parcels a new one can ride on (L6). */
  existing: readonly ExistingDelivery[];
  /** The event's switches waiting for payment (R4). */
  waiting: readonly WaitingSwitch[];
  refOf: (registrationId: string) => string;
  onSaved: () => void;
  /** The page's data may be out of date: read it again. */
  onStale: () => void;
}) {
  const { alert, toast } = useAlert();
  const homes = receipt.runners.map(runner => runner.address);
  const toDelivery = receipt.canSwitch.allowed
    ? receipt.canSwitch.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY
    : !receipt.isDelivery;

  // Runner 1's home address, which every runner gave at sign-up
  // (RUNNER_ADDRESS_PLAN.md); staff edit it if the kit goes elsewhere.
  const [address, setAddress] = useState<RunnerAddress>(() => ({ ...homes[0] }));
  const [zip, setZip] = useState('');
  const [landmark, setLandmark] = useState('');
  const [split, setSplit] = useState(false);
  const [zone, setZone] = useState<DeliveryZone | null>(() => defaultDeliveryZone(event));
  const [reason, setReason] = useState('');
  const [pickedChoice, setPickedChoice] = useState<ChangePaymentChoice | null>(null);
  const [choiceError, setChoiceError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const canSplit = toDelivery && canShipSeparately(event, homes);
  const splitOn = canSplit && split;
  // Staff pick the zone only when the race's province is unknown and the two
  // tiers cost differently (L5); otherwise the address decides it.
  const zoneChoice = toDelivery && !deliveryProvinceOf(event) && needsDeliveryZoneChoice(event);
  const deliveryAddress = composeDeliveryAddress({
    ...EMPTY_DELIVERY_ADDRESS,
    street: address.addressStreet,
    barangay: address.addressBarangay,
    city: address.addressCity,
    province: address.addressProvince,
    zip,
    landmark,
  });

  const paymentChoices = receipt.paymentChoices;
  const paymentChoice = pickedChoice ?? (paymentChoices.length === 1 ? paymentChoices[0] : null);

  const quote = useMemo(
    () =>
      quoteLogisticsChange({
        event,
        direction: toDelivery ? LOGISTICS_DIRECTIONS.TO_DELIVERY : LOGISTICS_DIRECTIONS.TO_PICKUP,
        orders: [{ id: receipt.id, runners: homes }],
        target: { deliveryAddress, deliveryZone: zone, deliverySplit: splitOn },
        existing,
        paymentMethod: paymentChoice ? paymentMethodForChoice(paymentChoice) : null,
      }),
    // `homes` is rebuilt every render from the receipt it is read from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [receipt, event, existing, toDelivery, deliveryAddress, zone, splitOn, paymentChoice],
  );
  const needsPayment = quote.ok && quote.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT;
  const onlineMethod = onlineChangeMethod();
  const onlineFee = quote.ok && needsPayment ? transactionFeeFor(quote.fee, onlineMethod) : 0;
  // R4 and R5, said before the button rather than only by the route's refusal.
  const waitingOn = toDelivery && quote.ok ? waitingConflict(quote.parcels, waiting, receipt.id) : null;
  const ridersLeft = toDelivery ? [] : receipt.riderRefs;

  const save = async () => {
    if (!receipt.canSwitch.allowed || !quote.ok || waitingOn || ridersLeft.length > 0) return;
    if (needsPayment && !paymentChoice) {
      setChoiceError('Choose how the runner pays');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${receipt.id}/logistics-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryAddress: toDelivery && !splitOn ? deliveryAddress : null,
          deliveryZone: zone,
          deliverySplit: splitOn,
          reason,
          ...(needsPayment ? { paymentChoice } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      setIsSaving(false);
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
      toast(
        change.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT
          ? `Switch saved for ${receipt.orderRef}: ${peso(change.totalCharged)} awaiting payment. It stays on pickup until paid.`
          : change.direction === LOGISTICS_DIRECTIONS.TO_PICKUP
            ? `${receipt.orderRef} switched to pickup.`
            : `${receipt.orderRef} switched to delivery.`,
      );
      onSaved();
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
    refOf,
    isSaving,
    toDelivery,
    address,
    setAddress: (patch: Partial<RunnerAddress>) => setAddress(current => ({ ...current, ...patch })),
    zip,
    setZip,
    landmark,
    setLandmark,
    canSplit,
    split: splitOn,
    setSplit,
    zoneChoice,
    zone,
    setZone,
    quote,
    needsPayment,
    onlineMethod,
    onlineFee,
    paymentChoices,
    paymentChoice,
    setPaymentChoice: (choice: ChangePaymentChoice) => {
      setPickedChoice(choice);
      setChoiceError('');
    },
    choiceError,
    waitingOn,
    ridersLeft,
    reason,
    setReason,
    save,
  };
}

export type ShipKitsState = ReturnType<typeof useShipKits>;
