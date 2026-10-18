"use client";

/**
 * The registrants as cards, below `lg` (AdminCardList): the same rows as the
 * table above it, read from the one TanStack instance, so search, the queue
 * chips, filters, sort, selection and the page all agree. A group's members
 * keep their order (-1 above -2) because the rows arrive in registration order
 * and nothing here re-sorts them.
 *
 * Split out of `RegistrantsTable.tsx` (CATEGORY_CHANGE_PLAN.md Session 2),
 * which was past the size the repository splits files at, when the Category
 * field gained its change badge. Holds no state.
 */

import React from 'react';
import type { Table } from '@tanstack/react-table';
import AdminCardList from '../../../AdminCardList';
import { MinorBadge, RegistrantStatusBadges, expiredExplanation } from './registrant-display';
import { CategoryWithChange } from './category-change-display';
import { LogisticsWithSwitch } from './logistics-change-display';
import RegistrantRowActions, { type RegistrantRowActionHandlers } from './RegistrantRowActions';
import type { RegistrantRow } from './RegistrantsTable';

export default function RegistrantCards({
  table,
  rowActions,
}: {
  table: Table<RegistrantRow>;
  rowActions: RegistrantRowActionHandlers;
}) {
  return (
    <div className="dash-mobile-only">
      <AdminCardList
        items={table.getRowModel().rows}
        getKey={row => row.id}
        label="Registrants"
        className="is-flush"
        selection={{
          isSelected: row => row.getIsSelected(),
          toggle: row => row.toggleSelected(),
          label: row => `Select ${row.original.name}`,
        }}
        selectAll={{
          checked: table.getIsAllPageRowsSelected(),
          toggle: () => table.toggleAllPageRowsSelected(!table.getIsAllPageRowsSelected()),
          label: `Select all ${table.getRowModel().rows.length} on this page`,
        }}
        // The registrant's own number from the server, never the position.
        leading={row => <span className="font-mono">{row.original.regNo}</span>}
        // A name is untrusted length: it truncates rather than holding the
        // card open, and so does the email under it, as in the table cell.
        title={row => (
          <>
            <span className="block truncate">{row.original.name}</span>
            <span className="block truncate text-xs font-normal text-secondary">{row.original.email}</span>
          </>
        )}
        // The reference alone. The table's eye beside it was left off the
        // card at the owner's request; View Details in the card's ⋯ menu
        // opens the same modal.
        subtitle={row => (
          <>
            <span className="block">{row.original.runnerRef}</span>
            <span className="block text-xs">{row.original.registeredAtLabel}</span>
          </>
        )}
        badges={row => (
          <>
            {row.original.isMinor && <MinorBadge />}
            <RegistrantStatusBadges runner={row.original} />
            {/* What the table's badges say only on hover, said in words:
                a phone has no hover. Allowed to wrap, unlike the chips. */}
            {row.original.status === 'EXPIRED' && (
              <span className="status-note neutral" style={{ flexBasis: '100%', marginTop: 0, whiteSpace: 'normal' }}>
                {expiredExplanation(row.original)}
              </span>
            )}
            {row.original.emailPending && (
              <span className="status-note neutral" style={{ flexBasis: '100%', marginTop: 0, whiteSpace: 'normal' }}>
                The {row.original.emailPendingLabel} email has not gone out.
              </span>
            )}
          </>
        )}
        fields={row => [
          { label: 'Category', value: <CategoryWithChange runner={row.original} detailed /> },
          { label: 'Size', value: row.original.size || '—' },
          { label: 'Province', value: row.original.addressProvince || '—' },
          {
            label: 'Logistics',
            value: (
              <LogisticsWithSwitch
                runner={row.original}
                onHistory={() => rowActions.onLogisticsHistory(row.original.id)}
              />
            ),
          },
          { label: 'Payment', value: row.original.paymentMethod },
        ]}
        actions={row => <RegistrantRowActions runner={row.original} layout="card" {...rowActions} />}
        empty={
          <div className="border border-[var(--dash-border)] rounded-lg py-16 px-4 text-center text-[var(--text-muted)]">
            No registrants found.
          </div>
        }
      />
    </div>
  );
}
