"use client";

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Inbox,
  Lightbulb,
  Mail,
  MessageSquare,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import RowActionsMenu from '@/app/admin/RowActionsMenu';
import { useAlert } from '@/components/ui/AlertProvider';
import AdminCardList, { AdminCardListSkeleton } from '@/app/admin/AdminCardList';
import AdminDataTable, { AdminColumnsMenu } from '@/app/admin/AdminDataTable';
import AdminTablePager from '@/app/admin/AdminTablePager';
import FiltersMenu from '@/app/admin/FiltersMenu';
import MobileSortMenu from '@/app/admin/MobileSortMenu';
import {
  ANONYMOUS_SENDER,
  FEEDBACK_KINDS,
  asFeedbackKind,
  feedbackKindLabel,
  type FeedbackKind,
} from '@/lib/feedback';

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
 * table shows one line of it and the row **opens** into the whole thing — the
 * second-TableRow pattern the marketing screen's voucher batches use, rather
 * than a column wide enough for prose that would squeeze every other column.
 * And the only state a message has is read or not read: the chips filter, the
 * order changes only when somebody clicks a header, and "Mark
 * Reviewed" is one press away in the row that is already open.
 *
 * Below `lg` the same filtered list is cards (AdminCardList). A card shows
 * three lines of the message and opens through its own "Read message" button
 * rather than on a tap anywhere, so its Mark Reviewed and Delete can never be
 * pressed by a thumb that meant to read. Open is `openId`, the one the table's
 * row reads, so a message stays open across a resize.
 */

interface FeedbackRow {
  id: string;
  kind: string;
  message: string;
  name: string | null;
  email: string | null;
  pagePath: string | null;
  userAgent: string | null;
  status: string;
  createdAt: string;
}

/** The icon and the tone each kind wears in the table. Lucide in currentColor,
 *  like every other icon in the dashboard. */
const KIND_META: Record<FeedbackKind, { icon: React.ReactNode; tone: string }> = {
  ISSUE: { icon: <AlertTriangle size={14} />, tone: 'text-red-400' },
  SUGGESTION: { icon: <Lightbulb size={14} />, tone: 'text-amber-400' },
  FEATURE: { icon: <Sparkles size={14} />, tone: 'text-accent-blue' },
};

/** Manila, spelled out — the same zone every other date on this site is read
 *  in, so a message that arrived at 11pm does not show up on the wrong day. */
