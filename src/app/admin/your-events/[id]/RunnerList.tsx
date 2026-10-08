"use client";

import React, { useMemo, useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type RowSelectionState,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ClientRunnerRow } from '@/lib/client-runners';
import { SHIRT_SIZES } from '@/lib/shirt-size';
import AdminCardList from '../../AdminCardList';
import AdminTablePager from '../../AdminTablePager';
import FiltersMenu, { type FilterGroup } from '../../FiltersMenu';
import { selectionColumn } from '../../events/[id]/registrants/registrant-columns';
import { buildRunnerCsv, downloadRunnerCsv } from './runner-csv';

/**
 * The race page's runner list (CLIENT_RACE_PAGE_PLAN.md, Batch 4): what the
 * client needs to release and ship race kits — name and reference, category,
 * shirt size, status, pickup or delivery, phone, email and address
 * (`client-runners.ts` sends nothing else). Screen only, like the payouts.
 *
 * Built like the staff Registrants table, so a client finds the same tools in
 * the same places: a search box (name, reference, phone or email), the
 * Filters chip (category, status, race kit, shirt size, province), mark /
 * unmark checkboxes, and **Export to CSV** — the marked rows when any are
 * marked, every filtered row otherwise. The export is told to the activity
 * trail first (`api/admin/events/[id]/registrants/export`, `list: 'client'`).
 * Every runner arrives with the page, so all of this works in the browser.
 *
 * The table from `lg` up, `AdminCardList` below it, one pager under both; on
 * a phone the marked count, Export and Clear ride the staff screen's bulk bar.
 */

type Filterable = 'category' | 'status' | 'kit' | 'size' | 'province';

const FILTERS: { id: Filterable; label: string }[] = [
  { id: 'category', label: 'Category' },
  { id: 'status', label: 'Status' },
  { id: 'kit', label: 'Race Kit' },
  { id: 'size', label: 'Shirt Size' },
  { id: 'province', label: 'Province' },
];

/** A row passes when its value is one of those ticked. */
const oneOf: FilterFn<ClientRunnerRow> = (row, columnId, value: string[]) =>
  !value?.length || value.includes(String(row.getValue(columnId)));

/** Every word typed must appear in the name, the reference, the phone or the email. */
const searchRunner: FilterFn<ClientRunnerRow> = (row, _columnId, value: string) => {
  const haystack = [row.original.firstName, row.original.lastName, row.original.ref, row.original.phone, row.original.email]
    .join(' ')
    .toLowerCase();
  return String(value).toLowerCase().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
};

const NO_SHIRT = 'No shirt';

