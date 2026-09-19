"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, History, RotateCcw, Search, X } from 'lucide-react';
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type Updater,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import RunnerLoader from '@/components/ui/RunnerLoader';
import FiltersMenu, { type FilterGroup } from '../FiltersMenu';
import AdminCardList from '../AdminCardList';
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
  actionGroupLabel,
  actionLabel,
  activityQuery,
  describeChanges,
  describeDevice,
  formatTrailDayHeading,
  formatTrailInstant,
  formatTrailTime,
  groupFilterValue,
  hasActiveFilters,
  isWarningAction,
  trailDay,
  type ActivityFilterErrors,
  type ActivityFilters,
  type ActivityRange,
} from '@/lib/activity';
import type { ActivityPerson } from '@/lib/activity-store';
import type { AuditAction } from '@/lib/audit';
import AdminDatePicker from '../AdminDatePicker';

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

// ── What a row shows, drawn once for the table and the card ────────────────

/**
 * Who did it. In the table's narrow column the address truncates with the
 * whole of it in a title, as the team table's does — an address broken
 * between two letters reads as a typo. A card has the width to show it whole.
 */
function ActorLine({ row, layout }: { row: ActivityRow; layout: 'table' | 'card' }) {
  const kind = ACTOR_KIND_LABELS[row.actorKind] ?? row.actorKind;
  const line = row.actorEmail ? `${kind} · ${row.actorEmail}` : kind;
  return (
    <span className="block min-w-0">
      <span className="block font-semibold text-primary [overflow-wrap:anywhere]">{row.actorName}</span>
      <span
        className={`block text-xs text-secondary ${layout === 'table' ? 'truncate' : '[overflow-wrap:anywhere]'}`}
        title={layout === 'table' ? line : undefined}
      >
        {line}
      </span>
    </span>
  );
}

/**
 * The entry's sentence, unless it only repeats the label ("Signed in" over
 * "Signed in."), where saying it twice adds a line and nothing else.
 */
function entrySentence(row: ActivityRow): string | null {
  const plain = (text: string) => text.trim().replace(/\.$/, '').toLowerCase();
  return plain(row.summary) === plain(actionLabel(row.action)) ? null : row.summary;
}

function EventLine({ row }: { row: ActivityRow }) {
  if (!row.eventId) return <span className="text-secondary">&mdash;</span>;
  if (!row.eventTitle) return <span className="text-secondary italic">Deleted event</span>;
  return <span className="[overflow-wrap:anywhere]">{row.eventTitle}</span>;
}

function ActionLabel({ row }: { row: ActivityRow }) {
  return isWarningAction(row.action) ? (
    <span className="status-badge danger">{actionLabel(row.action)}</span>
  ) : (
    <span className="font-medium text-primary">{actionLabel(row.action)}</span>
  );
}

