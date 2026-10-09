"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search, X, Columns, Plus, ChevronUp, ChevronDown, Users
} from 'lucide-react';
import FiltersMenu, { type FilterGroup } from '../FiltersMenu';
import LinkPending from '@/components/ui/LinkPending';
import Link from 'next/link';
import EventActionsMenu from './EventActionsMenu';
import AdminCardList from '../AdminCardList';
import AdminTablePager from '../AdminTablePager';
import MobileSortMenu from '../MobileSortMenu';
import RegistrationScheduleModal from './RegistrationScheduleModal';
import DeleteEventModal from './DeleteEventModal';
import { REGISTRATION_STATES } from './registration-state-badge';
import { CategoryChips, RegisteredCount, RegistrationStatus, rowPosition } from './EventRowCells';
import { eventColumns } from './event-columns';
import { useEventRowActions } from './useEventRowActions';
import type { EventRow } from './event-row';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';

/**
 * The /admin/events list: a table from `lg` up, cards below it, both drawn
 * from one TanStack table instance. The row's cells live in EventRowCells, the
 * columns in event-columns, and what the row menu does in useEventRowActions.
 */

interface EventsTableClientProps {
  events: EventRow[];
  /** Whether this person's role includes `event:create` — Create Event is not offered otherwise. */
  canCreate?: boolean;
  /** Whether this person holds `platform:manage` — clients are Run As One's records, so only they filter by one. */
  canFilterByClient?: boolean;
}

/** The Filters sheet's value for a race not linked to any client yet. */
const NO_CLIENT = '__none__';

