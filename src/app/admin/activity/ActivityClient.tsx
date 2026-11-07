"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { History, Search, X } from 'lucide-react';
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type Updater,
} from '@tanstack/react-table';
import RunnerLoader from '@/components/ui/RunnerLoader';
import FiltersMenu, { type FilterGroup } from '../FiltersMenu';
import AdminTablePager from '../AdminTablePager';
import {
  ACTIVITY_GROUPS,
  ACTIVITY_PAGE_SIZES,
  ACTIVITY_PATH,
  ACTIVITY_RANGES,
  ACTIVITY_RANGE_LABELS,
  ACTION_GROUP,
  ACTION_LABELS,
  ACTOR_KIND_LABELS,
  activityQuery,
  formatTrailInstant,
  groupFilterValue,
  hasActiveFilters,
  trailDay,
  type ActivityFilterErrors,
  type ActivityFilters,
  type ActivityRange,
} from '@/lib/activity';
import type { ActivityPerson } from '@/lib/activity-store';
import type { AuditAction } from '@/lib/audit';
import AdminDatePicker from '../AdminDatePicker';
import ActivityTable from './ActivityTable';
import ActivityCards from './ActivityCards';
import { ActivityEmpty } from './activity-row-parts';

/**
 * The activity screen's filters and list.
 *
 * Every filter is the URL: changing one pushes a new address and the server
 * page answers with the matching page of the trail, inside a transition so the
 * list on screen dims rather than vanishing while the next one comes. A change
 * of filter starts a fresh reading (back to page 1, a new `asOf`); turning a
 * page keeps the reading pinned, so nothing moves under the person paging.
 *
 * It wears the admin's table furniture — `.admin-toolbar`, the shared table,
 * `AdminCardList` below `lg` and `AdminTablePager` — with two deliberate
 * differences from the other screens: no sortable headers, because a trail's
 * order is the one thing about it that must not change, and no select or
 * `No.` column, because nothing is done to entries in bulk and a position in
 * a newest-first log names nothing.
 *
 * **One trail wears it.** It also served the super admin's own trail, with the
 * Event filter and column dropped, until the two dashboards merged
 * (ADMIN_MERGE_PLAN.md, Batch 2); organizer decisions are now one more shelf
 * of Run As One's trail.
 */

export type ActivityRow = {
  id: string;
  at: string;
  actorKind: string;
  actorName: string;
  actorEmail: string | null;
  action: string;
  eventId: string | null;
  /** Null for an entry that belongs to no race, or to a race since deleted. */
  eventTitle: string | null;
  /** What the entry is about, for links such as a payment correction's proofs. */
  entityType: string | null;
  entityId: string | null;
  summary: string;
  changes: unknown;
  ip: string | null;
  userAgent: string | null;
};

type EventOption = { id: string; title: string; date: string };

/** Search waits this long after the last keystroke, so a name is one request, not six. */
const SEARCH_DELAY_MS = 450;

