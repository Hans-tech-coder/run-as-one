"use client";

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Edit, ExternalLink, Search, Trash2, Trophy, X } from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AdminCardList from '../AdminCardList';
import AdminTablePager from '../AdminTablePager';
import FiltersMenu, { type FilterGroup } from '../FiltersMenu';
import MobileSortMenu from '../MobileSortMenu';
import RowActionsMenu, { type RowAction } from '../RowActionsMenu';
import DeleteEventModal from '../events/DeleteEventModal';
import { rowPosition } from '../events/EventRowCells';
import { useEventRowActions } from '../events/useEventRowActions';
import { ClientName, FinisherCount, ResultKindBadge, resultColumns } from './result-columns';
import { RESULT_KINDS, resultKind, type ResultRow } from './result-row';

/**
 * The /admin/results list, built the way the Events table is: one TanStack
 * table, drawn as a table from `lg` up and as cards below it.
 *
 * Create is not offered yet: `/admin/results/new` arrives with
 * RESULTS_NAV_PLAN.md Batch 3, and a button to a page that is not there
 * would be a dead link (PROJECT_GUIDE §8 rule 1).
 */

/** The Filters sheet's value for a race not linked to any client yet. */
const NO_CLIENT = '__none__';

export default function ResultsListClient({
  events,
  canFilterByClient = false,
}: {
  events: ResultRow[];
  /** Whether this person holds `platform:manage`, as on the Events screen. */
  canFilterByClient?: boolean;
}) {
  const [rows, setRows] = useState(events);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedKinds, setSelectedKinds] = useState<string[]>([]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);

  // Delete is the Events table's, modal and request alike. The hook updates
  // its list as EventRows (a ResultRow is one); a delete only filters, so
  // every row it hands back is one of ours.
  const actions = useEventRowActions(update =>
    setRows(prev => (typeof update === 'function' ? update(prev) : update) as ResultRow[]),
  );

  const rowActions = (row: ResultRow): RowAction[] => {
    const canEdit = row.access?.edit ?? true;
    const canDelete = row.access?.delete ?? true;
    return [
      { key: 'open', label: 'Open Results', icon: <Trophy size={16} />, to: `/admin/results/${row.id}` },
      ...(row.finishers > 0
        ? [{ key: 'public', label: 'View Public Page', icon: <ExternalLink size={16} />, href: `/results/${row.slug}` }]
        : []),
      // Both kinds edit on the one event form today; R4's read-only details
      // for a registered-here race come with the workspace.
      ...(canEdit
        ? [{ key: 'edit', label: 'Edit Details', icon: <Edit size={16} />, to: `/admin/events/${row.id}/edit` }]
        : []),
      // Only a results-only race is deleted from here. A registered-here race
      // has runners and money behind it, and its delete stays on Events.
      ...(row.resultsOnly && canDelete
        ? [{ key: 'delete', label: 'Delete', icon: <Trash2 size={16} />, danger: true, onSelect: () => actions.openDelete(row) }]
        : []),
    ];
  };

  const renderActions = (row: ResultRow, className = '') => (
    <RowActionsMenu label={row.title} actions={rowActions(row)} className={className} />
  );

  // The menu reads nothing that changes between renders but the row itself.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => resultColumns(row => renderActions(row)), []);

  const filteredRows = useMemo(
    () =>
      rows.filter(
        row =>
          (selectedKinds.length === 0 || selectedKinds.includes(resultKind(row))) &&
          (selectedClients.length === 0 || selectedClients.includes(row.client?.id ?? NO_CLIENT)),
      ),
    [rows, selectedKinds, selectedClients],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, globalFilter },
    initialState: { columnVisibility: { location: false } },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Clients come from the races on the list, so no filter can only come back
  // empty — the Events screen's rule.
  const clientOptions = useMemo(() => {
    const byId = new Map<string, string>();
    let unlinked = false;
    for (const row of rows) {
      if (row.client) byId.set(row.client.id, row.client.name);
      else unlinked = true;
    }
    const options = [...byId]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return unlinked ? [...options, { value: NO_CLIENT, label: 'No client yet' }] : options;
  }, [rows]);
  const kindOptions = (Object.keys(RESULT_KINDS) as (keyof typeof RESULT_KINDS)[])
    .map(key => ({ value: key, label: RESULT_KINDS[key].label }));

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) => {
    setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));
    table.setPageIndex(0);
  };
  const filterGroups: FilterGroup[] = [
    { label: 'Type', options: kindOptions, selected: selectedKinds, onToggle: toggleIn(setSelectedKinds) },
    ...(canFilterByClient
      ? [{ label: 'Client', options: clientOptions, selected: selectedClients, onToggle: toggleIn(setSelectedClients) }]
      : []),
  ];
  const clearFilters = () => {
    setSelectedKinds([]);
    setSelectedClients([]);
    table.setPageIndex(0);
  };
  const emptyMessage = rows.length > 0
    ? 'No races match your search or filters.'
    : 'No races with results yet.';

  return (
    <div className="flex flex-col gap-4 w-full text-primary">
      <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
        <div className="toolbar-actions" style={{ flex: 1 }}>
          <div className="search-wrapper">
            <Search className="search-icon" size={16} />
            <input
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              className="search-input"
              placeholder="Search races by name, client or location..."
              aria-label="Search races"
            />
            {globalFilter && (
              <button
                type="button"
                onClick={() => setGlobalFilter('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--ink-85)] bg-transparent border-none cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <FiltersMenu groups={filterGroups} onClear={clearFilters} />
          <MobileSortMenu table={table} />
        </div>
      </div>

      <div className="dash-desktop-only border border-[var(--dash-border)] rounded-lg overflow-hidden bg-transparent">
        <Table>
          <TableHeader className="bg-transparent">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className="border-b border-[var(--dash-border)] hover:bg-transparent">
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`py-4 px-4 text-secondary font-medium h-auto ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <ChevronUp className="w-3.5 h-3.5" />,
                        desc: <ChevronDown className="w-3.5 h-3.5" />,
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} className="border-b border-[var(--dash-hairline)] hover:bg-[var(--ink-05)] transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className="py-4 px-4 text-primary">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="py-16 text-center text-[var(--text-muted)]">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="dash-mobile-only">
        <AdminCardList
          items={table.getRowModel().rows}
          getKey={row => row.id}
          label="Results"
          className="is-flush"
          leading={row => (
            <span className="font-mono">{row.original.listNo ?? rowPosition(table.getSortedRowModel().flatRows, row)}</span>
          )}
          title={row => <span className="line-clamp-2">{row.original.title}</span>}
          badges={row => <ResultKindBadge row={row.original} />}
          fields={row => [
            { label: 'Date', value: row.original.date },
            { label: 'Finishers', value: <FinisherCount row={row.original} /> },
            { label: 'Certificate', value: row.original.certificate },
            { label: 'Client', value: <ClientName row={row.original} /> },
          ]}
          actions={row => renderActions(row.original, 'ml-auto')}
          empty={
            <div className="border border-[var(--dash-border)] rounded-lg py-16 px-4 text-center text-[var(--text-muted)]">
              {emptyMessage}
            </div>
          }
        />
      </div>

      <AdminTablePager table={table} />

      <DeleteEventModal
        event={actions.remove.event}
        isOpen={actions.remove.isOpen}
        isClosing={actions.remove.isClosing}
        isDeleting={actions.remove.isDeleting}
        onClose={actions.remove.close}
        onConfirm={actions.remove.confirm}
      />
    </div>
  );
}