export default function EventsTableClient({ events, canCreate = true, canFilterByClient = false }: EventsTableClientProps) {
  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [tableEvents, setTableEvents] = useState(events);

  // The one Filters chip and its sheet: by client and by registration state.
  // Applied to the data before the table, like the registrants screen's
  // backlog view, so search, sort and the pager all work inside the result.
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);

  const actions = useEventRowActions(setTableEvents);
  const { pausingId } = actions;

  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (viewRef.current && !viewRef.current.contains(event.target as Node)) {
        setIsViewOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /**
   * A row's menu, for the table's Actions cell and the card's footer alike, so
   * what each row offers stays permission-driven in one place.
   */
  const renderActions = (event: EventRow, className = '') => (
    <div className={`action-dropdown-container flex ${className}`}>
      <EventActionsMenu
        eventId={event.id}
        label={event.title}
        registrationState={event.registrationState ?? 'OPEN'}
        isPausing={pausingId === event.id}
        // Decided on the server with the same can() each route asks
        // (events/page.tsx). A row without `access` is an owner's.
        canEdit={event.access?.edit ?? true}
        canManagePacers={event.access?.pacers ?? true}
        pacersNotSent={event.pacersNotSent ?? 0}
        onTogglePause={
          (event.access?.edit ?? true)
            ? () => actions.togglePause(event)
            : undefined
        }
        onToggleClose={
          (event.access?.edit ?? true)
            ? () => actions.toggleClose(event)
            : undefined
        }
        onSchedule={
          (event.access?.edit ?? true)
            ? () => actions.openSchedule(event)
            : undefined
        }
        onDelete={
          (event.access?.delete ?? true)
            ? () => actions.openDelete(event)
            : undefined
        }
      />
    </div>
  );

  // renderActions is rebuilt every render; pausingId is the one thing it
  // reads that changes what a cell shows, as before it was pulled out.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => eventColumns(event => renderActions(event)), [pausingId]);

  const filteredEvents = useMemo(
    () =>
      tableEvents.filter(
        event =>
          (selectedClients.length === 0 || selectedClients.includes(event.client?.id ?? NO_CLIENT)) &&
          (selectedStates.length === 0 || selectedStates.includes(event.registrationState ?? 'OPEN')),
      ),
    [tableEvents, selectedClients, selectedStates],
  );

  const table = useReactTable({
    data: filteredEvents,
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
      rowSelection,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // The sheet's lists. Clients come from the races on the list, so a client
  // with no race is not offered as a filter that can only come back empty.
  const clientOptions = useMemo(() => {
    const byId = new Map<string, string>();
    let unlinked = false;
    for (const event of tableEvents) {
      if (event.client) byId.set(event.client.id, event.client.name);
      else unlinked = true;
    }
    const options = [...byId]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return unlinked ? [...options, { value: NO_CLIENT, label: 'No client yet' }] : options;
  }, [tableEvents]);
  const stateOptions = (Object.keys(REGISTRATION_STATES) as (keyof typeof REGISTRATION_STATES)[])
    .map(key => ({ value: key, label: REGISTRATION_STATES[key].label }));

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) => {
    setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));
    table.setPageIndex(0);
  };
  const filterGroups: FilterGroup[] = [
    ...(canFilterByClient
      ? [{ label: 'Client', options: clientOptions, selected: selectedClients, onToggle: toggleIn(setSelectedClients) }]
      : []),
    { label: 'Registration Status', options: stateOptions, selected: selectedStates, onToggle: toggleIn(setSelectedStates) },
  ];
  const clearFilters = () => {
    setSelectedClients([]);
    setSelectedStates([]);
    table.setPageIndex(0);
  };
  const emptyMessage = tableEvents.length > 0
    ? 'No events match your search or filters.'
    : 'No events found. Create one to get started.';

  return (
    <div className="flex flex-col gap-4 w-full text-primary">
      {/* Top Toolbar */}
      <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
        <div className="toolbar-actions" style={{ flex: 1 }}>
          <div className="search-wrapper">
            <Search className="search-icon" size={16} />
            <input
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              className="search-input"
              placeholder="Search events by name or location..."
            />
            {globalFilter && (
              <button 
                onClick={() => setGlobalFilter('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--ink-85)] bg-transparent border-none cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          {/* The one Filters chip, at every width: Client (for
              platform:manage) and Registration Status. */}
          <FiltersMenu groups={filterGroups} onClear={clearFilters} />

          {/* Which columns the table shows. Cards have no columns to hide, so
              below `lg` the chip goes and Sort (which the headers did) comes. */}
          <div ref={viewRef} className="relative view-dropdown-container dash-desktop-only">
            <button
              onClick={() => setIsViewOpen(!isViewOpen)}
              className="btn-filter"
            >
              <Columns size={16} /> View
            </button>
            {isViewOpen && (
              <div className="toolbar-popover absolute right-0 mt-2 bg-[var(--dash-popover)] border border-[var(--dash-border)] rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
                {table.getAllLeafColumns().filter(col => col.getCanHide()).map(column => {
                  return (
                    <label key={column.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--ink-05)] cursor-pointer rounded-md text-sm text-primary">
                      <div className={`w-4 h-4 border border-[var(--dash-border)] rounded-sm flex items-center justify-center ${column.getIsVisible() ? 'bg-[var(--ink-10)]' : ''}`}>
                        <input
                          type="checkbox"
                          checked={column.getIsVisible()}
                          onChange={column.getToggleVisibilityHandler()}
                          className="opacity-0 absolute w-0 h-0"
                        />
                        {column.getIsVisible() && <div className="w-2 h-2 bg-[var(--ink)] rounded-sm" />}
                      </div>
                      <span className="capitalize">{column.id === 'title' ? 'Event Name' : column.id === 'registered' ? 'Registrants' : column.id}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <MobileSortMenu table={table} />
        </div>

        {/* Only for a role that holds event:create — a staff member works on
            the races they were given and never starts one. */}
        {canCreate && (
          <div className="toolbar-actions">
            <Link
              href="/admin/events/new"
              className="btn-light"
            >
              <Plus size={16} /> Create Event
            </Link>
          </div>
        )}
      </div>

      {/* Table Area — from `lg` up; the cards below take its place under it. */}
      <div className="dash-desktop-only border border-[var(--dash-border)] rounded-lg overflow-hidden bg-transparent">
        <Table>
          <TableHeader className="bg-transparent">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className="border-b border-[var(--dash-border)] hover:bg-transparent">
                {headerGroup.headers.map(header => (
                  <TableHead 
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`py-4 px-4 text-secondary font-medium h-auto ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''} ${header.column.id === 'title' ? 'pl-8' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
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
                    <TableCell key={cell.id} className={`py-4 px-4 text-primary ${cell.column.id === 'title' ? 'pl-8' : ''}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-16 text-center text-[var(--text-muted)]">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* The same rows as the table above — search, sort, selection and the
          page all come from the one table instance (AdminCardList). */}
      <div className="dash-mobile-only">
        <AdminCardList
          items={table.getRowModel().rows}
          getKey={row => row.id}
          label="Events"
          className="is-flush"
          selection={{
            isSelected: row => row.getIsSelected(),
            toggle: row => row.toggleSelected(),
            label: row => `Select ${row.original.title}`,
          }}
          leading={row => (
            <span className="font-mono">{row.original.listNo ?? rowPosition(table.getSortedRowModel().flatRows, row)}</span>
          )}
          title={row => <span className="line-clamp-2">{row.original.title}</span>}
          badges={row => <RegistrationStatus event={row.original} />}
          fields={row => [
            { label: 'Date', value: row.original.date },
            { label: 'Registrants', value: <RegisteredCount event={row.original} alignEnd /> },
            { label: 'Location', value: row.original.location, full: true },
            { label: 'Categories', value: <CategoryChips categories={row.original.categories} />, full: true },
          ]}
          // Registrants one tap away, because on race day it is where an
          // organizer goes from this list again and again. It stays in the
          // menu too, so the menu matches the table's. A quiet chip, not
          // .btn-light: one light pill per card would shout down the list.
          actions={row => (
            <>
              <Link
                href={`/admin/events/${row.original.id}/registrants`}
                className="btn-filter no-underline"
                aria-label={`Registrants for ${row.original.title}`}
              >
                <Users size={16} aria-hidden="true" />
                Registrants
                <LinkPending />
              </Link>
              {renderActions(row.original, 'ml-auto')}
            </>
          )}
          empty={
            <div className="border border-[var(--dash-border)] rounded-lg py-16 px-4 text-center text-[var(--text-muted)]">
              {emptyMessage}
            </div>
          }
        />
      </div>

      <AdminTablePager table={table} />


      {/* Keyed by the row and by the value it is editing, so the modal starts
          from what this event actually holds — including the second time it is
          opened on a row whose opening was just changed. */}
      <RegistrationScheduleModal
        key={`${actions.schedule.event?.id ?? 'none'}-${actions.schedule.event?.registrationOpensAt ?? ''}`}
        event={actions.schedule.event}
        isOpen={actions.schedule.isOpen}
        isClosing={actions.schedule.isClosing}
        isSaving={actions.schedule.isSaving}
        onClose={actions.schedule.close}
        onSave={actions.schedule.save}
      />

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
