"use client";

import React, { useMemo, useState } from 'react';
import { Eye, Search, X } from 'lucide-react';
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { type FeedbackRow, receivedOn } from './MessageDetail';
import MessageModal from './MessageModal';
import FeedbackMetrics from './FeedbackMetrics';
import FeedbackMenu from './FeedbackMenu';
import {
  COLUMNS,
  FeedbackKindLabel,
  FeedbackSender,
  FeedbackStatus as FeedbackStatusBadge,
  STATUS_MOVES,
  type FeedbackTableMeta,
} from './feedbackColumns';
import { useAlert } from '@/components/ui/AlertProvider';
import AdminCardList, { AdminCardListSkeleton } from '@/app/admin/AdminCardList';
import AdminDataTable, { AdminColumnsMenu } from '@/app/admin/AdminDataTable';
import AdminTablePager from '@/app/admin/AdminTablePager';
import FiltersMenu from '@/app/admin/FiltersMenu';
import MobileSortMenu from '@/app/admin/MobileSortMenu';
import {
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_COPY,
  asFeedbackKind,
  feedbackKindLabel,
  feedbackStatusOf,
  type FeedbackStatus,
} from '@/lib/feedback';
import DashboardHeader from '@/app/admin/DashboardHeader';

/**
 * What people have told us about the app itself.
 *
 * This is the reading end of the public form at /feedback. It is Run As
 * One's own screen (`platform:manage`) and not a per-event one, for the same
 * reason the running-club list is: feedback is about the platform rather than
 * about any one race, and it carries strangers' email addresses.
 *
 * The list wears the events table's furniture (`AdminDataTable`, §9): sortable
 * headers, the View chip and the pager. What a cell needs to know about the
 * screen (which message is open, whether a save is running) reaches it through
 * the table's `meta`, so the column list is built once.
 *
 * Two things shape the layout. A message is a paragraph, not a field, so the
 * table shows one line of it and a click on the row **opens it in a modal**
 * (MessageModal) — the whole message, the screenshot, and every action on it
 * (Reply, Copy AI Prompt, the status move, Delete) in its footer. And the only
 * Filters chips choose which states and kinds show, and the order
 * changes only when somebody clicks a header. A message moves through four
 * states — New, Seen, In Progress, Resolved (lib/feedback.ts); opening a New
 * one marks it Seen, and the rest are set by hand from the modal or the menu.
 *
 * Below `lg` the same filtered list is cards (AdminCardList). A card shows
 * three lines of the message and opens through its own "Read Message" button
 * rather than on a tap anywhere. Open is `openId`, the one the table's row
 * sets, and the open row is read back from the list by id, so a status change
 * shows in the modal at once.
 */


