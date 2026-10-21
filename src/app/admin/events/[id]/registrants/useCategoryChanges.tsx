"use client";

/**
 * A runner's *Category Changes* modal, opened from the row menu (the owner,
 * 2026-10-21), as `useOrderSwitch` opens a receipt's *Delivery Payment* /
 * *Switch History*. `menuFor` decides the item — **Category Payment** while an
 * upgrade waits for its money, nothing otherwise (past changes are in the
 * row's *History*) — and `element` renders the modal for the open runner,
 * read from the table's rows each render, so a write the modal makes shows at
 * once. The writes themselves go through `useCategoryChangeModal`'s
 * `onApplied` / `updateChange` and its by-hand email, which the table owns.
 */

import React, { useState } from 'react';
import type { CategoryChangeView } from '@/lib/category-change-view';
import type { RegistrantPermissions, RegistrantRow } from './RegistrantsTable';
import CategoryChangesModal from './CategoryChangesModal';
import { openUpgrade } from './category-change-display';
import type { AppliedChange } from './useCategoryChangeModal';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

/**
 * What a row's menu offers for the runner's category changes: *Category
 * Payment* while an upgrade waits, or nothing. Past changes are read in the
 * row's one *History* (`useRegistrantHistory`, the owner, 2026-10-21).
 */
export type CategoryChangesMenu = 'payment' | null;

export function useCategoryChanges({
  runners,
  permissions,
  onUpdated,
  onSendEmail,
}: {
  runners: RegistrantRow[];
  permissions: RegistrantPermissions;
  /** A change the modal wrote, for this runner; `applied` when it moved them. */
  onUpdated: (runnerId: string, change: CategoryChangeView, applied?: AppliedChange) => void;
  onSendEmail: (runner: RegistrantRow, change: CategoryChangeView, kind: 'applied' | 'created') => void;
}) {
  const [open, setOpen] = useState<{ id: string; closing: boolean } | null>(null);

  const menuFor = (runner: RegistrantRow): CategoryChangesMenu => (openUpgrade(runner) ? 'payment' : null);

  const close = () => {
    setOpen(current => (current ? { ...current, closing: true } : null));
    // Only the modal that was closing: another one opened meanwhile stays.
    setTimeout(() => setOpen(current => (current?.closing ? null : current)), CLOSE_MS);
  };

  const runner = open ? runners.find(row => row.id === open.id) ?? null : null;

  const element = open && runner && (
    <CategoryChangesModal
      key={runner.id}
      runner={runner}
      permissions={permissions}
      isClosing={open.closing}
      onClose={close}
      onUpdated={(change, applied) => onUpdated(runner.id, change, applied)}
      onSendEmail={(change, kind) => onSendEmail(runner, change, kind)}
    />
  );

  return {
    menuFor,
    show: (runnerId: string) => setOpen({ id: runnerId, closing: false }),
    element,
  };
}
