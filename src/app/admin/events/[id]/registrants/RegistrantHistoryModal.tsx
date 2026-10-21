"use client";

/**
 * A row's one **History** (the owner, 2026-10-21: one menu item rather than
 * *Category Changes* and *Switch History* side by side): the runner's category
 * changes and their receipt's pickup / delivery switches, each in its own
 * section, in one modal.
 *
 * The lists are the ones the payment modals show — `CategoryChangeHistory`
 * (with its refund, by-hand email and, should an upgrade's proof be waiting,
 * *Validate Payment*) and `SwitchHistoryList` (the reference, *View proof*,
 * *Send email by hand*) — so an entry reads the same wherever it is opened.
 * A change still waiting for its money has its own item, *Category Payment* or
 * *Delivery Payment*, where its controls are.
 */

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { CategoryChangeView } from '@/lib/category-change-view';
import { LOGISTICS_CHANGE_STATUS_LABELS, asLogisticsChangeStatus } from '@/lib/logistics-change';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import type { Receipt } from '@/lib/logistics-receipts';
import type { RegistrantPermissions, RegistrantRow } from './RegistrantsTable';
import CategoryChangeHistory from './CategoryChangeHistory';
import { CategoryWithChange, openUpgrade } from './category-change-display';
import type { AppliedChange } from './useCategoryChangeModal';
import { useValidateChange } from './AwaitingChangeActions';
import { shipsToLines } from './OrderSwitchModal';
import { SwitchHistoryList } from './SwitchHistory';
import type { SwitchEmailRequest } from './WaitingSwitchActions';
import ProofLightbox from './ProofLightbox';

const switchProofSrc = (change: LogisticsChangeView) => `/api/admin/logistics-changes/${change.id}/proof`;

export default function RegistrantHistoryModal({
  runner,
  receipt,
  permissions,
  isClosing,
  onClose,
  onChangeUpdated,
  onSendChangeEmail,
  onSendSwitchEmail,
}: {
  runner: RegistrantRow;
  /** The runner's receipt, whose switches are listed; null when it has none to read. */
  receipt: Receipt | null;
  permissions: RegistrantPermissions;
  /** True while the parent plays the closing transition before unmounting. */
  isClosing: boolean;
  onClose: () => void;
  /** A category change the history wrote; `applied` when it moved the runner. */
  onChangeUpdated: (change: CategoryChangeView, applied?: AppliedChange) => void;
  onSendChangeEmail: (change: CategoryChangeView, kind: 'applied' | 'created') => void;
  onSendSwitchEmail: (request: SwitchEmailRequest) => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // A switch's proof open full screen, read only here: a waiting one is
  // validated in *Delivery Payment*.
  const [switchProof, setSwitchProof] = useState<LogisticsChangeView | null>(null);

  const isOpen = entered && !isClosing;
  const changes: CategoryChangeView[] = runner.categoryChanges ?? [];
  const switches = receipt?.logisticsChanges ?? [];
  const waiting = openUpgrade<CategoryChangeView>(runner);
  const proofIn = waiting?.proofSubmitted ? waiting : null;
  const { validating, validate } = useValidateChange({
    change: proofIn,
    onValidated: result => onChangeUpdated(result.change, result),
  });
  const switchStatus = switchProof ? asLogisticsChangeStatus(switchProof.status) : null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="registrant-history-title"
        className={`t-modal admin-modal-panel admin-modal-sheet w-full max-w-xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-clip ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id="registrant-history-title" className="text-xl font-semibold text-primary m-0">
              History
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

        <div className="admin-modal-body p-6 max-sm:p-4 overflow-y-auto flex-1 flex flex-col gap-8 text-sm">
          {changes.length > 0 && (
            <section className="flex flex-col gap-4">
              <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2">
                <dt className="text-secondary">Category</dt>
                <dd className="m-0 text-primary">
                  <CategoryWithChange runner={runner} detailed />
                </dd>
              </dl>
              <CategoryChangeHistory
                title="Category changes"
                changes={changes}
                permissions={permissions}
                onUpdated={onChangeUpdated}
                onSendEmail={onSendChangeEmail}
                validation={{ change: proofIn, validating, validate }}
              />
            </section>
          )}

          {receipt && switches.length > 0 && (
            <section className={`flex flex-col gap-4 ${changes.length > 0 ? 'pt-8 border-t border-[var(--dash-border)]' : ''}`}>
              <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2">
                <dt className="text-secondary">Kits</dt>
                <dd className="m-0 text-primary">{receipt.logisticsMethod}</dd>
                {shipsToLines(receipt).map(line => (
                  <React.Fragment key={line.label}>
                    <dt className="text-secondary">{line.label}</dt>
                    <dd className="m-0 text-primary [overflow-wrap:anywhere]">{line.value}</dd>
                  </React.Fragment>
                ))}
              </dl>
              <div>
                <p className="m-0 text-xs font-semibold uppercase tracking-wider text-secondary">
                  Pickup &amp; delivery switches
                  {receipt.runners.length > 1 ? ` · whole receipt, ${receipt.runners.length} runners` : ''}
                </p>
                <SwitchHistoryList
                  changes={switches}
                  onViewProof={permissions.proof ? setSwitchProof : undefined}
                  onSendEmail={
                    permissions.email
                      ? change =>
                          onSendSwitchEmail({
                            kind: 'applied',
                            changeId: change.id,
                            changeRef: change.changeRef,
                            orderRef: receipt.orderRef,
                            message: null,
                            error: change.lastEmailError,
                          })
                      : undefined
                  }
                />
              </div>
            </section>
          )}
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end gap-3 bg-[var(--dash-sunken)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-11 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {switchProof && (
        <ProofLightbox
          src={switchProofSrc(switchProof)}
          orderRef={switchProof.changeRef}
          transactionNumber={switchProof.transactionNumber}
          totalAmount={switchProof.totalCharged || switchProof.fee}
          amountLabel="Delivery Fee"
          status={switchStatus ? LOGISTICS_CHANGE_STATUS_LABELS[switchStatus] : switchProof.status}
          isPdf={switchProof.proofIsPdf}
          canValidate={false}
          isValidating={false}
          onValidate={() => undefined}
          onClose={() => setSwitchProof(null)}
        />
      )}
    </div>
  );
}