function eventDayHint(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export default function ActivityClient({
  rows,
  total,
  newer,
  filters,
  pinned,
  errors,
  people,
  events,
  now,
}: {
  rows: ActivityRow[];
  total: number;
  newer: number;
  /** As the server applied them, with `asOf` always set to the reading's instant. */
  filters: ActivityFilters;
  /** Whether the URL already pinned the reading, as against this load being "now". */
  pinned: boolean;
  errors: ActivityFilterErrors;
  people: ActivityPerson[];
  events: EventOption[];
  now: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  // ── Navigation ─────────────────────────────────────────────────────────────

  /**
   * A new address for the list. A filter change starts a fresh reading; paging
   * (`keepReading`) holds the pinned instant so nothing shifts.
   */
  const go = (patch: Partial<ActivityFilters>, keepReading = false) => {
    const next: ActivityFilters = {
      ...filters,
      ...(keepReading ? {} : { page: 1, asOf: null }),
      ...patch,
    };
    const query = activityQuery(next);
    setOpenId(null);
    startTransition(() => {
      router.push(query ? `${ACTIVITY_PATH}?${query}` : ACTIVITY_PATH, { scroll: false });
    });
  };

  // ── Search, debounced ──────────────────────────────────────────────────────
  const [search, setSearch] = useState(filters.q);
  const lastSent = useRef(filters.q);

  // The URL is the truth: a back button that changes `q` updates the box.
  useEffect(() => {
    setSearch(filters.q);
    lastSent.current = filters.q;
  }, [filters.q]);

  useEffect(() => {
    const term = search.trim();
    if (term === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = term;
      go({ q: term });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── A custom date range, checked before it is sent ─────────────────────────
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [dateError, setDateError] = useState<ActivityFilterErrors>({});

  useEffect(() => {
    setFrom(filters.from);
    setTo(filters.to);
    setDateError({});
  }, [filters.from, filters.to]);

  const shownErrors: ActivityFilterErrors = { ...errors, ...dateError };

  const setDates = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    // Refused here, under the box, before a request is spent on a range that
    // cannot contain anything (§8, rule 4). The server says the same thing.
    if (nextFrom && nextTo && nextFrom > nextTo) {
      setDateError({ to: 'The end date is before the start date. Pick a day on or after it.' });
      return;
    }
    setDateError({});
    go({ range: 'custom', from: nextFrom, to: nextTo });
  };

  // ── Filter options ─────────────────────────────────────────────────────────

  const personOptions = useMemo(
    () =>
      people.map(person => ({
        value: person.value,
        label: person.name,
        hint: person.email
          ? `${ACTOR_KIND_LABELS[person.kind] ?? person.kind} · ${person.email}`
          : ACTOR_KIND_LABELS[person.kind] ?? person.kind,
      })),
    [people],
  );

  const eventOptions = useMemo(
    () => events.map(event => ({ value: event.id, label: event.title, hint: eventDayHint(event.date) })),
    [events],
  );

  // The shelves first, then each verb with its shelf as small print, in shelf
  // order.
  const actionOptions = useMemo(() => {
    const shelves = ACTIVITY_GROUPS.map(group => group.key);
    return [
      ...ACTIVITY_GROUPS.map(group => ({ value: groupFilterValue(group.key), label: `All ${group.label.toLowerCase()}`, hint: group.hint })),
      ...(Object.keys(ACTION_LABELS) as AuditAction[])
        .sort((a, b) => shelves.indexOf(ACTION_GROUP[a]) - shelves.indexOf(ACTION_GROUP[b]))
        .map(action => ({
          value: action,
          label: ACTION_LABELS[action],
          hint: ACTIVITY_GROUPS.find(group => group.key === ACTION_GROUP[action])?.label,
        })),
    ];
  }, []);

  // "Any time" is what nothing checked means, so it is not offered as a box.
  const rangeOptions = ACTIVITY_RANGES
    .filter(range => range !== 'all')
    .map(range => ({ value: range, label: ACTIVITY_RANGE_LABELS[range] }));

  /** Checks or unchecks one value of a many-valued filter. */
  const toggleIn = (key: 'person' | 'event' | 'action') => (value: string) => {
    const current = filters[key];
    go({ [key]: current.includes(value) ? current.filter(v => v !== value) : [...current, value] });
  };

  // One range at a time: a reading has one window. Checking another moves it;
  // unchecking the one that is on goes back to any time. Choosing dates opens
  // the From / To boxes without filtering yet — the range applies once a day
  // is picked.
  const toggleRange = (value: string) => {
    const range = value as ActivityRange;
    if (range === filters.range) go({ range: 'all', from: '', to: '' });
    else if (range === 'custom') go({ range, from, to });
    else go({ range, from: '', to: '' });
  };

  const filterGroups: FilterGroup[] = [
    { label: 'Dates', options: rangeOptions, selected: filters.range === 'all' ? [] : [filters.range], onToggle: toggleRange },
    { label: 'Person', options: personOptions, selected: filters.person, onToggle: toggleIn('person') },
    { label: 'Event', options: eventOptions, selected: filters.event, onToggle: toggleIn('event') },
    { label: 'Activity', options: actionOptions, selected: filters.action, onToggle: toggleIn('action') },
  ];

  // ── The table instance, paged by the server ────────────────────────────────

  const columns = useMemo<ColumnDef<ActivityRow>[]>(() => [{ id: 'entry', accessorFn: row => row.id }], []);
  const pagination: PaginationState = { pageIndex: filters.page - 1, pageSize: filters.size };

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: row => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: total,
    state: { pagination },
    onPaginationChange: (updater: Updater<PaginationState>) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      if (next.pageSize !== pagination.pageSize) {
        // A new page size is the same reading, from its first row.
        go({ size: next.pageSize, page: 1 }, true);
      } else if (next.pageIndex !== pagination.pageIndex) {
        go({ page: next.pageIndex + 1 }, true);
      }
    },
  });

  const pageRows = table.getRowModel().rows.map(row => row.original);

  // Consecutive entries on one Manila day share a heading.
  const days = useMemo(() => {
    const groups: { day: string; rows: ActivityRow[] }[] = [];
    for (const row of pageRows) {
      const day = trailDay(row.at);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.rows.push(row);
      else groups.push({ day, rows: [row] });
    }
    return groups;
  }, [pageRows]);

  const filtered = hasActiveFilters(filters);

  const clearFilters = () => {
    setSearch('');
    lastSent.current = '';
    go({ person: [], event: [], action: [], range: 'all', from: '', to: '', q: '' });
  };

  const emptyMessage = <ActivityEmpty filtered={filtered} onClear={clearFilters} />;

  const toggle = (id: string) => setOpenId(current => (current === id ? null : id));

  return (
    <div className="flex flex-col gap-4 w-full text-primary">
      {/* Search and the Filters chip — Dates, Person, Event and Activity, each
          but Dates taking several at once. */}
      <div className="admin-toolbar" style={{ padding: '0 0 4px 0', borderBottom: 'none' }}>
        <div className="toolbar-actions" style={{ flex: 1 }}>
          <div className="search-wrapper">
            <Search className="search-icon" size={16} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="search-input"
              placeholder="Search by order reference, name or event..."
              aria-label="Search the activity trail"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--ink-85)] bg-transparent border-none cursor-pointer"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <FiltersMenu
            groups={filterGroups}
            onClear={() => go({ person: [], event: [], action: [], range: 'all', from: '', to: '' })}
          />
          {isPending && <RunnerLoader size="sm" tone="current" label="Loading activity" />}
        </div>
      </div>

      {/* Choosing dates in the Filters sheet opens the two boxes here, on the
          page: a date is typed or picked, which a sheet of checkboxes cannot
          hold, and the boxes stay in view while the reading changes. */}
      {filters.range === 'custom' && (
        <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-4 -mt-2">
          <AdminDatePicker
            id="activity-from"
            label="From"
            className="min-w-0"
            value={from}
            max={to || undefined}
            clearable
            dialogLabel="Choose the first day"
            onChange={next => setDates(next, to)}
            error={shownErrors.from}
          />
          <AdminDatePicker
            id="activity-to"
            label="To"
            className="min-w-0"
            value={to}
            min={from || undefined}
            clearable
            dialogLabel="Choose the last day"
            onChange={next => setDates(from, next)}
            error={shownErrors.to}
          />
        </div>
      )}

      {/* What this reading is, and what has happened since it began. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-secondary">
        <p className="m-0 flex items-center gap-2">
          <History size={16} aria-hidden="true" className="shrink-0" />
          <span>
            {pinned
              ? `Newest first, as of ${formatTrailInstant(filters.asOf ?? now)}.`
              : 'Newest first.'}
          </span>
        </p>
        {newer > 0 && (
          <button
            type="button"
            onClick={() => go({ page: 1, asOf: null }, true)}
            className="btn-filter is-primary max-lg:min-h-11"
          >
            {newer === 1 ? '1 newer entry' : `${newer} newer entries`} &middot; Show
          </button>
        )}
      </div>

      <div
        className={`flex flex-col gap-4 transition-opacity duration-200 ${isPending ? 'opacity-50' : ''}`}
        aria-busy={isPending}
      >
        {/* The table, from `lg` up. */}
        <ActivityTable days={days} now={now} openId={openId} toggle={toggle} emptyMessage={emptyMessage} />

        {/* The same page of entries as cards, below `lg`, under the same day headings. */}
        <ActivityCards days={days} now={now} openId={openId} toggle={toggle} emptyMessage={emptyMessage} />
      </div>

      <AdminTablePager table={table} pageSizes={ACTIVITY_PAGE_SIZES} />
    </div>
  );
}
