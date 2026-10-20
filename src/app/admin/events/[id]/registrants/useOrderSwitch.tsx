"use client";

/**
 * Switching a receipt between kit pickup and delivery from the registrants
 * table (LOGISTICS_CHANGE_PLAN.md Revision 2, the owner on 2026-10-19: per
 * transaction, from the registrants, and a group registration moves as one).
 *
 * A registrant's row offers the switch, but **the switch is the receipt's**:
 * every row of a group registration opens the same order, and saving moves
 * every runner on it (L2). What the row may offer, and everything the panels
 * quote from, comes from one server read of the event's receipts
 * (`readEventReceipts`), passed in as `switching`.
 *
 * It holds the three things a switch can open — *Ship kits* / *Back to
 * pickup* (`ShipKitsPanel`, mounted fresh for each receipt), the receipt's
 * payment and history (`OrderSwitchModal`), and an email to send by hand
 * (`SwitchEmailModal`) — and renders them through `element`. After anything
 * moves, the page's server read runs again (`router.refresh()`): one switch
 * changes other receipts too (who rides on whom), and that read is the one
 * place all of it is decided.
 */

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LOGISTICS_CHANGE_STATUSES, type ExistingDelivery, type LogisticsDirection } from '@/lib/logistics-change';
import type { EventReceipts } from '@/lib/logistics-receipts';
import { openSwitch } from './logistics-change-display';
import ShipKitsPanel from './ShipKitsPanel';
import OrderSwitchModal from './OrderSwitchModal';
import SwitchEmailModal from './SwitchEmailModal';
import { refusedEmail, type SwitchEmailRequest, type SwitchPermissions } from './WaitingSwitchActions';

/** Kept in step with the panels' closing transition (`.t-modal`). */
const CLOSE_MS = 150;

/** What a row's menu may offer for its receipt; null offers nothing. */
export type OrderSwitchMenu = {
  /** The switch this person may make now (L3, L11, L13), or null. */
  direction: LogisticsDirection | null;
  /** *Delivery Payment* while a switch waits for its fee, *Switch History* once there is one. */
  details: 'payment' | 'history' | null;
};

type Open = { kind: 'switch' | 'details'; id: string; closing: boolean };

export function useOrderSwitch({
  switching,
  permissions,
}: {
  switching: EventReceipts;
  permissions: SwitchPermissions;
}) {
  const router = useRouter();
  const { event, receipts, waiting } = switching;
  const [open, setOpen] = useState<Open | null>(null);
  const [emailRequest, setEmailRequest] = useState<SwitchEmailRequest | null>(null);

  const byId = useMemo(() => new Map(receipts.map(receipt => [receipt.id, receipt])), [receipts]);

  // The event's PAID deliveries, the parcels a new one can ride on (L6).
  const existing: ExistingDelivery[] = useMemo(
    () =>
      receipts
        .filter(receipt => receipt.status === 'PAID' && receipt.isDelivery)
        .map(receipt => ({
          registrationId: receipt.id,
          status: receipt.status,
          logisticsMethod: receipt.logisticsCode,
          deliveryAddress: receipt.deliveryAddress,
          deliverySplit: receipt.deliverySplit,
          runners: receipt.runners.map(runner => runner.address),
        })),
    [receipts],
  );

  const refOf = (registrationId: string) => byId.get(registrationId)?.orderRef ?? 'a paid receipt';
  const refresh = () => router.refresh();

  const menuFor = (registrationId: string): OrderSwitchMenu | null => {
    const receipt = byId.get(registrationId);
    if (!receipt) return null;
    const direction = permissions.edit && receipt.canSwitch.allowed ? receipt.canSwitch.direction : null;
    const details = openSwitch(receipt) ? 'payment' : receipt.logisticsChanges.length > 0 ? 'history' : null;
    return direction || details ? { direction, details } : null;
  };

  const close = () => {
    setOpen(current => (current ? { ...current, closing: true } : null));
    // Only the panel that was closing: another one opened meanwhile stays.
    setTimeout(() => setOpen(current => (current?.closing ? null : current)), CLOSE_MS);
  };

  const receipt = open ? byId.get(open.id) ?? null : null;

  const element = (
    <>
      {open?.kind === 'switch' && receipt && (
        <ShipKitsPanel
          key={receipt.id}
          receipt={receipt}
          event={event}
          existing={existing}
          waiting={waiting}
          refOf={refOf}
          isClosing={open.closing}
          onClose={close}
          onSaved={({ change, email }) => {
            close();
            refresh();
            const kind = change.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT ? 'created' : 'applied';
            const refused = refusedEmail(change, receipt.orderRef, kind, email);
            if (refused) setEmailRequest(refused);
          }}
          onStale={refresh}
        />
      )}

      {open?.kind === 'details' && receipt && (
        <OrderSwitchModal
          key={receipt.id}
          receipt={receipt}
          permissions={permissions}
          isClosing={open.closing}
          onClose={close}
          onChanged={refresh}
          onSendEmail={setEmailRequest}
        />
      )}

      {emailRequest && (
        <SwitchEmailModal
          key={`${emailRequest.changeId}-${emailRequest.kind}`}
          request={emailRequest}
          onClose={() => setEmailRequest(null)}
          onMarked={refresh}
        />
      )}
    </>
  );

  return {
    menuFor,
    startSwitch: (registrationId: string) => setOpen({ kind: 'switch', id: registrationId, closing: false }),
    showDetails: (registrationId: string) => setOpen({ kind: 'details', id: registrationId, closing: false }),
    element,
  };
}
