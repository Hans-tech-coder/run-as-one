"use client";

/**
 * A runner's category changes in a modal of their own (the owner,
 * 2026-10-21: out of *Registrant Details*, which had grown long, and opened
 * from the row menu as a delivery switch's *Delivery Payment* is,
 * `OrderSwitchModal`). The row menu offers it as **Category Payment** while an
 * upgrade waits for its money; once that is settled it reads *Category
 * Changes* until closed. Past changes are read in the row's one *History*
 * (`RegistrantHistoryModal`).
 *
 * Holds nothing of its own: the list, the waiting upgrade's actions, its
 * proof and *Validate Payment* are `CategoryChangeHistory`, and every write
 * goes back through `onUpdated` to the table, which owns the rows.
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle, X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import type { CategoryChangeView } from '@/lib/category-change-view';
import type { RegistrantPermissions, RegistrantRow } from './RegistrantsTable';
import CategoryChangeHistory from './CategoryChangeHistory';
import { CategoryWithChange, openUpgrade } from './category-change-display';
import type { AppliedChange } from './useCategoryChangeModal';
import { useValidateChange } from './AwaitingChangeActions';

export default function CategoryChangesModal({
  runner,
  permissions,
  isClosing,
  onClose,
  onUpdated,
  onSendEmail,
}: {
  runner: RegistrantRow;
  permissions: RegistrantPermissions;
  /** True while the parent plays the closing transition before unmounting. */
  isClosing: boolean;
  onClose: () => void;
  /** A change the history wrote; `applied` when it moved the runner. */
  onUpdated: (change: CategoryChangeView, applied?: AppliedChange) => void;
  onSendEmail: (change: CategoryChangeView, kind: 'applied' | 'created') => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const isOpen = entered && !isClosing;
  const waiting = openUpgrade<CategoryChangeView>(runner);
  // Validate Payment, once the runner sent GCash or bank proof on the link:
  // the footer, the card and the full-screen viewer share this one press.
  const proofIn = waiting?.proofSubmitted ? waiting : null;
  const { validating, validate } = useValidateChange({
    change: proofIn,
    onValidated: result => onUpdated(result.change, result),
  });
  const canValidate = permissions.validate && !!proofIn;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-changes-title"
        className={`t-modal admin-modal-panel admin-modal-sheet w-full max-w-xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-clip ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id="category-changes-title" className="text-xl font-semibold text-primary m-0">
              {waiting ? 'Category Payment' : 'Category Changes'}
            </h3>
            <p className="text-sm text-secondary mt-1 m-0 [overflow-wrap:anywhere]">
              {runner.orderRef} &middot; {runner.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body p-6 max-sm:p-4 overflow-y-auto flex-1 flex flex-col gap-6 text-sm">
          <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2">
            <dt className="text-secondary">Category</dt>
            <dd className="m-0 text-primary">
              <CategoryWithChange runner={runner} detailed />
            </dd>
          </dl>

          <CategoryChangeHistory
            changes={runner.categoryChanges ?? []}
            permissions={permissions}
            onUpdated={onUpdated}
            onSendEmail={onSendEmail}
            validation={{ change: proofIn, validating, validate }}
          />
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-between items-center gap-3 bg-[var(--dash-sunken)] shrink-0">
          <div>
            {/* The registrants' own Validate Payment button, as the delivery switch's modal has it. */}
            {canValidate && (
              <button type="button" onClick={validate} disabled={validating} className="btn-light">
                <CheckCircle className="w-4 h-4" />
                {validating ? <BusyLabel>Validating</BusyLabel> : 'Validate Payment'}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-11 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
