"use client";

/**
 * The state behind Switch to delivery / Switch to pickup
 * (`LogisticsChangeModal.tsx`) and its history (`LogisticsChangeHistory.tsx`),
 * and the registrants table's side of every switch (LOGISTICS_CHANGE_PLAN.md
 * Session 2): the preview fetch, the address, the split, the orders ticked in,
 * the live quote, the save, and the cancel of a switch still waiting for its
 * fee.
 *
 * **The quote is the server's own arithmetic.** `quoteLogisticsChange` runs
 * here on what the preview read, on every keystroke, and again in the store
 * under the event's locks; nothing posted from here is trusted as a figure.
 *
 * Every write answers with each touched row's Logistics fields, keyed by
 * runner id (`readOrderLogistics`), which replace the table's copies — the
 * same fields the page builds its rows with, so a switch reads on screen
 * exactly as it will after a reload.
 */

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import {
  LOGISTICS_CHANGE_STATUSES,
  LOGISTICS_DIRECTIONS,
  quoteLogisticsChange,
} from '@/lib/logistics-change';
import {
  onlineChangeMethod,
  paymentMethodForChoice,
  type ChangePaymentChoice,
} from '@/lib/category-change-hold';
import { transactionFeeFor } from '@/lib/free-checkout';
import { formatPesos } from '@/lib/money';
import { EMPTY_RUNNER_ADDRESS, type RunnerAddress } from '@/lib/runner-address';
import type { DeliveryZone } from '@/lib/registration-codes';
import type { LogisticsChangePreview } from '@/lib/logistics-change-context';
import type { LogisticsChangeView, OrderLogisticsFields } from '@/lib/logistics-change-view';
import { composeDeliveryAddress, EMPTY_DELIVERY_ADDRESS } from '@/app/events/[slug]/register/delivery-address';
import { canShipSeparately } from '@/app/events/[slug]/register/delivery-split';
import {
  defaultDeliveryZone,
  deliveryProvinceOf,
  needsDeliveryZoneChoice,
} from '@/app/events/[slug]/register/delivery';
import type { RegistrantRow } from './RegistrantsTable';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

/** What a switch route answers. */
type SwitchResult = { change: LogisticsChangeView; rows: Record<string, OrderLogisticsFields> };

