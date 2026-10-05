"use client";

/**
 * A row's Remarks and Email buttons and its menu, for the table's Actions
 * cell and the card's footer. Same conditions and the same accessible names
 * in both. The table shows icons under the column label (PROJECT_GUIDE §8.6);
 * a card has no column label to explain an icon, so it adds a visible word,
 * one the accessible name contains.
 *
 * Split out of `RegistrantsTable.tsx` (UNPAID_ORDERS_PLAN.md Batch 2), where it
 * was a render helper. It owns no state: every button calls back into the
 * table, which holds the runners and the modals they open.
 */

import React from 'react';
import { MessageSquare, MessageSquareText, Mail, MailWarning } from 'lucide-react';
import RegistrantActionsMenu from './RegistrantActionsMenu';
import type { RegistrantPermissions, RegistrantRow } from './RegistrantsTable';

export type RegistrantRowActionHandlers = {
  permissions: RegistrantPermissions;
  updatingId: string | null;
  onStatusChange: (registrationId: string, newStatus: string) => void;
  onView: (runnerId: string) => void;
  onEdit: (runnerId: string) => void;
  onDelete: (runnerId: string) => void;
  onRemarks: (runnerId: string) => void;
  onEmail: (runnerId: string) => void;
};

export default function RegistrantRowActions({
  runner,
  layout,
  permissions,
  updatingId,
  onStatusChange,
  onView,
  onEdit,
  onDelete,
  onRemarks,
  onEmail,
}: RegistrantRowActionHandlers & { runner: RegistrantRow; layout: 'table' | 'card' }) {
  // A different icon, not just a different colour: colour alone is the one
  // signal a colour-blind organizer cannot read.
  const remarksIcon = runner.remarks
    ? <MessageSquareText size={16} aria-hidden="true" />
    : <MessageSquare size={16} aria-hidden="true" />;
  const emailIcon = runner.emailPending
    ? <MailWarning size={16} aria-hidden="true" />
    : <Mail size={16} aria-hidden="true" />;
  const remarksLabel = runner.remarks ? 'Edit remarks' : 'Add remarks';
  const emailLabel = runner.emailPending ? 'Send email by hand' : 'View sent email';

  const menu = (
    <RegistrantActionsMenu
      runnerId={runner.id}
      registrationId={runner.registrationId}
      label={runner.name}
      status={runner.status}
      isBankTransfer={runner.isBankTransfer}
      updatingId={updatingId}
      handleStatusChange={onStatusChange}
      onView={onView}
      onEdit={onEdit}
      onDelete={onDelete}
      canEdit={permissions.edit}
      canDelete={permissions.remove}
      canValidate={permissions.validate}
    />
  );

  // Remarks and Email open modals whose routes need `registration:remark` and
  // `registration:email`; a role without one is not shown its button. The
  // remarks themselves stay readable in the detail modal for everyone.
  if (layout === 'card') {
    return (
      <>
        {/* One word each, so both and the menu share one line beside a
            360px screen's menu rail. Which email it is rides the icon, the
            red tone and the card's own Email Unsent badge, as it does in
            the table; the accessible name says it in full. */}
        {permissions.remark && (
          <button
            type="button"
            onClick={() => onRemarks(runner.id)}
            className={`btn-filter is-compact ${runner.remarks ? 'is-primary' : ''}`}
            aria-label={remarksLabel}
          >
            {remarksIcon} Remarks
          </button>
        )}
        {permissions.email && (
          <button
            type="button"
            onClick={() => onEmail(runner.id)}
            className={`btn-filter is-compact ${runner.emailPending ? 'is-danger' : ''}`}
            aria-label={emailLabel}
          >
            {emailIcon} Email
          </button>
        )}
        <div className="action-dropdown-container flex ml-auto">{menu}</div>
      </>
    );
  }

  return (
    <div className="action-dropdown-container flex items-center gap-1">
      {permissions.remark && (
        <button
          onClick={() => onRemarks(runner.id)}
          className={`icon-btn ${runner.remarks ? 'primary' : ''}`}
          title={runner.remarks ? 'Remarks on file' : 'Add remarks'}
          aria-label={remarksLabel}
        >
          {remarksIcon}
        </button>
      )}
      {permissions.email && (
        <button
          onClick={() => onEmail(runner.id)}
          className={`icon-btn ${runner.emailPending ? 'danger' : ''}`}
          title={runner.emailPending
            ? `Send the ${runner.emailPendingLabel} email by hand`
            : 'View the email this runner was sent'}
          aria-label={emailLabel}
        >
          {emailIcon}
        </button>
      )}
      {menu}
    </div>
  );
}
