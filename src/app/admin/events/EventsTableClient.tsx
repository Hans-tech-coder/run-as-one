"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search, X, Columns, Plus, ChevronUp, ChevronDown, Check, AlertCircle, Users, Filter
} from 'lucide-react';
import FilterOptions from '../FilterOptions';
import LinkPending from '@/components/ui/LinkPending';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import EventActionsMenu from './EventActionsMenu';
import AdminCardList from '../AdminCardList';
import AdminTablePager from '../AdminTablePager';
import MobileSortMenu from '../MobileSortMenu';
import RegistrationScheduleModal from './RegistrationScheduleModal';
import { openingInstantISO, type OpeningDraft } from './registration-opening';
import { formatEventInstant } from '@/lib/event-schedule';
import { REGISTRATION_STATES } from './registration-state-badge';
import { useAlert } from '@/components/ui/AlertProvider';
import BusyLabel from '@/components/ui/BusyLabel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  SortingState,
  VisibilityState,
  Row,
} from '@tanstack/react-table';

type CategoryChip = { id: string; name: string; distance?: string | null };

/**
 * One row as /admin/events hands it over: the Prisma event plus the counts and
 * the registration state worked out on the server. Only the pieces this table
 * reads are named; the page passes the whole event, and the rest rides along.
 */
type EventRow = {
  id: string;
  /** Its place in the list's order, fixed on the server (events/page.tsx), so filtering never renumbers. */
  listNo?: number;
  /** Runners holding a place: paid, and pending a payment or its validation. */
  registered?: { paid: number; pending: number };
  client?: { id: string; name: string } | null;
  title: string;
  date: string;
  location: string;
  categories?: CategoryChip[];
  registrationState?: 'OPEN' | 'FINISHED' | 'PAUSED' | 'SCHEDULED' | 'FULL';
  registrationOpensAt?: string | Date | null;
  registrationPaused?: boolean | null;
  /** What this person may do from the row's menu (events/page.tsx). Absent means an owner. */
  access?: { edit: boolean; delete: boolean };
  _count?: { registrations: number };
};

interface EventsTableClientProps {
  events: EventRow[];
  /** Whether this person's role includes `event:create` — Create Event is not offered otherwise. */
  canCreate?: boolean;
  /** Whether this person holds `platform:manage` — clients are Run As One's records, so only they filter by one. */
  canFilterByClient?: boolean;
}

/** The Filters sheet's value for a race not linked to any client yet. */
const NO_CLIENT = '__none__';

/**
 * The Registrants cell: how many runners hold a place, and — on hover, focus,
 * or a tap on a phone, which has no hover — how many of them have paid and how
 * many are still pending. The split is behind a tooltip rather than in the
 * cell because the total is what a row is scanned for; the split is the
 * follow-up question.
 */
function RegisteredCount({ event, alignEnd = false }: { event: EventRow; /** Open the tip leftwards, for a count at the right of a card. */ alignEnd?: boolean }) {
  const { paid, pending } = event.registered ?? { paid: 0, pending: 0 };
  const total = paid + pending;
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [isOpen]);

  return (
    <span ref={ref} className={`reg-count ${alignEnd ? 'is-end' : ''} ${isOpen ? 'is-open' : ''}`}>
      <button
        type="button"
        className="reg-count-trigger"
        onClick={() => setIsOpen(open => !open)}
        onKeyDown={e => { if (e.key === 'Escape') setIsOpen(false); }}
        aria-expanded={isOpen}
        aria-label={`${total} registered for ${event.title}: ${paid} paid, ${pending} pending`}
      >
        <Users size={14} aria-hidden="true" />
        <span className="tabular-nums">{total}</span>
      </button>
      <span className="reg-count-tip" aria-hidden="true">
        <span className="reg-count-tip-row">
          <span className="reg-count-dot is-paid" />Paid / Validated<b>{paid}</b>
        </span>
        <span className="reg-count-tip-row">
          <span className="reg-count-dot is-pending" />Pending<b>{pending}</b>
        </span>
      </span>
    </span>
  );
}

/**
 * A row's place in the sorted list, for the No. column and the card beside it.
 * Counted by id rather than object identity, for the reason PROJECT_GUIDE §9
 * gives: sorting rebuilds the rows, and an `indexOf` on them finds nothing.
 */
function rowPosition<T>(sortedRows: Row<T>[], row: Row<T>) {
  return sortedRows.findIndex(sorted => sorted.id === row.id) + 1;
}

/**
 * The Registration column's badge and the line under it. Drawn once for the
 * table cell and the card's badge row, so the two cannot say different things.
 */
