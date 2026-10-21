"use client";

/**
 * A row's one **History** item and its modal (`RegistrantHistoryModal`, the
 * owner, 2026-10-21): offered once the runner has a category change or their
 * receipt has a pickup / delivery switch, to anyone who sees the row. The
 * runner is read from the table's rows and the receipt from the switch read
 * (`useOrderSwitch`) each render, so a write shows at once; the writes and
 * by-hand emails go back through the hooks that own them.
 */

import React, { useState } from 'react';
import type { CategoryChangeView } from '@/lib/category-change-view';
import type { Receipt } from '@/lib/logistics-receipts';
import type { RegistrantPermissions, RegistrantRow } from './RegistrantsTable';
import RegistrantHistoryModal from './RegistrantHistoryModal';
import type { AppliedChange } from './useCategoryChangeModal';
import type { SwitchEmailRequest } from './WaitingSwitchActions';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

export function useRegistrantHistory({
  runners,
  permissions,
  receiptFor,
  onChangeUpdated,
  onSendChangeEmail,
  onSendSwitchEmail,
}: {
  runners: RegistrantRow[];
  permissions: RegistrantPermissions;
  receiptFor: (registrationId: string) => Receipt | null;
  onChangeUpdated: (runnerId: string, change: CategoryChangeView, applied?: AppliedChange) => void;
  onSendChangeEmail: (runner: RegistrantRow, change: CategoryChangeView, kind: 'applied' | 'created') => void;
  onSendSwitchEmail: (request: SwitchEmailRequest) => void;
}) {
  const [open, setOpen] = useState<{ id: string; closing: boolean } | null>(null);

  const hasHistory = (runner: RegistrantRow): boolean =>
    (runner.categoryChanges?.length ?? 0) > 0 || (receiptFor(runner.registrationId)?.logisticsChanges.length ?? 0) > 0;

  const close = () => {
    setOpen(current => (current ? { ...current, closing: true } : null));
    // Only the modal that was closing: another one opened meanwhile stays.
    setTimeout(() => setOpen(current => (current?.closing ? null : current)), CLOSE_MS);
  };

  const runner = open ? runners.find(row => row.id === open.id) ?? null : null;

  const element = open && runner && (
    <RegistrantHistoryModal
      key={runner.id}
      runner={runner}
      receipt={receiptFor(runner.registrationId)}
      permissions={permissions}
      isClosing={open.closing}
      onClose={close}
      onChangeUpdated={(change, applied) => onChangeUpdated(runner.id, change, applied)}
      onSendChangeEmail={(change, kind) => onSendChangeEmail(runner, change, kind)}
      onSendSwitchEmail={onSendSwitchEmail}
    />
  );

  return {
    hasHistory,
    show: (runnerId: string) => setOpen({ id: runnerId, closing: false }),
    element,
  };
}