export function useLogisticsChangeModal({
  runners,
  setRunners,
  setViewingRunner,
}: {
  runners: RegistrantRow[];
  setRunners: Dispatch<SetStateAction<RegistrantRow[]>>;
  setViewingRunner: Dispatch<SetStateAction<RegistrantRow | null>>;
}) {
  const { alert, toast } = useAlert();

  /** Every row the switch touched takes its fields from the route's answer. */
  const applyRows = (rows: Record<string, OrderLogisticsFields>) => {
    const apply = (row: RegistrantRow | null) => (row && rows[row.id] ? { ...row, ...rows[row.id] } : row);
    setRunners(current => current.map(apply));
    setViewingRunner(apply);
  };

  const [runner, setRunner] = useState<RegistrantRow | null>(null);
  const [preview, setPreview] = useState<LogisticsChangePreview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [address, setAddress] = useState<RunnerAddress>(EMPTY_RUNNER_ADDRESS);
  const [zip, setZip] = useState('');
  const [landmark, setLandmark] = useState('');
  const [split, setSplit] = useState(false);
  const [zone, setZone] = useState<DeliveryZone | null>(null);
  const [included, setIncluded] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [pickedChoice, setPickedChoice] = useState<ChangePaymentChoice | null>(null);
  const [choiceError, setChoiceError] = useState('');

  const load = async (registrationId: string) => {
    setLoadError('');
    setPreview(null);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/logistics-change?preview=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data?.error || 'This order could not be loaded. Close and try again.');
        return;
      }
      const loaded = data as LogisticsChangePreview;
      setPreview(loaded);
      // Runner 1's home address, which every runner gave at sign-up
      // (RUNNER_ADDRESS_PLAN.md); staff edit it if the kit goes elsewhere.
      const first = loaded.order.runners[0];
      if (first) {
        setAddress({
          addressStreet: first.addressStreet,
          addressBarangay: first.addressBarangay,
          addressCity: first.addressCity,
          addressProvince: first.addressProvince,
        });
      }
      setZone(defaultDeliveryZone(loaded.event));
      // L10: the riders go back with the parcel, ticked for staff.
      setIncluded(loaded.riders.map(order => order.id));
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    }
  };

  const open = (runnerId: string) => {
    const row = runners.find(r => r.id === runnerId);
    if (!row) return;
    setRunner(row);
    setAddress(EMPTY_RUNNER_ADDRESS);
    setZip('');
    setLandmark('');
    setSplit(false);
    setZone(null);
    setIncluded([]);
    setReason('');
    setPickedChoice(null);
    setChoiceError('');
    setIsOpen(true);
    void load(row.registrationId);
  };

  const finish = () => {
    setIsSaving(false);
    setIsOpen(false);
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setRunner(null);
      setPreview(null);
    }, CLOSE_MS);
  };

  const close = () => {
    if (!isSaving) finish();
  };

  const toDelivery = preview?.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY;
  const offered = preview ? (toDelivery ? preview.candidates : preview.riders) : [];
  const ticked = offered.filter(order => included.includes(order.id));
  const orders = preview ? [preview.order, ...ticked] : [];
  const allRunners = orders.flatMap(order => order.runners);
  const canSplit = !!preview && toDelivery && canShipSeparately(preview.event, allRunners);
  const splitOn = canSplit && split;
  // Staff pick the zone only when the race's province is unknown and the two
  // tiers cost differently (L5); otherwise the address decides it.
  const zoneChoice = !!preview && toDelivery && !deliveryProvinceOf(preview.event) && needsDeliveryZoneChoice(preview.event);
  const deliveryAddress = composeDeliveryAddress({
    ...EMPTY_DELIVERY_ADDRESS,
    street: address.addressStreet,
    barangay: address.addressBarangay,
    city: address.addressCity,
    province: address.addressProvince,
    zip,
    landmark,
  });

  const paymentChoices = preview?.paymentChoices ?? [];
  const paymentChoice = pickedChoice ?? (paymentChoices.length === 1 ? paymentChoices[0] : null);

  const quote = useMemo(
    () =>
      preview
        ? quoteLogisticsChange({
            event: preview.event,
            direction: preview.direction,
            orders: orders.map(order => ({ id: order.id, runners: order.runners })),
            target: { deliveryAddress, deliveryZone: zone, deliverySplit: splitOn },
            existing: preview.existing,
            paymentMethod: paymentChoice ? paymentMethodForChoice(paymentChoice) : null,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview, included, deliveryAddress, zone, splitOn, paymentChoice],
  );
  const needsPayment = !!quote?.ok && quote.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT;
  const onlineMethod = onlineChangeMethod();
  const onlineFee = quote?.ok && needsPayment ? transactionFeeFor(quote.fee, onlineMethod) : 0;
  // L10, said before the button rather than only by the route's refusal.
  const ridersLeft = preview && !toDelivery ? preview.riders.filter(order => !included.includes(order.id)) : [];

  const save = async () => {
    if (!runner || !preview || !quote?.ok || ridersLeft.length > 0) return;
    if (needsPayment && !paymentChoice) {
      setChoiceError('Choose how the runner pays');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${runner.registrationId}/logistics-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          includeOrderIds: ticked.map(order => order.id),
          deliveryAddress: toDelivery && !splitOn ? deliveryAddress : null,
          deliveryZone: zone,
          deliverySplit: splitOn,
          reason,
          ...(needsPayment ? { paymentChoice } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsSaving(false);
        await alert({
          variant: 'error',
          title: 'Order Not Switched',
          message: data?.error || 'The order could not be switched. Try again.',
        });
        // The event's parcels or the order may have moved since it opened.
        void load(runner.registrationId);
        return;
      }
      const result = data as SwitchResult;
      applyRows(result.rows);
      const refs = result.change.orders.map(order => order.orderRef).join(', ');
      toast(
        result.change.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT
          ? `Switch saved for ${refs}: ${peso(result.change.totalCharged)} awaiting payment. It stays on pickup until paid.`
          : result.change.direction === LOGISTICS_DIRECTIONS.TO_PICKUP
            ? `${refs} switched to pickup.`
            : `${refs} switched to delivery.`,
      );
      finish();
    } catch {
      setIsSaving(false);
      await alert({
        variant: 'error',
        title: 'Order Not Switched',
        message: 'Could not reach the server. Check your connection and try again.',
      });
    }
  };

  // ── The history, opened from the Logistics cell ──────────────────────────
  const [historyRunnerId, setHistoryRunnerId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const historyRunner = historyRunnerId ? runners.find(r => r.id === historyRunnerId) ?? null : null;

  const cancelSwitch = async (change: LogisticsChangeView) => {
    setCancellingId(change.id);
    try {
      const res = await fetch(`/api/admin/logistics-changes/${change.id}/cancel`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({ variant: 'error', title: 'Switch Not Cancelled', message: data?.error || 'Try again.' });
        return;
      }
      applyRows((data as SwitchResult).rows);
      toast(`Cancelled the switch ${change.changeRef}. The order stays on pickup.`);
    } catch {
      await alert({ variant: 'error', title: 'Switch Not Cancelled', message: 'Could not reach the server. Try again.' });
    } finally {
      setCancellingId(null);
    }
  };

  return {
    open,
    openHistory: (runnerId: string) => setHistoryRunnerId(runnerId),
    historyProps: {
      runner: historyRunner,
      cancellingId,
      onCancel: cancelSwitch,
      onClose: () => setHistoryRunnerId(null),
    },
    modalProps: {
      runner,
      preview,
      loadError,
      isOpen,
      isClosing,
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
      offered,
      included,
      toggleIncluded: (id: string) =>
        setIncluded(current => (current.includes(id) ? current.filter(x => x !== id) : [...current, id])),
      ridersLeft,
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
      reason,
      setReason,
      onClose: close,
      onSave: save,
    },
  };
}