/** Everything the one-line entry leaves out: the fields that moved, and where it came from. */
function EntryDetails({ row }: { row: ActivityRow }) {
  const lines = describeChanges(row.changes);
  const device = describeDevice(row.userAgent);
  const group = actionGroupLabel(row.action);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">What changed</p>
        {lines.length > 0 ? (
          <dl className="m-0 grid gap-2">
            {lines.map(line => (
              <div key={line.field} className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(8rem,12rem)_1fr]">
                <dt className="text-secondary">{line.field}</dt>
                <dd className={`m-0 min-w-0 [overflow-wrap:anywhere] ${line.redacted ? 'text-secondary italic' : 'text-primary'}`}>
                  {line.text}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="m-0 text-secondary">No field-level changes were recorded for this entry. The sentence above is the whole of it.</p>
        )}
      </div>

      <dl className="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-xs text-secondary">Recorded</dt>
          <dd className="m-0 text-primary">{formatTrailInstant(row.at, true)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-secondary">Kind</dt>
          <dd className="m-0 text-primary">{group ?? 'Other'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-secondary">IP address</dt>
          <dd className="m-0 font-mono text-primary [overflow-wrap:anywhere]">{row.ip ?? 'Not recorded'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-secondary">Device</dt>
          <dd className="m-0 text-primary" title={row.userAgent ?? undefined}>
            {device ?? 'Not recorded'}
          </dd>
        </div>
      </dl>
    </div>
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
  // Time, person, what happened, the event, details.
  const columnCount = 5;

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

  const emptyMessage = filtered ? (
    <>
      <p className="m-0 text-primary font-medium">Nothing in the trail matches these filters.</p>
      <p className="m-0 mt-1">Widen the dates or clear a filter to see more.</p>
      <button type="button" onClick={clearFilters} className="btn-filter mt-4 max-lg:min-h-11">
        <RotateCcw size={16} aria-hidden="true" /> Clear filters
      </button>
    </>
  ) : (
    <>
      <p className="m-0 text-primary font-medium">Nothing has been recorded yet.</p>
      <p className="m-0 mt-1">
        Every validated payment, edited runner, opened proof, organizer decision and sign-in will appear here under the name of the person who did it.
      </p>
    </>
  );

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
        <div className="dash-desktop-only border border-[var(--dash-border)] rounded-lg overflow-hidden bg-transparent">
          <Table>
            <TableHeader className="bg-transparent">
              <TableRow className="border-b border-[var(--dash-border)] hover:bg-transparent">
                <TableHead className="py-4 px-4 pl-8 text-secondary font-medium h-auto w-28">Time</TableHead>
                <TableHead className="py-4 px-4 text-secondary font-medium h-auto w-[16rem]">Person</TableHead>
                <TableHead className="py-4 px-4 text-secondary font-medium h-auto">What happened</TableHead>
                <TableHead className="py-4 px-4 text-secondary font-medium h-auto w-[14rem]">Event</TableHead>
                <TableHead className="py-4 px-4 text-secondary font-medium h-auto w-28">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columnCount} className="py-16 px-4 text-center text-[var(--text-muted)]">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                days.map(group => (
                  <React.Fragment key={group.day}>
                    <TableRow className="border-b border-[var(--dash-hairline)] hover:bg-transparent">
                      <TableCell
                        colSpan={columnCount}
                        className="py-2 px-4 pl-8 bg-[var(--ink-03)] text-xs font-semibold uppercase tracking-wider text-secondary"
                      >
                        {formatTrailDayHeading(group.day, now)}
                      </TableCell>
                    </TableRow>
                    {group.rows.map(row => {
                      const isOpen = openId === row.id;
                      return (
                        <React.Fragment key={row.id}>
                          <TableRow className={`border-b border-[var(--dash-hairline)] hover:bg-[var(--ink-05)] transition-colors ${isOpen ? 'bg-[var(--ink-03)]' : ''}`}>
                            <TableCell className="py-4 px-4 pl-8 align-top text-secondary whitespace-nowrap">
                              {formatTrailTime(row.at)}
                            </TableCell>
                            <TableCell className="py-4 px-4 align-top max-w-[16rem]">
                              <ActorLine row={row} layout="table" />
                            </TableCell>
                            <TableCell className="py-4 px-4 align-top">
                              <span className="flex flex-col gap-1 min-w-0">
                                <span><ActionLabel row={row} /></span>
                                {entrySentence(row) && (
                                  <span className="text-sm text-secondary [overflow-wrap:anywhere]">{entrySentence(row)}</span>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="py-4 px-4 align-top max-w-[14rem] text-primary">
                              <EventLine row={row} />
                            </TableCell>
                            {/* Under its own header, never pushed to the row's right edge (§8, rule 6). */}
                            <TableCell className="py-4 px-4 align-top">
                              <button
                                type="button"
                                onClick={() => toggle(row.id)}
                                aria-expanded={isOpen}
                                aria-label={`${isOpen ? 'Hide' : 'Show'} details: ${actionLabel(row.action)} by ${row.actorName}`}
                                className="icon-btn"
                              >
                                <ChevronDown
                                  size={16}
                                  aria-hidden="true"
                                  className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                />
                              </button>
                            </TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow className="border-b border-[var(--dash-hairline)] hover:bg-transparent">
                              <TableCell colSpan={columnCount} className="px-4 pl-8 py-4">
                                <div>
                                  <EntryDetails row={row} />
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* The same page of entries as cards, below `lg`, under the same day headings. */}
        <div className="dash-mobile-only">
          {days.length === 0 ? (
            <div className="border border-[var(--dash-border)] rounded-lg py-12 px-4 text-center text-[var(--text-muted)]">{emptyMessage}</div>
          ) : (
            <div className="flex flex-col gap-4">
              {days.map(group => (
                <section key={group.day} className="flex flex-col gap-3">
                  <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-secondary">
                    {formatTrailDayHeading(group.day, now)}
                  </h2>
                  <AdminCardList
                    items={group.rows}
                    getKey={row => row.id}
                    label={`Activity on ${formatTrailDayHeading(group.day, now)}`}
                    className="is-flush"
                    title={row => <ActionLabel row={row} />}
                    subtitle={row => {
                      const sentence = entrySentence(row);
                      return sentence ? <span className="[overflow-wrap:anywhere]">{sentence}</span> : null;
                    }}
                    fields={row => [
                      { label: 'Time', value: formatTrailTime(row.at) },
                      { label: 'Kind', value: actionGroupLabel(row.action) ?? 'Other' },
                      { label: 'Person', value: <ActorLine row={row} layout="card" />, full: true },
                      ...(row.eventId ? [{ label: 'Event', value: <EventLine row={row} />, full: true }] : []),
                    ]}
                    expanded={row => {
                      const isOpen = openId === row.id;
                      return (
                        // transitions.dev's accordion (21), as the feedback
                        // inbox's cards. No `id` or aria-controls: the table
                        // renders beside these cards.
                        <div className="t-acc" data-open={isOpen ? 'true' : 'false'}>
                          <button
                            type="button"
                            onClick={() => toggle(row.id)}
                            aria-expanded={isOpen}
                            className="t-acc-head btn-filter w-full justify-between min-h-11"
                          >
                            <span>{isOpen ? 'Hide details' : 'Show details'}</span>
                            <span className="t-acc-chevron" aria-hidden="true">
                              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 6.5L8 10.5L12 6.5" />
                              </svg>
                            </span>
                          </button>
                          <div className="t-acc-panel" inert={!isOpen}>
                            <div className="t-acc-panel-inner">
                              <div className="pt-3">
                                <EntryDetails row={row} />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <AdminTablePager table={table} pageSizes={ACTIVITY_PAGE_SIZES} />
    </div>
  );
}
