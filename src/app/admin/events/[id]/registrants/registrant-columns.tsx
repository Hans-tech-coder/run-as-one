/**
 * The registrants table's columns: what each one shows, sorts on and filters
 * by. The cards below `lg` read the same rows through AdminCardList and do not
 * use these.
 *
 * Split out of `RegistrantsTable.tsx` (UNPAID_ORDERS_PLAN.md Batch 2). The
 * columns hold no state of their own; the eye on the Reference cell and the
 * Actions cell call back into the table through `onView` and `renderActions`,
 * so the table still decides when the list is rebuilt.
 */

import React from 'react';
import { Eye, Check } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { MinorBadge, RegistrantStatusBadges } from './registrant-display';
import type { RegistrantRow } from './RegistrantsTable';

/** The Province filter's choice for rows with no home address on file. */
export const NO_PROVINCE = 'NOT ON FILE';

/**
 * A column's own padding, on top of the tables' tight `px-2.5`. The
 * registrants table has eleven columns to fit beside the open sidebar on a
 * 1366px laptop without a sideways scroll, so every column is kept to what it
 * needs: the checkbox column gives up its right side, and the reference keeps
 * a wider left so it does not read as part of the No. beside it. The Unpaid
 * checkouts table uses the same, so the two tabs line up.
 */
export function columnInset(columnId: string): string {
  if (columnId === 'select') return 'pl-4 pr-0';
  if (columnId === 'runnerRef' || columnId === 'order') return 'pl-5';
  return '';
}

/**
 * The mark / unmark column: a checkbox per row and one in the header for the
 * page. Shared by the Registrants and Unpaid checkouts tables, so a row is
 * marked the same way on both.
 */
export function selectionColumn<T>(): ColumnDef<T> {
  return {
    id: "select",
    header: ({ table }) => {
      const isChecked = table.getIsAllPageRowsSelected();
      return (
        <div className="flex items-center justify-center w-4">
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
              className="appearance-none w-4 h-4 rounded border border-[var(--ink-20)] bg-transparent checked:bg-[var(--ink)] checked:border-[var(--ink)] cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ink-20)]"
            />
            {isChecked && <Check className="absolute text-[var(--dash-inverse-fg)] pointer-events-none" size={12} strokeWidth={3} />}
          </div>
        </div>
      );
    },
    cell: ({ row }) => {
      const isChecked = row.getIsSelected();
      return (
        <div className="flex items-center justify-center w-4">
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={row.getToggleSelectedHandler()}
              className="appearance-none w-4 h-4 rounded border border-[var(--ink-20)] bg-transparent checked:bg-[var(--ink)] checked:border-[var(--ink)] cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ink-20)]"
            />
            {isChecked && <Check className="absolute text-[var(--dash-inverse-fg)] pointer-events-none" size={12} strokeWidth={3} />}
          </div>
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  };
}

export function buildRegistrantColumns({
  onView,
  renderActions,
}: {
  onView: (runner: RegistrantRow) => void;
  renderActions: (runner: RegistrantRow) => React.ReactNode;
}): ColumnDef<RegistrantRow>[] {
  return [
    selectionColumn<RegistrantRow>(),
    {
      // The registrant's own number, assigned on the server from the
      // registration order (see regNo in page.tsx) — not this row's position
      // on screen.
      //
      // It used to be the position, and that made it a number about the table
      // rather than about the person: filtering to the unpaid orders renumbered
      // everyone 1, 2, 3, so the figure could not be quoted on a phone call or
      // written on a list. How many rows are in view is a question the footer
      // already answers ("1-25 of 143").
      id: "index",
      header: "No.",
      cell: ({ row }) => (
        <span className="text-secondary font-mono">{row.original.regNo}</span>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      // The runner's own reference — the order reference plus their position
      // on it (RM-D918005C-2). Sorting and searching run on this rather than
      // on the bare order reference: it contains the order reference, so
      // looking up a whole group still works, and it keeps the members of a
      // group in their own order instead of an arbitrary one.
      accessorKey: "runnerRef",
      header: "Reference",
      // The line under the reference is when the order was placed (page.tsx,
      // registeredAtLabel), worded as the Unpaid checkouts tab words its own.
      // The eye sits beside the reference only and the date runs under both,
      // so the column is as wide as the wider of the two lines rather than
      // their sum: the table has eleven columns to fit beside the sidebar.
      cell: ({ row }) => (
        <div className="text-secondary">
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap">{row.original.runnerRef}</span>
            <button
              onClick={() => onView(row.original)}
              className="icon-btn"
              title="View Details"
            >
              <Eye size={16} />
            </button>
          </div>
          <span className="block whitespace-nowrap text-xs text-[var(--text-muted)]">{row.original.registeredAtLabel}</span>
        </div>
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="font-medium text-primary">
          <div className="flex items-center gap-2 flex-wrap">
            {row.original.name}
            {row.original.isMinor && <MinorBadge />}
          </div>
          {/* Allowed to break anywhere: an email is one long word, and left
              whole it set the column's narrowest width and pushed the table
              into a sideways scroll. */}
          <div className="text-xs text-secondary font-normal [overflow-wrap:anywhere]">{row.original.email}</div>
        </div>
      ),
      filterFn: (row, id, value) => {
        const rowValue = `${row.original.name} ${row.original.email}`.toLowerCase();
        return rowValue.includes((value as string).toLowerCase());
      }
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => row.original.category,
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId));
      }
    },
    {
      accessorKey: "size",
      header: "Size",
      cell: ({ row }) => row.original.size,
    },
    {
      // The province of the runner's home address (RUNNER_ADDRESS_PLAN.md
      // Batch 3), its own column so logistics can sort and filter by it; the
      // whole address is in the detail modal and the CSV. A dash on rows
      // from before addresses were collected.
      id: "province",
      accessorFn: row => row.addressProvince || '',
      header: "Province",
      cell: ({ row }) => row.original.addressProvince || <span className="text-[var(--text-muted)]">—</span>,
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId) || NO_PROVINCE);
      }
    },
    {
      accessorKey: "logisticsMethod",
      header: "Logistics",
      cell: ({ row }) => <span className="capitalize">{row.original.logisticsMethod}</span>,
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId));
      }
    },
    {
      accessorKey: "paymentMethod",
      header: "Payment",
      // Already the readable uppercase label; see registrants/page.tsx.
      cell: ({ row }) => <span>{row.original.paymentMethod}</span>,
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId));
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1.5">
          <RegistrantStatusBadges runner={row.original} />
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      // Both controls sit at the start of the cell, under the column label,
      // rather than pushed to the row's right edge (PROJECT_GUIDE §8.6).
      cell: ({ row }) => renderActions(row.original),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