/** Sizes in the chart's order, as the Shirt Sizes panel lists them; others, then *No shirt*, after. */
function bySizeChart(a: string, b: string): number {
  const rank = (size: string) => {
    if (size === NO_SHIRT) return SHIRT_SIZES.length + 1;
    const at = SHIRT_SIZES.indexOf(size);
    return at === -1 ? SHIRT_SIZES.length : at;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
}

export default function RunnerList({
  rows,
  eventId,
  raceTitle,
}: {
  rows: ClientRunnerRow[];
  eventId: string;
  raceTitle: string;
}) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const columns = useMemo<ColumnDef<ClientRunnerRow>[]>(
    () => [
      selectionColumn<ClientRunnerRow>(),
      { id: 'name', accessorFn: row => `${row.firstName} ${row.lastName}` },
      ...FILTERS.map(({ id }) => ({
        id,
        accessorFn: (row: ClientRunnerRow) => (id === 'size' ? row.size || NO_SHIRT : row[id]),
        filterFn: oneOf,
      })),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: row => row.ref,
    state: { globalFilter, columnFilters, rowSelection },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    globalFilterFn: searchRunner,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  // ── Filters, built from the runners themselves ───────────────────────────
  const filterGroups: FilterGroup[] = FILTERS.map(({ id, label }) => {
    const column = table.getColumn(id);
    const selected = (column?.getFilterValue() as string[] | undefined) ?? [];
    const options = [...new Set(rows.map(row => String(column?.accessorFn?.(row, 0) ?? '')))]
      .filter(Boolean)
      .sort(id === 'size' ? bySizeChart : (a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return {
      label,
      options,
      selected,
      capitalize: false,
      onToggle: (value: string) => {
        const next = selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value];
        column?.setFilterValue(next.length ? next : undefined);
      },
    };
  });

  // ── Marking and the export ───────────────────────────────────────────────
  const selectedRows = table.getSelectedRowModel().rows;
  const markedCount = selectedRows.length;

  const exportCsv = () => {
    const out = markedCount > 0 ? selectedRows : table.getFilteredRowModel().rows;
    // Told to the activity trail first, fire and forget with keepalive, as the
    // staff export is: a log that failed must not cost the client the file.
    void fetch(`/api/admin/events/${eventId}/registrants/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: out.length, selected: markedCount > 0, list: 'client' }),
      keepalive: true,
    }).catch(() => {});
    downloadRunnerCsv(buildRunnerCsv(out.map(row => row.original)), raceTitle);
  };

  // The bulk bar keeps its last count while it slides away, as on the staff screen.
  const [barCount, setBarCount] = useState(0);
  if (markedCount > 0 && markedCount !== barCount) setBarCount(markedCount);

  const pageRows = table.getRowModel().rows;
  const filtered = Boolean(globalFilter) || columnFilters.length > 0;
  const empty =
    rows.length === 0 ? (
      <p className="m-0">No one has registered yet. Runners appear here once they pay or send a bank transfer.</p>
    ) : (
      <>
        <p className="m-0 text-primary font-medium">No runner matches.</p>
        <p className="m-0 mt-1">Check the spelling, or clear a filter.</p>
      </>
    );

  const selectHeader = table.getHeaderGroups()[0].headers.find(header => header.column.id === 'select');

  return (
    <div className="flex flex-col gap-4">
      <div className="admin-toolbar" style={{ padding: 0, borderBottom: 'none' }}>
        <div className="toolbar-actions" style={{ flex: 1 }}>
          <div className="search-wrapper">
            <Search className="search-icon" size={16} aria-hidden="true" />
            <input
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              className="search-input"
              placeholder="Search name, ref, phone or email..."
              aria-label="Search runners"
            />
            {globalFilter && (
              <button
                type="button"
                onClick={() => setGlobalFilter('')}
                aria-label="Clear search"
                className="absolute right-1 max-sm:right-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 max-sm:w-11 max-sm:h-11 text-[var(--text-muted)] hover:text-[var(--ink-85)] bg-transparent border-none cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <FiltersMenu
            groups={filterGroups}
            onClear={() => setColumnFilters([])}
            empty="Nothing to filter yet. Categories, sizes and provinces appear here as runners register."
          />
        </div>
        <div className="toolbar-actions flex items-center gap-2">
          {markedCount > 0 && (
            <button type="button" onClick={() => setRowSelection({})} className="btn-filter dash-desktop-only">
              <X size={16} aria-hidden="true" /> Unmark All
            </button>
          )}
          <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="btn-light disabled:opacity-50 disabled:cursor-not-allowed">
            <Download size={16} aria-hidden="true" />
            {markedCount > 0 ? `Export Marked (${markedCount})` : 'Export to CSV'}
          </button>
        </div>
      </div>

      {/* The table, from `lg` up. */}
      <div className="dash-desktop-only border border-[var(--dash-border)] rounded-lg overflow-hidden bg-transparent">
        <Table>
          <TableHeader className="bg-transparent">
            <TableRow className="border-b border-[var(--dash-border)] hover:bg-transparent">
              <TableHead className="py-4 pl-4 pr-0 h-auto w-10">
                {selectHeader && flexRender(selectHeader.column.columnDef.header, selectHeader.getContext())}
              </TableHead>
              <TableHead className="py-4 px-4 text-secondary font-medium h-auto whitespace-nowrap">Runner</TableHead>
              <TableHead className="py-4 px-4 text-secondary font-medium h-auto whitespace-nowrap">Category</TableHead>
              <TableHead className="py-4 px-4 text-secondary font-medium h-auto whitespace-nowrap">Size</TableHead>
              <TableHead className="py-4 px-4 text-secondary font-medium h-auto whitespace-nowrap">Status</TableHead>
              <TableHead className="py-4 px-4 text-secondary font-medium h-auto whitespace-nowrap">Race Kit</TableHead>
              <TableHead className="py-4 px-4 text-secondary font-medium h-auto whitespace-nowrap">Contact</TableHead>
              <TableHead className="py-4 px-4 text-secondary font-medium h-auto whitespace-nowrap w-[22%]">Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 px-4 text-center text-[var(--text-muted)]">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map(row => {
                const runner = row.original;
                const select = row.getVisibleCells().find(cell => cell.column.id === 'select');
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className={`border-b border-[var(--dash-hairline)] hover:bg-[var(--ink-05)] transition-colors ${row.getIsSelected() ? 'bg-[var(--ink-03)]' : ''}`}
                  >
                    <TableCell className="py-3 pl-4 pr-0 align-top">
                      {select && flexRender(select.column.columnDef.cell, select.getContext())}
                    </TableCell>
                    <TableCell className="py-3 px-4 align-top">
                      <span className="block font-medium text-primary [overflow-wrap:anywhere]">
                        {runner.firstName} {runner.lastName}
                      </span>
                      <span className="block text-xs text-secondary font-mono">{runner.ref}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4 align-top text-primary">{runner.category}</TableCell>
                    <TableCell className="py-3 px-4 align-top text-primary">{runner.size || <NoShirt />}</TableCell>
                    <TableCell className="py-3 px-4 align-top">
                      <StatusBadge status={runner.status} />
                    </TableCell>
                    <TableCell className="py-3 px-4 align-top text-primary">
                      <KitLine runner={runner} />
                    </TableCell>
                    <TableCell className="py-3 px-4 align-top text-sm">
                      <ContactLines runner={runner} />
                    </TableCell>
                    <TableCell className="py-3 px-4 align-top text-sm text-primary [overflow-wrap:anywhere]">
                      <AddressLine runner={runner} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* The same page as cards, below `lg`. */}
      <div className="dash-mobile-only">
        <AdminCardList
          items={pageRows.map(row => row.original)}
          getKey={runner => runner.ref}
          label="Runners"
          className="is-flush"
          selection={{
            isSelected: runner => table.getRow(runner.ref).getIsSelected(),
            toggle: runner => table.getRow(runner.ref).toggleSelected(),
            label: runner => `Mark ${runner.firstName} ${runner.lastName}`,
          }}
          selectAll={{
            checked: table.getIsAllPageRowsSelected(),
            toggle: () => table.toggleAllPageRowsSelected(!table.getIsAllPageRowsSelected()),
            label: `Mark all ${pageRows.length} on this page`,
          }}
          title={runner => `${runner.firstName} ${runner.lastName}`}
          subtitle={runner => <span className="font-mono">{runner.ref}</span>}
          badges={runner => <StatusBadge status={runner.status} />}
          fields={runner => [
            { label: 'Category', value: runner.category },
            { label: 'Shirt Size', value: runner.size || <NoShirt /> },
            { label: 'Race Kit', value: <KitLine runner={runner} />, full: true },
            { label: 'Contact', value: <ContactLines runner={runner} />, full: true },
            { label: runner.kit === 'Delivery' ? 'Ship To' : 'Home Address', value: <AddressLine runner={runner} labelled />, full: true },
          ]}
          empty={<div className="border border-[var(--dash-border)] rounded-lg py-10 px-4 text-center text-[var(--text-muted)]">{empty}</div>}
        />
      </div>

      {(pageRows.length > 0 || filtered) && <AdminTablePager table={table} />}

      {/* The bulk bar, below `lg`, while runners are marked (`.bulk-bar` in Admin.css). */}
      <div className="bulk-bar-spacer dash-mobile-only" hidden={markedCount === 0} aria-hidden="true" />
      <div className="dash-mobile-only">
        <div role="region" aria-label="Marked runners" className={`bulk-bar t-toast ${markedCount > 0 ? 'is-open' : ''}`}>
          <span className="bulk-bar-count" aria-live="polite">{barCount} marked</span>
          <button type="button" onClick={exportCsv} className="btn-filter bulk-bar-export">
            <Download size={16} aria-hidden="true" /> Export
          </button>
          <button type="button" onClick={() => setRowSelection({})} className="btn-filter bulk-bar-clear">
            <X size={16} aria-hidden="true" /> Clear
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ClientRunnerRow['status'] }) {
  return (
    <span className={`status-badge ${status === 'Paid' ? 'success' : 'pending'} whitespace-nowrap`}>{status}</span>
  );
}

/** A package with nothing to wear: no size is the answer, not a missing one. */
function NoShirt() {
  return <span className="text-secondary">{NO_SHIRT}</span>;
}

function KitLine({ runner }: { runner: ClientRunnerRow }) {
  return (
    <span className="flex flex-col">
      <span>{runner.kit}</span>
      {runner.deliveryArea && <span className="text-xs text-secondary">{runner.deliveryArea}</span>}
    </span>
  );
}

function ContactLines({ runner }: { runner: ClientRunnerRow }) {
  return (
    <span className="flex flex-col min-w-0">
      {runner.phone && (
        <a href={`tel:${runner.phone}`} className="text-primary hover:underline whitespace-nowrap">
          {runner.phone}
        </a>
      )}
      {runner.email && (
        <a href={`mailto:${runner.email}`} className="text-secondary hover:underline [overflow-wrap:break-word]">
          <EmailText email={runner.email} />
        </a>
      )}
    </span>
  );
}

/** An email that wraps at its `@` rather than mid-word, when it has to wrap at all. */
function EmailText({ email }: { email: string }) {
  const at = email.indexOf('@');
  if (at < 1) return <>{email}</>;
  return (
    <>
      {email.slice(0, at)}
      <wbr />
      {email.slice(at)}
    </>
  );
}

/**
 * Where the kit goes for a delivery, the home address for a pickup. `labelled`
 * when the card's field label already says which, so it is not said twice.
 */
function AddressLine({ runner, labelled = false }: { runner: ClientRunnerRow; labelled?: boolean }) {
  const address = runner.kit === 'Delivery' ? runner.deliveryAddress : runner.homeAddress;
  if (!address) return <span className="text-secondary">Not given</span>;
  return (
    <span className="flex flex-col">
      {runner.kit === 'Delivery' && !labelled && <span className="text-xs text-secondary">Ship to</span>}
      <span>{address}</span>
    </span>
  );
}