function RegistrationStatus({ event }: { event: EventRow }) {
  const key = (event.registrationState ?? 'OPEN') as keyof typeof REGISTRATION_STATES;
  const state = REGISTRATION_STATES[key];
  return (
    <div>
      <span className={`status-badge ${state.tone} whitespace-nowrap`}>{state.label}</span>
      {/* The date the badge is standing in for. A quiet line rather than
          a second pill: two pills in one cell read as two states, and
          this event has only one. */}
      {key === 'SCHEDULED' && event.registrationOpensAt && (
        <span className="status-note neutral whitespace-nowrap">
          Opens {formatEventInstant(event.registrationOpensAt)}
        </span>
      )}
    </div>
  );
}

/**
 * An event's options on its card. The table has room only for a count; a card
 * has room to name them, which is what an organizer scanning their races on a
 * phone is looking for. A race option keeps its distance beside its name,
 * unless the name already says it ("10K" beside "10K" is noise, not detail).
 */
function CategoryChips({ categories }: { categories?: CategoryChip[] }) {
  if (!categories?.length) return <span className="text-secondary">No categories</span>;
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
      {categories.map(category => {
        const distance = category.distance?.trim();
        const showDistance = Boolean(distance) && !category.name.toUpperCase().includes(distance!.toUpperCase());
        return (
          <li
            key={category.id}
            className="max-w-full truncate whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white"
          >
            {category.name}
            {showDistance && <span className="text-secondary">{` · ${distance}`}</span>}
          </li>
        );
      })}
    </ul>
  );
}

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
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const filtersRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();

  // Which event's pause toggle is mid-flight, so its menu item can say so and
  // refuse a second press. One id rather than a boolean: the menu is per row.
  const [pausingId, setPausingId] = useState<string | null>(null);

  // Which event's opening is being set, and the modal's own open/closing
  // animation flags — the same three-piece shape the delete modal below uses,
  // so both fade in and out the same way.
  const [schedulingEvent, setSchedulingEvent] = useState<EventRow | null>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isScheduleClosing, setIsScheduleClosing] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);

  // Delete Modal State
  const [deletingEvent, setDeletingEvent] = useState<EventRow | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleteClosing, setIsDeleteClosing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (viewRef.current && !viewRef.current.contains(event.target as Node)) {
        setIsViewOpen(false);
      }
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setIsFiltersOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const closeScheduleModal = () => {
    setIsScheduleOpen(false);
    setIsScheduleClosing(true);
    setTimeout(() => {
      setIsScheduleClosing(false);
      setSchedulingEvent(null);
    }, 150);
  };

  /**
   * Saves when this event starts taking sign-ups.
   *
   * A PATCH carrying only the opening, for the same reason the pause toggle
   * sends only the hold: this table never rendered the rest of the event, and
   * posting fields it does not hold is how they get silently overwritten.
   *
   * The route also lifts a manual hold when it is sent an opening on its own,
   * so the row has to drop its PAUSED badge here too — a table still saying
   * "Paused" about an event whose sign-ups just opened is worse than no badge.
   */
  const handleScheduleSave = async (draft: OpeningDraft) => {
    if (!schedulingEvent) return;
    const registrationOpensAt = openingInstantISO(draft);
    const scheduled = registrationOpensAt !== null;
    setIsScheduling(true);
    try {
      const res = await fetch(`/api/admin/events/${schedulingEvent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationOpensAt }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `The server rejected the request (HTTP ${res.status}).`);
      }

      const saved = await res.json();

      setTableEvents(prev =>
        prev.map((row): EventRow =>
          row.id === schedulingEvent.id
            ? {
                ...row,
                registrationOpensAt: saved.registrationOpensAt ?? null,
                registrationPaused: false,
                // An opening still ahead is what the row now says. Clearing one
                // hands the row back to whatever was true underneath, and the
                // only thing this table can rule out is the two states it just
                // replaced — a row that was FULL stays FULL.
                registrationState: scheduled
                  ? 'SCHEDULED'
                  : row.registrationState === 'SCHEDULED' || row.registrationState === 'PAUSED'
                    ? 'OPEN'
                    : row.registrationState,
              }
            : row,
        ),
      );

      closeScheduleModal();
      // The public pages read this on the server, so the change only reaches
      // them on the next request — which is what this refresh causes.
      router.refresh();
    } catch (error) {
      await alert({
        title: 'Registration opening not saved',
        message: `${schedulingEvent.title} is unchanged. ${
          error instanceof Error ? error.message : 'The request did not reach the server.'
        }`,
      });
    } finally {
      setIsScheduling(false);
    }
  };

  const closeDeleteModal = () => {
    setIsDeleteOpen(false);
    setIsDeleteClosing(true);
    setTimeout(() => {
      setIsDeleteClosing(false);
      setDeletingEvent(null);
    }, 150);
  };

  /**
   * Flips the organizer's manual hold on sign-ups.
   *
   * A PATCH rather than a re-save of the whole event: this table does not hold
   * the other fields, and posting a form it never rendered would be the way to
   * silently overwrite them. The row updates from the server's answer rather
   * than optimistically — a hold that looks on but is not would be the worst of
   * the three possible outcomes.
   */
  const handleTogglePause = async (event: EventRow) => {
    const nextPaused = event.registrationState !== 'PAUSED';
    setPausingId(event.id);
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationPaused: nextPaused }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `The server rejected the request (HTTP ${res.status}).`);
      }

      setTableEvents(prev =>
        prev.map((row): EventRow =>
          row.id === event.id
            ? {
                ...row,
                registrationPaused: nextPaused,
                // Resuming hands the row back to whatever the counts say, and a
                // resumed event whose options are all full is FULL, not open.
                registrationState: nextPaused
                  ? 'PAUSED'
                  : row.registrationState === 'PAUSED'
                    ? 'OPEN'
                    : row.registrationState,
              }
            : row,
        ),
      );

      // The public pages read this on the server, so the change only reaches
      // them on the next request — which is what this refresh causes.
      router.refresh();
    } catch (error) {
      await alert({
        title: nextPaused ? 'Registration not paused' : 'Registration not resumed',
        message: `${event.title} is unchanged. ${
          error instanceof Error ? error.message : 'The request did not reach the server.'
        }`,
      });
    } finally {
      setPausingId(null);
    }
  };

  const handleEventDeleteConfirm = async () => {
    if (!deletingEvent) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/events/${deletingEvent.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        // The route answers with a reason; show that rather than a blank
        // failure, so the organizer knows whether to retry or to fix something.
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `The server rejected the request (HTTP ${res.status}).`);
      }

      setTableEvents(tableEvents.filter(e => e.id !== deletingEvent.id));
      closeDeleteModal();
    } catch (error) {
      console.error(error);
      // The confirmation modal stays open underneath: the event is still
      // there, and the organizer can read the reason and try again.
      await alert({
        title: 'Event not deleted',
        message: `${deletingEvent.title} is still here. ${
          error instanceof Error ? error.message : 'The request did not reach the server.'
        }`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

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
        onTogglePause={
          (event.access?.edit ?? true)
            ? () => handleTogglePause(event)
            : undefined
        }
        onSchedule={
          (event.access?.edit ?? true)
            ? () => {
                setSchedulingEvent(event);
                requestAnimationFrame(() => setIsScheduleOpen(true));
              }
            : undefined
        }
        onDelete={
          (event.access?.delete ?? true)
            ? () => {
                setDeletingEvent(event);
                requestAnimationFrame(() => setIsDeleteOpen(true));
              }
            : undefined
        }
      />
    </div>
  );

  const columns = useMemo<ColumnDef<EventRow>[]>(() => [
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
                className="appearance-none w-4 h-4 rounded border border-white/20 bg-transparent checked:bg-white checked:border-white cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
              />
              {isChecked && <Check className="absolute text-black pointer-events-none" size={12} strokeWidth={3} />}
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
                className="appearance-none w-4 h-4 rounded border border-white/20 bg-transparent checked:bg-white checked:border-white cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
              />
              {isChecked && <Check className="absolute text-black pointer-events-none" size={12} strokeWidth={3} />}
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
        <span className="text-gray-400 font-mono">{row.original.listNo ?? rowPosition(table.getSortedRowModel().flatRows, row)}</span>
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
      accessorFn: (row) => (row.registered?.paid ?? 0) + (row.registered?.pending ?? 0),
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
    // renderActions is rebuilt every render; pausingId is the one thing it
    // reads that changes what a cell shows, as before it was pulled out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [pausingId]);

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
  const activeFilterCount = (canFilterByClient ? selectedClients.length : 0) + selectedStates.length;
  const filterGroups = [
    ...(canFilterByClient
      ? [{ label: 'Client', options: clientOptions, selected: selectedClients, toggle: toggleIn(setSelectedClients) }]
      : []),
    { label: 'Registration Status', options: stateOptions, selected: selectedStates, toggle: toggleIn(setSelectedStates) },
  ];
  const clearFilters = () => {
    setSelectedClients([]);
    setSelectedStates([]);
    table.setPageIndex(0);
  };
  const emptyMessage = tableEvents.length > 0
    ? 'No events match your search or filters.'
    : 'No events found. Create one to get started.';

  // How many orders go with the event being deleted, which the confirm names.
  const deletingRegistrations = deletingEvent?._count?.registrations ?? 0;

  return (
    <div className="flex flex-col gap-4 w-full text-white">
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
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-300 bg-transparent border-none cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          {/* The one Filters chip, at every width: its sheet holds Client (for
              platform:manage) and Registration Status — the same popover the
              registrants screen's Filters chip opens on a phone. */}
          <div ref={filtersRef} className="relative view-dropdown-container">
            <button
              type="button"
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              className="btn-filter"
              aria-haspopup="true"
              aria-expanded={isFiltersOpen}
            >
              <Filter size={16} aria-hidden="true" /> Filters
              {activeFilterCount > 0 && <span className="ml-1 px-1 bg-white/10 rounded">{activeFilterCount}</span>}
            </button>
            {isFiltersOpen && (
              <div
                role="group"
                aria-label="Filter the list"
                className="toolbar-popover absolute left-0 mt-2 w-72 bg-[#050505] border border-white/10 rounded-md p-2 z-50 shadow-2xl"
              >
                {filterGroups.map(group => group.options.length > 0 && (
                  <div key={group.label} role="menu" aria-label={group.label} className="pb-1">
                    <p className="m-0 px-2 pt-1 pb-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                      {group.label}
                    </p>
                    <FilterOptions
                      options={group.options}
                      selected={group.selected}
                      onToggle={group.toggle}
                      capitalize={false}
                    />
                  </div>
                ))}
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-1 w-full flex items-center px-2 py-1.5 rounded-md text-sm text-gray-400 bg-transparent border-0 border-t border-white/5 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

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
              <div className="toolbar-popover absolute right-0 mt-2 bg-[#050505] border border-white/10 rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
                {table.getAllLeafColumns().filter(col => col.getCanHide()).map(column => {
                  return (
                    <label key={column.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 cursor-pointer rounded-md text-sm text-white">
                      <div className={`w-4 h-4 border border-white/10 rounded-sm flex items-center justify-center ${column.getIsVisible() ? 'bg-white/10' : ''}`}>
                        <input
                          type="checkbox"
                          checked={column.getIsVisible()}
                          onChange={column.getToggleVisibilityHandler()}
                          className="opacity-0 absolute w-0 h-0"
                        />
                        {column.getIsVisible() && <div className="w-2 h-2 bg-white rounded-sm" />}
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
      <div className="dash-desktop-only border border-white/10 rounded-lg overflow-hidden bg-transparent">
        <Table>
          <TableHeader className="bg-transparent">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className="border-b border-white/10 hover:bg-transparent">
                {headerGroup.headers.map(header => (
                  <TableHead 
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`py-4 px-4 text-gray-400 font-medium h-auto ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''} ${header.column.id === 'title' ? 'pl-8' : ''}`}
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
                <TableRow key={row.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className={`py-4 px-4 text-white ${cell.column.id === 'title' ? 'pl-8' : ''}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-16 text-center text-gray-500">
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
            <div className="border border-white/10 rounded-lg py-16 px-4 text-center text-gray-500">
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
        key={`${schedulingEvent?.id ?? 'none'}-${schedulingEvent?.registrationOpensAt ?? ''}`}
        event={schedulingEvent}
        isOpen={isScheduleOpen}
        isClosing={isScheduleClosing}
        isSaving={isScheduling}
        onClose={closeScheduleModal}
        onSave={handleScheduleSave}
      />

      {/* Delete Confirmation Modal */}
      <div 
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isDeleteOpen && !isDeleteClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-event-title"
          className={`t-modal admin-modal-panel w-full max-w-md bg-[#111] border border-red-500/20 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 ${isDeleteOpen ? 'is-open' : ''} ${isDeleteClosing ? 'is-closing' : ''}`}
        >
          <div className="admin-modal-body flex flex-col gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-500/10 rounded-full text-red-500 shrink-0 mt-1">
                <AlertCircle size={24} strokeWidth={2} />
              </div>
              <div className="flex flex-col gap-2 min-w-0">
                <h3 id="delete-event-title" className="text-xl font-semibold text-white">Delete Event</h3>
                <p className="text-gray-400 text-sm leading-relaxed [overflow-wrap:anywhere]">
                  Are you sure you want to delete <span className="font-semibold text-white">{deletingEvent?.title}</span>? This action cannot be undone and will permanently remove the event from the database.
                </p>
              </div>
            </div>

            {deletingRegistrations > 0 && (
              <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-500">
                <AlertCircle size={20} className="shrink-0" />
                <p className="text-sm">
                  This event has {deletingRegistrations} registration{deletingRegistrations === 1 ? '' : 's'}. Deleting it also erases those registrations, their runners, and any uploaded race results.
                </p>
              </div>
            )}
          </div>

          <div className="admin-modal-footer flex justify-end gap-3 pt-2 border-t border-white/5">
            <button 
              type="button" 
              onClick={closeDeleteModal} 
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              type="button" 
              onClick={handleEventDeleteConfirm}
              disabled={isDeleting}
              className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {isDeleting ? <BusyLabel>Deleting</BusyLabel> : 'Delete Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
