"use client";

import React from 'react';
import { AlertTriangle, CheckCircle, Eye, Lightbulb, RotateCcw, Sparkles, Wrench } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { type FeedbackRow, receivedOn } from './MessageDetail';
import FeedbackMenu from './FeedbackMenu';
import {
  ANONYMOUS_SENDER,
  FEEDBACK_STATUS_COPY,
  asFeedbackKind,
  feedbackKindLabel,
  type FeedbackKind,
  type FeedbackStatus as FeedbackStatusValue,
} from '@/lib/feedback';

/**
 * The feedback inbox's table columns and the small cells the table and the
 * cards share. Split out of FeedbackClient so the screen file holds the state
 * and the layout, and this one holds how a single message is drawn.
 */

/** The icon and the tone each kind wears in the table. Lucide in currentColor,
 *  like every other icon in the dashboard. */
const KIND_META: Record<FeedbackKind, { icon: React.ReactNode; tone: string }> = {
  ISSUE: { icon: <AlertTriangle size={14} />, tone: 'text-[var(--status-danger)]' },
  SUGGESTION: { icon: <Lightbulb size={14} />, tone: 'text-[var(--status-warning)]' },
  FEATURE: { icon: <Sparkles size={14} />, tone: 'text-accent-blue-ink' },
};

/** What the cells read that changes while the inbox is open. */
export type FeedbackTableMeta = {
  isSaving: boolean;
  open: (row: FeedbackRow) => void;
  setStatus: (row: FeedbackRow, status: FeedbackStatusValue) => void;
  remove: (row: FeedbackRow) => void;
};

export const COLUMNS: ColumnDef<FeedbackRow>[] = [
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
    // One line of it; the whole message opens in MessageModal.
    cell: ({ row }) => (
      <span
        className={`line-clamp-1 min-w-[260px] max-w-[420px] ${
          row.original.status === 'NEW' ? 'font-medium text-primary' : 'text-secondary'
        }`}
      >
        {row.original.message}
      </span>
    ),
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
    cell: ({ row }) => <FeedbackStatus status={row.original.status} />,
  },
  {
    // Left-aligned, under its own header label — never pushed to the row's
    // right edge. RowActionsMenu swallows the click, so acting never opens the row.
    id: 'actions',
    header: 'Actions',
    cell: ({ row, table }) => {
      const { isSaving, open, setStatus, remove } = table.options.meta as FeedbackTableMeta;
      return (
        <FeedbackMenu
          row={row.original}
          saving={isSaving}
          onOpen={open}
          onSetStatus={setStatus}
          onRemove={remove}
        />
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
];

/** A kind, in its icon and tone. The table's Type cell and a card's badge. */
export function FeedbackKindLabel({ kind }: { kind: string }) {
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

export function FeedbackStatus({ status }: { status: FeedbackStatusValue }) {
  const { label, tone } = FEEDBACK_STATUS_COPY[status];
  return <span className={`status-badge ${tone}`}>{label}</span>;
}

/**
 * Moving a message to each state, as a menu item or button says it, and the
 * progress toast's two sentences. One table, so the ⋮ menu and the modal can
 * never word the same move differently.
 */
export const STATUS_MOVES: Record<
  FeedbackStatusValue,
  { label: string; icon: React.ReactNode; working: string; done: string }
> = {
  NEW: { label: 'Move to New', icon: <RotateCcw size={16} />, working: 'Moving back to new', done: 'Moved back to new.' },
  SEEN: { label: 'Mark as Seen', icon: <Eye size={16} />, working: 'Marking as seen', done: 'Marked as seen.' },
  IN_PROGRESS: { label: 'Mark In Progress', icon: <Wrench size={16} />, working: 'Marking in progress', done: 'Marked in progress.' },
  RESOLVED: { label: 'Mark Resolved', icon: <CheckCircle size={16} />, working: 'Marking as resolved', done: 'Marked as resolved.' },
};

/** The name, or that there was none, and the address under it. A card lets the
 *  address wrap; the table's cell keeps it on one line. */
export function FeedbackSender({ row }: { row: FeedbackRow }) {
  return (
    <>
      <span className={row.name ? 'text-primary' : 'text-secondary'}>
        {row.name || ANONYMOUS_SENDER}
      </span>
      {row.email && <div className="status-note neutral">{row.email}</div>}
    </>
  );
}