function receivedOn(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function FeedbackClient() {
  // Shadows window.alert / window.confirm on purpose — see AlertProvider.
  const { alert, confirm, toast } = useAlert();

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
        setRows(data.feedback);
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

  const send = async (url: string, init: RequestInit) => {
    setIsSaving(true);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Something went wrong.');
        return false;
      }
      await fetchFeedback();
      return true;
    } catch (error) {
      console.error(error);
      alert('An error occurred');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const setStatus = async (row: FeedbackRow, status: 'NEW' | 'REVIEWED') => {
    const ok = await send(`/api/admin/feedback/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    // A success is announced, never made to be dismissed (§9).
    if (ok) {
      toast({
        variant: 'success',
        message: status === 'REVIEWED' ? 'Marked as reviewed.' : 'Moved back to new.',
      });
    }
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
    const ok = await send(`/api/admin/feedback/${row.id}`, { method: 'DELETE' });
    if (ok) {
      setOpenId(current => (current === row.id ? null : current));
      toast({ variant: 'success', message: 'Message deleted.' });
    }
  };

  const newCount = useMemo(() => rows.filter(r => r.status === 'NEW').length, [rows]);
  const issueCount = useMemo(
    () => rows.filter(r => asFeedbackKind(r.kind) === 'ISSUE').length,
    [rows],
  );

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

  const meta: FeedbackTableMeta = { openId, isSaving, setOpenId, setStatus, remove };

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
      <header className="admin-header">
        <h1 className="admin-header-title">Feedback</h1>
      </header>

      <div className="admin-content">
        <div className="metrics-grid" style={{ marginBottom: '24px' }}>
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Unread</span>
              <span className="metric-icon">
                <Inbox size={18} />
              </span>
            </div>
            <div className="metric-value">{newCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Reported Problems</span>
              <span className="metric-icon">
                <AlertTriangle size={18} />
              </span>
            </div>
            <div className="metric-value">{issueCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Messages In Total</span>
              <span className="metric-icon">
                <MessageSquare size={18} />
              </span>
            </div>
            <div className="metric-value">{rows.length}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4 w-full text-white">
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center border-none bg-transparent text-gray-500 hover:text-gray-300 max-sm:right-0 max-sm:h-11 max-sm:w-11"
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
                    options: [
                      { value: 'NEW', label: `Unread${newCount ? ` (${newCount})` : ''}` },
                      { value: 'REVIEWED', label: 'Reviewed' },
                    ],
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
              onClick: () => setOpenId(openId === row.original.id ? null : row.original.id),
              className: 'cursor-pointer',
            })}
            renderSubRow={row =>
              openId === row.original.id && (
                <MessageDetail
                  row={row.original}
                  saving={isSaving}
                  onReview={() => setStatus(row.original, 'REVIEWED')}
                />
              )
            }
          />

          <div className="dash-mobile-only">
            {isLoading ? (
              <AdminCardListSkeleton cards={3} fields={2} className="is-flush" />
            ) : (
              <AdminCardList
                items={table.getRowModel().rows.map(row => row.original)}
                getKey={row => row.id}
                label="Feedback messages"
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
                    <FeedbackStatus isNew={row.status === 'NEW'} />
                  </>
                )}
                fields={row => [
                  { label: 'Received', value: receivedOn(row.createdAt) },
                  { label: 'From', value: <FeedbackSender row={row} />, full: true },
                ]}
                expanded={row => {
                  const isOpen = openId === row.id;
                  return (
                    // transitions.dev's accordion (21), as the marketing
                    // card's voucher list. The message stays mounted so the
                    // height can animate; `inert` keeps a closed one out of
                    // the tab order. No `id` or aria-controls: the table
                    // renders beside these cards.
                    <div className="t-acc" data-open={isOpen ? 'true' : 'false'}>
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : row.id)}
                        aria-expanded={isOpen}
                        className="t-acc-head btn-filter w-full justify-between min-h-11"
                      >
                        <span>{isOpen ? 'Hide message' : 'Read message'}</span>
                        <span className="t-acc-chevron" aria-hidden="true">
                          <svg
                            viewBox="0 0 16 16"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 6.5L8 10.5L12 6.5" />
                          </svg>
                        </span>
                      </button>
                      <div className="t-acc-panel" inert={!isOpen}>
                        <div className="t-acc-panel-inner">
                          <div className="pt-3">
                            <MessageDetail
                              row={row}
                              saving={isSaving}
                              onReview={() => setStatus(row, 'REVIEWED')}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }}
                actions={row => {
                  const isNew = row.status === 'NEW';
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => setStatus(row, isNew ? 'REVIEWED' : 'NEW')}
                        disabled={isSaving}
                        className="btn-filter"
                      >
                        {isNew ? (
                          <CheckCircle size={16} aria-hidden="true" />
                        ) : (
                          <RotateCcw size={16} aria-hidden="true" />
                        )}
                        {isNew ? 'Mark Reviewed' : 'Move to New'}
                      </button>
                      <FeedbackMenu
                        row={row}
                        saving={isSaving}
                        onSetStatus={setStatus}
                        onRemove={remove}
                        className="ml-auto"
                      />
                    </>
                  );
                }}
                empty={
                  <div className="border border-white/10 rounded-lg py-16 px-4 text-center text-gray-500">
                    {emptyMessage}
                  </div>
                }
              />
            )}
          </div>

          <AdminTablePager table={table} />
        </div>
      </div>
    </>
  );
}

/** What the cells read that changes while the inbox is open. */
type FeedbackTableMeta = {
  openId: string | null;
  isSaving: boolean;
  setOpenId: (id: string | null) => void;
  setStatus: (row: FeedbackRow, status: 'NEW' | 'REVIEWED') => void;
  remove: (row: FeedbackRow) => void;
};

const COLUMNS: ColumnDef<FeedbackRow>[] = [
  {
    id: 'received',
    header: 'Received',
    accessorFn: row => row.createdAt,
    cell: ({ row }) => <span className="whitespace-nowrap text-secondary">{receivedOn(row.original.createdAt)}</span>,
    enableHiding: false,
  },
  {
    id: 'type',
    header: 'Type',
    accessorFn: row => feedbackKindLabel(row.kind),
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        <FeedbackKindLabel kind={row.original.kind} />
      </span>
    ),
  },
  {
    id: 'message',
    header: 'Message',
    accessorFn: row => row.message,
    cell: ({ row, table }) => {
      const { openId } = table.options.meta as FeedbackTableMeta;
      const isOpen = openId === row.original.id;
      const isNew = row.original.status === 'NEW';
      return (
        <div className="flex items-start gap-2 min-w-[260px] max-w-[420px]">
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`mt-0.5 shrink-0 text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
          <span className={`${isOpen ? '' : 'line-clamp-1'} ${isNew ? 'font-medium text-primary' : 'text-secondary'}`}>
            {row.original.message}
          </span>
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: 'from',
    header: 'From',
    accessorFn: row => row.name ?? '',
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        <FeedbackSender row={row.original} />
      </div>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    accessorFn: row => row.status,
    cell: ({ row }) => <FeedbackStatus isNew={row.original.status === 'NEW'} />,
  },
  {
    // Left-aligned, under its own header label — never pushed to the row's
    // right edge. RowActionsMenu swallows the click, so acting never opens the row.
    id: 'actions',
    header: 'Actions',
    cell: ({ row, table }) => {
      const { isSaving, setStatus, remove } = table.options.meta as FeedbackTableMeta;
      return <FeedbackMenu row={row.original} saving={isSaving} onSetStatus={setStatus} onRemove={remove} />;
    },
    enableSorting: false,
    enableHiding: false,
  },
];

/** A message's ⋮ menu, for the table's Actions cell and the card's footer. */
function FeedbackMenu({
  row,
  saving,
  onSetStatus,
  onRemove,
  className,
}: {
  row: FeedbackRow;
  saving: boolean;
  onSetStatus: FeedbackTableMeta['setStatus'];
  onRemove: FeedbackTableMeta['remove'];
  className?: string;
}) {
  const isNew = row.status === 'NEW';
  const sender = row.name ?? row.email ?? 'an anonymous sender';
  return (
    <RowActionsMenu
      label={`feedback from ${sender}`}
      className={className}
      actions={[
        {
          key: 'status',
          label: isNew ? 'Mark Reviewed' : 'Move to New',
          icon: isNew ? <CheckCircle size={16} /> : <RotateCcw size={16} />,
          onSelect: () => onSetStatus(row, isNew ? 'REVIEWED' : 'NEW'),
          disabled: saving,
        },
        {
          key: 'delete',
          label: 'Delete Message',
          icon: <Trash2 size={16} />,
          onSelect: () => onRemove(row),
          disabled: saving,
          danger: true,
        },
      ]}
    />
  );
}

/** A kind, in its icon and tone. The table's Type cell and a card's badge. */
function FeedbackKindLabel({ kind }: { kind: string }) {
  const known = asFeedbackKind(kind);
  const meta = known ? KIND_META[known] : null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm ${meta ? meta.tone : 'text-secondary'}`}
    >
      {meta?.icon}
      {feedbackKindLabel(kind)}
    </span>
  );
}

function FeedbackStatus({ isNew }: { isNew: boolean }) {
  return (
    <span className={`status-badge ${isNew ? 'pending' : 'success'}`}>
      {isNew ? 'NEW' : 'REVIEWED'}
    </span>
  );
}

/** The name, or that there was none, and the address under it. A card lets the
 *  address wrap; the table's cell keeps it on one line. */
function FeedbackSender({ row }: { row: FeedbackRow }) {
  return (
    <>
      <span className={row.name ? 'text-primary' : 'text-secondary'}>
        {row.name || ANONYMOUS_SENDER}
      </span>
      {row.email && <div className="status-note neutral">{row.email}</div>}
    </>
  );
}

/**
 * The opened message: every word of it, where the sender was and on what, and
 * the two things worth doing next. One component for the table's second row
 * and the card's accordion, so what an open message shows cannot differ by
 * screen width.
 */
function MessageDetail({
  row,
  saving,
  onReview,
}: {
  row: FeedbackRow;
  saving: boolean;
  onReview: () => void;
}) {
  return (
    <>
      <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-primary [overflow-wrap:anywhere]">
        {row.message}
      </p>

      <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-white/5 pt-4 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="mb-1 font-bold uppercase tracking-wider text-secondary">
            Page they were on
          </dt>
          <dd className="m-0 break-all font-mono text-white/80">
            {row.pagePath || 'Not recorded'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="mb-1 font-bold uppercase tracking-wider text-secondary">
            Browser
          </dt>
          <dd className="m-0 break-all text-white/80">
            {row.userAgent || 'Not recorded'}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {row.email ? (
          <a
            href={`mailto:${row.email}?subject=${encodeURIComponent(
              'Re: your feedback on Run As One',
            )}`}
            className="btn-filter no-underline max-lg:min-h-11"
          >
            <Mail size={16} /> Reply by email
          </a>
        ) : (
          <span className="text-xs text-secondary">
            No address left, so there is nobody to reply to.
          </span>
        )}
        {row.status === 'NEW' && (
          <button
            onClick={onReview}
            disabled={saving}
            className="btn-filter max-lg:min-h-11"
          >
            <CheckCircle size={16} /> Mark reviewed
          </button>
        )}
      </div>
    </>
  );
}