export default function FeedbackClient() {
  // Shadows window.alert / window.confirm on purpose — see AlertProvider.
  const { alert, confirm, progress } = useAlert();

  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  // The Filters sheet: triage state and kind. None chosen in a group is all of it.
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedKinds, setSelectedKinds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const fetchFeedback = async () => {
    try {
      const res = await fetch('/api/admin/feedback');
      if (res.ok) {
        const data = await res.json();
        // Read through feedbackStatusOf, so rows written as "REVIEWED"
        // before the four states existed show as Seen.
        setRows(
          (data.feedback as (Omit<FeedbackRow, 'status'> & { status: string })[]).map(row => ({
            ...row,
            status: feedbackStatusOf(row.status),
          })),
        );
      }
    } catch (error) {
      console.error('Failed to fetch feedback:', error);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchFeedback();
  }, []);

  /**
   * One request and a reload of the list. `working` and `done` are the
   * progress toast's two sentences: the row menu or card button that started
   * this has nothing on it to show the wait, so the toast does (§9). Failures
   * clear it and answer with a dialog instead.
   */
  const send = async (url: string, init: RequestInit, working: string, done: string) => {
    setIsSaving(true);
    const status = progress(working);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        status.clear();
        alert(data.error || 'Something went wrong.');
        return false;
      }
      await fetchFeedback();
      status.done(done);
      return true;
    } catch (error) {
      console.error(error);
      status.clear();
      alert('An error occurred');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const setStatus = async (row: FeedbackRow, status: FeedbackStatus) => {
    // A success is announced, never made to be dismissed (§9).
    await send(
      `/api/admin/feedback/${row.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      },
      STATUS_MOVES[status].working,
      STATUS_MOVES[status].done,
    );
  };

  /**
   * Opening a NEW message is reading it, so it moves to Seen on its own —
   * quietly: the row changes here at once and the PATCH runs behind it, with
   * no toast for a move nobody pressed a button for. If the save fails, the
   * next load shows it as New again, which is the truth.
   */
  const markSeen = (row: FeedbackRow) => {
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: 'SEEN' } : r)));
    fetch(`/api/admin/feedback/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SEEN' }),
    }).catch(error => console.error('Failed to mark feedback seen:', error));
  };

  const remove = async (row: FeedbackRow) => {
    const confirmed = await confirm({
      variant: 'danger',
      title: 'Delete This Message',
      message:
        'This removes it for good — there is no archive behind this screen. Delete it only if it is spam or a duplicate.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    const ok = await send(
      `/api/admin/feedback/${row.id}`,
      { method: 'DELETE' },
      'Deleting the message',
      'Message deleted.',
    );
    if (ok) setOpenId(current => (current === row.id ? null : current));
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter(row => {
      if (selectedStatuses.length && !selectedStatuses.includes(row.status)) return false;
      if (selectedKinds.length && !selectedKinds.includes(asFeedbackKind(row.kind) ?? '')) return false;
      if (!needle) return true;
      // The sender's own words first, then who they are and where they were —
      // searching an inbox is nearly always searching for a phrase.
      return [row.message, row.name, row.email, row.pagePath]
        .filter(Boolean)
        .some(value => (value as string).toLowerCase().includes(needle));
    });
  }, [rows, search, selectedStatuses, selectedKinds]);

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) =>
    setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));

  const emptyMessage =
    rows.length === 0
      ? 'Nothing yet. The form at /feedback is live — this fills up on its own.'
      : 'No message matches those filters.';

  const openRow = openId ? rows.find(r => r.id === openId) ?? null : null;
  const open = (row: FeedbackRow) => {
    setOpenId(row.id);
    if (row.status === 'NEW') markSeen(row);
  };

  const meta: FeedbackTableMeta = { isSaving, open, setStatus, remove };

  const table = useReactTable({
    data: filtered,
    columns: COLUMNS,
    state: { sorting, columnVisibility },
    meta,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <>
      <DashboardHeader title="Feedback" />

      <div className="admin-content">
        <FeedbackMetrics rows={rows} />

        <div className="flex flex-col gap-4 w-full text-primary">
          <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
            <div className="toolbar-actions" style={{ flex: 1 }}>
              <div className="search-wrapper">
                <Search className="search-icon" size={16} />
                <input
                  type="text"
                  placeholder="Search messages, senders, pages..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="search-input"
                />
                {search && (
                  // 44px under a thumb, below `sm`; the desktop's small cross
                  // otherwise.
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center border-none bg-transparent text-[var(--text-muted)] hover:text-[var(--ink-85)] max-sm:right-0 max-sm:h-11 max-sm:w-11"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <FiltersMenu
                groups={[
                  {
                    label: 'Status',
                    options: FEEDBACK_STATUSES.map(status => {
                      const count = rows.filter(r => r.status === status).length;
                      return {
                        value: status,
                        label: `${FEEDBACK_STATUS_COPY[status].label}${count ? ` (${count})` : ''}`,
                      };
                    }),
                    selected: selectedStatuses,
                    onToggle: toggleIn(setSelectedStatuses),
                  },
                  {
                    label: 'Kind',
                    options: FEEDBACK_KINDS.map(kind => ({ value: kind, label: feedbackKindLabel(kind) })),
                    selected: selectedKinds,
                    onToggle: toggleIn(setSelectedKinds),
                  },
                ]}
                onClear={() => {
                  setSelectedStatuses([]);
                  setSelectedKinds([]);
                }}
              />
              <AdminColumnsMenu table={table} />
              <MobileSortMenu table={table} />
            </div>
          </div>

          {/* While it loads, placeholder rows in the table's own frame and
              placeholder cards below `lg` — the shape of the answer (§9). */}
          <AdminDataTable
            table={table}
            empty={emptyMessage}
            loading={isLoading}
            leadColumn="received"
            rowProps={row => ({
              onClick: () => open(row.original),
              className: 'cursor-pointer',
            })}
          />

          <div className="dash-mobile-only">
            {isLoading ? (
              <AdminCardListSkeleton cards={3} fields={2} className="is-flush" />
            ) : (
              <AdminCardList
                items={table.getRowModel().rows.map(row => row.original)}
                getKey={row => row.id}
                label="Feedback Messages"
                className="is-flush"
                // Three lines of the words themselves: what a message is about
                // is the title, and the whole of it opens below.
                title={row => (
                  <span
                    className={`line-clamp-3 ${
                      row.status === 'NEW' ? '' : 'font-normal text-secondary'
                    }`}
                  >
                    {row.message}
                  </span>
                )}
                badges={row => (
                  <>
                    <FeedbackKindLabel kind={row.kind} />
                    <FeedbackStatusBadge status={row.status} />
                  </>
                )}
                fields={row => [
                  { label: 'Received', value: receivedOn(row.createdAt) },
                  { label: 'From', value: <FeedbackSender row={row} />, full: true },
                ]}
                actions={row => (
                  <>
                    <button type="button" onClick={() => open(row)} className="btn-filter">
                      <Eye size={16} aria-hidden="true" /> Read Message
                    </button>
                    <FeedbackMenu
                      row={row}
                      saving={isSaving}
                      onOpen={open}
                      onSetStatus={setStatus}
                      onRemove={remove}
                      className="ml-auto"
                    />
                  </>
                )}
                empty={
                  <div className="border border-[var(--dash-border)] rounded-panel py-16 px-4 text-center text-[var(--text-muted)]">
                    {emptyMessage}
                  </div>
                }
              />
            )}
          </div>

          <AdminTablePager table={table} />
        </div>
      </div>

      {openRow && (
        <MessageModal
          key={openRow.id}
          row={openRow}
          saving={isSaving}
          onClose={() => setOpenId(null)}
          onSetStatus={setStatus}
          onRemove={remove}
        />
      )}
    </>
  );
}
