"use client";

import React from 'react';
import { Check } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { RegisteredCount, RegistrationStatus, rowPosition } from './EventRowCells';
import type { EventRow } from './event-row';

/**
 * The events table's columns (lg and up). The row menu comes in from the table
 * as `renderActions`, because what it offers depends on state the table holds
 * (which row is mid-request) and on the handlers that change it.
 */
export function eventColumns(renderActions: (event: EventRow) => React.ReactNode): ColumnDef<EventRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => {
        const isChecked = table.getIsAllPageRowsSelected();
        return (
          <div className="flex items-center justify-center px-1 w-8">
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
          <div className="flex items-center justify-center px-1 w-8">
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
    },
    {
      id: "index",
      header: "No.",
      cell: ({ row, table }) => (
        <span className="text-secondary font-mono">{row.original.listNo ?? rowPosition(table.getSortedRowModel().flatRows, row)}</span>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "title",
      header: "Event Name",
      cell: ({ row }) => <span className="font-medium text-primary">{row.original.title}</span>,
    },
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => <span className="whitespace-nowrap">{row.original.date}</span>,
    },
    {
      id: "registered",
      header: "Registrants",
      accessorFn: (row) => (row.registered?.paid ?? 0) + (row.registered?.awaiting ?? 0),
      cell: ({ row }) => <RegisteredCount event={row.original} />,
    },
    {
      id: "categories",
      header: "Categories",
      accessorFn: (row) => row.categories?.length || 0,
      cell: ({ row }) => `${row.original.categories?.length || 0} categories`,
    },
    {
      accessorKey: "location",
      header: "Location",
      cell: ({ row }) => row.original.location,
    },
    {
      id: "registration",
      header: "Registration",
      accessorFn: (row) => row.registrationState ?? 'OPEN',
      cell: ({ row }) => <RegistrationStatus event={row.original} />,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => renderActions(row.original),
    },
  ];
}
