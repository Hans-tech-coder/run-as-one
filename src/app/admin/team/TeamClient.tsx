"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Columns,
  Plus,
  Search,
  Send,
  Trash2,
  UserCog,
  UserPlus,
  X,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ColumnDef,
  FilterFn,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useAlert } from '@/components/ui/AlertProvider';
import FieldError from '@/components/ui/FieldError';
import AdminSelect from '../AdminSelect';
import AdminCardList from '../AdminCardList';
import AdminTablePager from '../AdminTablePager';
import MobileSortMenu from '../MobileSortMenu';
import TeamActionsMenu from './TeamActionsMenu';
import {
  EVENT_ROLES,
  ROLE_HINTS,
  ROLE_LABELS,
  type EventRole,
  type TeamRole,
} from '@/lib/permissions';
import {
  MEMBER_STATE_LABELS,
  MEMBER_STATE_TONES,
  assignmentField,
  readAccess,
  readInvitee,
  type FieldErrors,
  type MemberState,
} from '@/lib/team';

/**
 * The organizer's team: who can sign in, as what, to which races — and the
 * one form that invites a person or changes what they reach.
 *
 * The table is the admin's one table (`components/ui/table` under TanStack,
 * PROJECT_GUIDE §9): the same search box, View menu, sort arrows and pager as
 * events, registrants and marketing, so a person is read the way a registrant
 * is. Its rows arrive in invitation order and nothing done to a row moves it.
 *
 * Invite and edit share one form, as the marketing screen's create and edit
 * do, so an edit can never offer something the invitation validates
 * differently. Both run the rules in lib/team.ts before posting, and the routes
 * run them again and answer in the same field keys, so a message always lands
 * under the control it is about (§8, rule 4).
 */

export type TeamMemberRow = {
  /** The membership id, or "owner" for the organizer's own row. */
  id: string;
  isOwner: boolean;
  /** This row is the person looking at the screen. */
  isSelf: boolean;
  /** Decided on the server with the same canManageMember the routes enforce. */
  canManage: boolean;
  name: string;
  email: string;
  role: 'OWNER' | TeamRole;
  assignments: { eventId: string; eventTitle: string; role: EventRole }[];
  accepted: boolean;
  state: MemberState;
  inviteExpiresAt: string | null;
  lastLoginAt: string | null;
};

type EventOption = { id: string; title: string; date: string };

type DraftAssignment = { key: number; eventId: string; role: EventRole | '' };

type Draft = {
  name: string;
  email: string;
  role: TeamRole;
  assignments: DraftAssignment[];
};

/** What the View menu calls a column. */
const COLUMN_LABELS: Record<string, string> = {
  member: 'Member',
  role: 'Role',
  events: 'Events',
  status: 'Status',
  lastLogin: 'Last Sign-In',
  actions: 'Actions',
};

/** How many of a staff member's races the Events cell names before summarising. */
const EVENTS_SHOWN = 3;

const MANILA = 'Asia/Manila';

/** "Sep 20" for an ISO instant, in the organizer's own time zone. */
function shortDay(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: MANILA, month: 'short', day: 'numeric' }).format(
    new Date(iso),
  );
}

/** "Sep 13, 4:02 PM" — when somebody last signed in. */
function shortInstant(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** An event's `YYYY-MM-DD` as "Oct 5, 2026", for the hint under its name in the picker. */
function eventDay(date: string): string {
  const instant = new Date(`${date}T00:00:00+08:00`);
  if (Number.isNaN(instant.getTime())) return date;
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(instant);
}

/** Name, address, and every race a person is on — the questions this box is asked. */
const searchMembers: FilterFn<TeamMemberRow> = (row, _columnId, filterValue) => {
  const term = String(filterValue ?? '').trim().toLowerCase();
  if (!term) return true;
  const member = row.original;
  return [
    member.name,
    member.email,
    ROLE_LABELS[member.role],
    ...member.assignments.map(assignment => assignment.eventTitle),
  ]
    .join(' ')
    .toLowerCase()
    .includes(term);
};

// ── What a row shows, drawn once for the table cell and the card ────────────
// Both layouts are on the page at once and CSS picks one, so anything the two
// both say is said by one function: they cannot drift apart.

function YouChip() {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-secondary">
      You
    </span>
  );
}

function MemberEvents({ member }: { member: TeamMemberRow }) {
  if (member.role !== 'STAFF') {
    return <span className="text-secondary">Every event</span>;
  }
  const shown = member.assignments.slice(0, EVENTS_SHOWN);
  const more = member.assignments.length - shown.length;
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-1">
      {shown.map(assignment => (
        <li key={assignment.eventId} className="text-sm">
          <span className="text-white">{assignment.eventTitle}</span>
          <span className="text-secondary whitespace-nowrap"> &middot; {ROLE_LABELS[assignment.role]}</span>
        </li>
      ))}
      {more > 0 && (
        <li className="text-xs text-secondary">{`+${more} more — open Edit Access to see them all`}</li>
      )}
    </ul>
  );
}

function MemberStatus({ member }: { member: TeamMemberRow }) {
  return (
    <div>
      <span className={`status-badge ${MEMBER_STATE_TONES[member.state]}`}>
        {MEMBER_STATE_LABELS[member.state]}
      </span>
      {/* When a waiting invitation stops working — the one date an owner
          needs before it quietly becomes Invite Expired. */}
      {member.state === 'INVITED' && member.inviteExpiresAt && (
        <span className="status-note pending">{`Link expires ${shortDay(member.inviteExpiresAt)}`}</span>
      )}
    </div>
  );
}

function LastSignIn({ member }: { member: TeamMemberRow }) {
  // The owner signs in as the Organizer row, which has never recorded a
  // sign-in time — a blank here is honest where "Never" would be false.
  if (member.isOwner) return <span className="text-secondary">&mdash;</span>;
  return member.lastLoginAt ? (
    <span className="whitespace-nowrap">{shortInstant(member.lastLoginAt)}</span>
  ) : (
    <span className="text-secondary">Never</span>
  );
}

/**
 * Why a row has no menu. The table gives it as a hover title on the dash; a
 * card says it in words, because a touch screen never hovers.
 */
function manageReason(member: TeamMemberRow): string {
  if (member.isOwner) return "The Super Admin is Run As One's own account";
  if (member.isSelf) return 'You cannot change your own access';
  return 'Only the Super Admin can change an Admin';
}

export default function TeamClient({
  organizerName,
  rows,
  events,
  grantableRoles,
}: {
  organizerName: string;
  rows: TeamMemberRow[];
  events: EventOption[];
  grantableRoles: TeamRole[];
}) {
  const router = useRouter();
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert, confirm, toast } = useAlert();

  // ── Table state, in the shape every admin table keeps it ───────────────────
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [isViewOpen, setIsViewOpen] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);

  // Which row's request is in flight, so its menu item can say so.
  const [busy, setBusy] = useState<{ id: string; kind: 'resend' | 'suspend' } | null>(null);

  // ── The form ───────────────────────────────────────────────────────────────
  // Mounted, open and closing are three flags rather than one, so the panel
  // animates out on the t-modal tokens instead of vanishing — the pair the
  // registrants and marketing modals use.
  const [modalMounted, setModalMounted] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [editing, setEditing] = useState<TeamMemberRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nextKey = useRef(1);

  const eventIds = useMemo(() => new Set(events.map(event => event.id)), [events]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (viewRef.current && !viewRef.current.contains(event.target as Node)) {
        setIsViewOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const blankAssignment = (): DraftAssignment => ({ key: nextKey.current++, eventId: '', role: '' });

  const openModal = () => {
    setErrors({});
    setModalMounted(true);
    setIsModalClosing(false);
    requestAnimationFrame(() => setIsModalOpen(true));
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setIsModalClosing(true);
    setTimeout(() => {
      setIsModalClosing(false);
      setModalMounted(false);
      setEditing(null);
      setDraft(null);
      setErrors({});
    }, 150);
  };

  // Escape closes the form. A picker that is open inside it stops the key
  // from reaching here first (AdminSelect), so dismissing a list never throws
  // the whole form away.
  useEffect(() => {
    if (!modalMounted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const openInvite = () => {
    setEditing(null);
    setDraft({
      name: '',
      email: '',
      // Staff first: most people brought onto a race are there for one job on
      // one event, and organizer-wide reach should be a deliberate choice.
      role: grantableRoles.includes('STAFF') ? 'STAFF' : grantableRoles[0],
      assignments: [blankAssignment()],
    });
    openModal();
  };

  const openEdit = (member: TeamMemberRow) => {
    setEditing(member);
    setDraft({
      name: member.name,
      email: member.email,
      role: member.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
      // An admin's form keeps one empty row ready, so switching them to Staff
      // opens straight onto the question it needs answered.
      assignments:
        member.assignments.length > 0
          ? member.assignments.map(assignment => ({
              key: nextKey.current++,
              eventId: assignment.eventId,
              role: assignment.role,
            }))
          : [blankAssignment()],
    });
    openModal();
  };

  /** A change to the form, which also retires the message about that field. */
  const update = (patch: Partial<Draft>, ...fields: string[]) => {
    setDraft(prev => (prev ? { ...prev, ...patch } : prev));
    if (fields.length > 0) {
      setErrors(prev => {
        const next = { ...prev };
        for (const field of fields) delete next[field];
        return next;
      });
    }
  };

  const setAssignment = (key: number, patch: Partial<DraftAssignment>, field: string) => {
    if (!draft) return;
    update(
      {
        assignments: draft.assignments.map(assignment =>
          assignment.key === key ? { ...assignment, ...patch } : assignment,
        ),
      },
      field,
      'assignments',
    );
  };

  /** Removing a row renumbers the rows under it, so every per-row message goes with it. */
  const removeAssignment = (key: number) => {
    if (!draft) return;
    setDraft({ ...draft, assignments: draft.assignments.filter(assignment => assignment.key !== key) });
    setErrors(prev =>
      Object.fromEntries(Object.entries(prev).filter(([field]) => !field.startsWith('assignments'))),
    );
  };

  const addAssignment = () => {
    if (!draft) return;
    update({ assignments: [...draft.assignments, blankAssignment()] }, 'assignments');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;

    const payloadAssignments =
      draft.role === 'STAFF'
        ? draft.assignments.map(({ eventId, role }) => ({ eventId, role }))
        : [];

    // The same two rules the route runs, so the messages match whichever side
    // catches them.
    const found: FieldErrors = {
      ...(editing ? {} : readInvitee(draft.name, draft.email).errors),
      ...readAccess(draft.role, payloadAssignments, eventIds).errors,
    };
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSubmitting(true);
    try {
      const body = editing
        ? { role: draft.role, assignments: payloadAssignments }
        : { name: draft.name.trim(), email: draft.email.trim(), role: draft.role, assignments: payloadAssignments };

      const res = await fetch(editing ? `/api/admin/team/${editing.id}` : '/api/admin/team', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.errors) {
          setErrors(data.errors);
          return;
        }
        throw new Error(data.error || 'That could not be saved.');
      }

      const who = editing ? editing.name : (data.name as string) || draft.name.trim();
      const address = draft.email.trim().toLowerCase();

      setIsSubmitting(false);
      closeModal();
      router.refresh();

      if (editing) {
        toast(data.unchanged ? `Nothing changed for ${who}.` : `${who}'s access is saved.`);
      } else if (data.emailSent) {
        toast(`Invitation sent to ${address}.`);
      } else {
        // Not a toast: an invitation that never left is something to act on,
        // and a panel that times out could be missed.
        await alert({
          variant: 'error',
          title: 'Saved, but the email did not go out',
          message: `${data.emailError ?? 'The email could not be sent.'} ${who} is on your team list as Invited — use Resend Invitation on their row once email is working again.`,
        });
      }
    } catch (err) {
      await alert(err instanceof Error ? err.message : 'That could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Row actions ────────────────────────────────────────────────────────────

  const handleResend = async (member: TeamMemberRow) => {
    setBusy({ id: member.id, kind: 'resend' });
    try {
      const res = await fetch(`/api/admin/team/${member.id}/invite`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The invitation could not be resent.');
      router.refresh();
      if (data.emailSent) {
        toast(`A new invitation is on its way to ${member.email}. The earlier link no longer works.`);
      } else {
        await alert({
          variant: 'error',
          title: 'The email did not go out',
          message: `${data.emailError ?? 'The email could not be sent.'} The earlier link has stopped working, so resend again once email is working.`,
        });
      }
    } catch (err) {
      await alert(err instanceof Error ? err.message : 'The invitation could not be resent.');
    } finally {
      setBusy(null);
    }
  };

  const handleToggleSuspend = async (member: TeamMemberRow) => {
    const suspend = member.state !== 'SUSPENDED';

    // Suspending asks first — it ends somebody's access mid-shift. Reinstating
    // gives access back and needs no second thought.
    if (suspend) {
      const ok = await confirm({
        title: `Suspend ${member.name}?`,
        message: `They lose access to ${organizerName} on their next click and cannot sign back in until you reinstate them. Everything they already did stays in the activity trail.`,
        confirmLabel: 'Suspend',
        variant: 'danger',
      });
      if (!ok) return;
    }

    setBusy({ id: member.id, kind: 'suspend' });
    try {
      const res = await fetch(`/api/admin/team/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspended: suspend }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That could not be saved.');
      router.refresh();
      toast(suspend ? `${member.name} is suspended.` : `${member.name} is reinstated.`);
    } catch (err) {
      await alert(err instanceof Error ? err.message : 'That could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (member: TeamMemberRow) => {
    const ok = await confirm(
      member.accepted
        ? {
            title: `Remove ${member.name} from the team?`,
            message: `They lose access to every ${organizerName} event right away. Everything they already did stays in the activity trail under their name. To bring them back later, invite them again.`,
            confirmLabel: 'Remove',
            variant: 'danger',
          }
        : {
            title: `Revoke the invitation to ${member.name}?`,
            message: 'The link in their email will stop working. You can invite them again at any time.',
            confirmLabel: 'Revoke',
            variant: 'danger',
          },
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/team/${member.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That could not be removed.');
      router.refresh();
      toast(member.accepted ? `${member.name} was removed from the team.` : `Invitation to ${member.name} revoked.`);
    } catch (err) {
      await alert(err instanceof Error ? err.message : 'That could not be removed.');
    }
  };

  /** A manageable row's menu, for the table's Actions cell and the card's footer. */
  const renderActions = (member: TeamMemberRow, className = '') => (
    <div className={`action-dropdown-container flex ${className}`}>
      <TeamActionsMenu
        label={member.name}
        accepted={member.accepted}
        suspended={member.state === 'SUSPENDED'}
        busy={busy?.id === member.id ? busy.kind : null}
        onEdit={() => openEdit(member)}
        onResend={() => handleResend(member)}
        onToggleSuspend={() => handleToggleSuspend(member)}
        onRemove={() => handleRemove(member)}
      />
    </div>
  );

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns = useMemo<ColumnDef<TeamMemberRow>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => {
        const isChecked = table.getIsAllPageRowsSelected();
        return (
          <div className="flex items-center justify-center px-1 w-8">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                aria-label="Select every row on this page"
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
                aria-label={`Select ${row.original.name}`}
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
      id: 'index',
      header: 'No.',
      // Counted by row id rather than object identity, for the reason the
      // marketing table gives: sorting rebuilds the rows.
      cell: ({ row, table }) => {
        const index = table.getSortedRowModel().flatRows.findIndex(sorted => sorted.id === row.id);
        return <span className="text-gray-400 font-mono">{index + 1}</span>;
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: 'member',
      header: 'Member',
      accessorFn: row => row.name,
      cell: ({ row }) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-2 font-bold text-white">
            <span className="truncate">{row.original.name}</span>
            {row.original.isSelf && <YouChip />}
          </span>
          <span className="block text-xs text-secondary truncate">{row.original.email}</span>
        </span>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      accessorFn: row => ROLE_LABELS[row.role],
      cell: ({ row }) => <span className="whitespace-nowrap">{ROLE_LABELS[row.original.role]}</span>,
    },
    {
      id: 'events',
      header: 'Events',
      accessorFn: row => (row.role === 'STAFF' ? row.assignments.length : Number.MAX_SAFE_INTEGER),
      cell: ({ row }) => <MemberEvents member={row.original} />,
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: row => MEMBER_STATE_LABELS[row.state],
      cell: ({ row }) => <MemberStatus member={row.original} />,
    },
    {
      id: 'lastLogin',
      header: 'Last Sign-In',
      accessorFn: row => row.lastLoginAt ?? '',
      cell: ({ row }) => <LastSignIn member={row.original} />,
    },
    {
      // Under its own header, never pushed to the row's right edge (§8, rule 6).
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const member = row.original;
        if (!member.canManage) {
          return (
            <span className="text-white/30 pl-2" title={manageReason(member)}>
              &mdash;
            </span>
          );
        }
        return renderActions(member);
      },
      enableSorting: false,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [busy]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter, columnVisibility, rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn: searchMembers,
    getRowId: row => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const onlyOwner = rows.length === 1;

  // Every event still unassigned on this form, for the picker of one row.
  const eventOptionsFor = (key: number) => {
    const takenElsewhere = new Set(
      (draft?.assignments ?? [])
        .filter(assignment => assignment.key !== key && assignment.eventId)
        .map(assignment => assignment.eventId),
    );
    return events
      .filter(event => !takenElsewhere.has(event.id))
      .map(event => ({ value: event.id, label: event.title, hint: eventDay(event.date) }));
  };

  return (
    <>
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
                placeholder="Search by name, email or event..."
                aria-label="Search the team"
              />
              {globalFilter && (
                <button
                  onClick={() => setGlobalFilter('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-300 bg-transparent border-none cursor-pointer"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Columns mean nothing to cards: below `lg` View goes and Sort,
                which the headers did, comes in its place. */}
            <div ref={viewRef} className="relative view-dropdown-container dash-desktop-only">
              <button onClick={() => setIsViewOpen(!isViewOpen)} className="btn-filter">
                <Columns size={16} /> View
              </button>
              {isViewOpen && (
                <div className="toolbar-popover absolute right-0 mt-2 bg-[#050505] border border-white/10 rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
                  {table.getAllLeafColumns().filter(col => col.getCanHide()).map(column => (
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
                      <span>{COLUMN_LABELS[column.id] ?? column.id}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <MobileSortMenu table={table} labels={COLUMN_LABELS} />
          </div>

          {grantableRoles.length > 0 && (
            <div className="toolbar-actions">
              <button onClick={openInvite} className="btn-light">
                <UserPlus size={16} /> Invite Member
              </button>
            </div>
          )}
        </div>

        {/* Table Area — from `lg` up; the cards below take its place under it. */}
        <div className="dash-desktop-only border border-white/10 rounded-lg overflow-x-auto bg-transparent">
          <Table>
            <TableHeader className="bg-transparent">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id} className="border-b border-white/10 hover:bg-transparent">
                  {headerGroup.headers.map(header => (
                    <TableHead
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`py-4 px-4 text-gray-400 font-medium h-auto ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''} ${header.column.id === 'member' ? 'pl-8' : ''}`}
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
                  <TableRow key={row.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    {row.getVisibleCells().map(cell => (
                      <TableCell
                        key={cell.id}
                        className={`py-4 px-4 text-white align-top ${cell.column.id === 'member' ? 'pl-8 max-w-[18rem]' : ''}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-16 text-center text-gray-500">
                    Nobody on the team matches that search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* The same rows as the table, off the same table instance. The owner
            keeps the first card and, like the table, gets no menu — a row the
            viewer may not manage says why in words, not in a hover title. */}
        <div className="dash-mobile-only">
          <AdminCardList
            items={table.getRowModel().rows}
            getKey={row => row.id}
            label="Team members"
            className="is-flush"
            leading={row => (
              <span className="font-mono">
                {table.getSortedRowModel().flatRows.findIndex(sorted => sorted.id === row.id) + 1}
              </span>
            )}
            title={row => (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0">{row.original.name}</span>
                {row.original.isSelf && <YouChip />}
              </span>
            )}
            subtitle={row => row.original.email}
            badges={row => <MemberStatus member={row.original} />}
            fields={row => [
              { label: 'Role', value: ROLE_LABELS[row.original.role] },
              { label: 'Last Sign-In', value: <LastSignIn member={row.original} /> },
              { label: 'Events', value: <MemberEvents member={row.original} />, full: true },
            ]}
            // The row's most-used action one tap away, and the rest behind ⋯ —
            // the same footer an event card has.
            actions={row =>
              row.original.canManage ? (
                <>
                  <button
                    type="button"
                    className="btn-filter"
                    onClick={() => openEdit(row.original)}
                    aria-label={`Edit access for ${row.original.name}`}
                  >
                    <UserCog size={16} aria-hidden="true" />
                    Edit Access
                  </button>
                  {renderActions(row.original, 'ml-auto')}
                </>
              ) : (
                <p className="m-0 text-xs text-secondary">{manageReason(row.original)}</p>
              )
            }
            empty={
              <div className="border border-white/10 rounded-lg py-16 px-4 text-center text-gray-500">
                Nobody on the team matches that search.
              </div>
            }
          />
        </div>

        {/* Said under the table rather than instead of it: the owner's own row
            is still worth seeing, and this is the moment somebody decides
            whether to stop sharing one password. */}
        {onlyOwner && (
          <p className="text-sm text-secondary m-0">
            {`Nobody else can sign in to ${organizerName} yet. Invite the people who validate payments, load results or run an event, and each of them gets a login of their own — so every change is recorded under the name of the person who made it.`}
          </p>
        )}

        <AdminTablePager table={table} />
      </div>

      {/* The invite / edit form. The redemptions panel's frame — the t-modal
          open/closing pair, a header, a scrolling body and a footer holding
          the one .btn-light — because a new control copies an existing one. */}
      {modalMounted && draft && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
            isModalOpen && !isModalClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onMouseDown={e => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <form
            onSubmit={handleSubmit}
            noValidate
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-form-title"
            className={`t-modal admin-modal-panel w-full max-w-xl bg-[#111] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${isModalOpen ? 'is-open' : ''} ${isModalClosing ? 'is-closing' : ''}`}
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-start gap-4 shrink-0">
              <div className="min-w-0">
                <h3 id="team-form-title" className="text-xl font-semibold text-white m-0 flex items-center gap-2">
                  {editing ? (
                    <UserCog size={20} className="text-accent-blue shrink-0" aria-hidden="true" />
                  ) : (
                    <UserPlus size={20} className="text-accent-orange shrink-0" aria-hidden="true" />
                  )}
                  {editing ? 'Edit Access' : 'Invite a Team Member'}
                </h3>
                <p className="text-sm text-gray-400 mt-1 m-0 truncate">
                  {editing
                    ? `${editing.name} · ${editing.email}`
                    : 'They choose their own password from the link we email them.'}
                </p>
              </div>
              {/* 44px to press; the negative margin leaves the 20px icon where
                  it sat, as .admin-back-link does. */}
              <button
                type="button"
                onClick={closeModal}
                className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center text-gray-400 hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="admin-modal-body p-6 overflow-y-auto flex-1 flex flex-col gap-5">
              {!editing && (
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="team-name">Name</label>
                    <input
                      id="team-name"
                      type="text"
                      className="form-input"
                      autoFocus
                      autoComplete="off"
                      placeholder="Ana Cruz"
                      value={draft.name}
                      onChange={e => update({ name: e.target.value }, 'name')}
                      aria-invalid={errors.name ? true : undefined}
                      aria-describedby={errors.name ? 'team-name-error' : undefined}
                    />
                    <FieldError id="team-name-error" message={errors.name} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="team-email">Email Address</label>
                    <input
                      id="team-email"
                      type="email"
                      className="form-input"
                      autoComplete="off"
                      placeholder="ana@example.com"
                      value={draft.email}
                      onChange={e => update({ email: e.target.value }, 'email')}
                      aria-invalid={errors.email ? true : undefined}
                      aria-describedby={errors.email ? 'team-email-error' : 'team-email-hint'}
                    />
                    <FieldError id="team-email-error" message={errors.email} />
                    {!errors.email && (
                      <p id="team-email-hint" className="text-xs text-secondary">
                        Theirs, not a shared one — this is the address they sign in with.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <AdminSelect
                label="Role"
                listboxLabel="Team role"
                value={draft.role}
                onChange={next => update({ role: next as TeamRole }, 'role', 'assignments')}
                error={errors.role}
                options={grantableRoles.map(role => ({
                  value: role,
                  label: ROLE_LABELS[role],
                  hint: ROLE_HINTS[role],
                }))}
                hint={
                  grantableRoles.includes('ADMIN')
                    ? undefined
                    : 'Only the Super Admin can make someone an Admin.'
                }
              />

              {draft.role === 'STAFF' && (
                <fieldset className="form-group border-0 p-0 m-0 min-w-0">
                  <legend className="form-label mb-1">Events and roles</legend>
                  <p className="text-xs text-secondary m-0 mb-2">
                    They reach only these races. Each can carry a different role.
                  </p>

                  {events.length === 0 ? (
                    <p className="m-0 text-sm text-secondary">
                      {`${organizerName} has no events yet, so there is nothing to assign. Create the event first, or invite this person as an Admin.`}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {draft.assignments.map((assignment, index) => (
                        <div
                          key={assignment.key}
                          className="rounded-[10px] border border-white/10 bg-black/30 p-3 flex flex-col gap-1"
                        >
                          <div className="grid gap-x-3 sm:grid-cols-2">
                            <AdminSelect
                              label={draft.assignments.length > 1 ? `Event ${index + 1}` : 'Event'}
                              listboxLabel={`Event ${index + 1}`}
                              placeholder="Choose an event"
                              value={assignment.eventId}
                              options={eventOptionsFor(assignment.key)}
                              onChange={next =>
                                setAssignment(assignment.key, { eventId: next }, assignmentField(index, 'event'))
                              }
                              error={errors[assignmentField(index, 'event')]}
                            />
                            <AdminSelect
                              label="Role on this event"
                              listboxLabel={`Role on event ${index + 1}`}
                              placeholder="Choose a role"
                              value={assignment.role}
                              options={EVENT_ROLES.map(role => ({
                                value: role,
                                label: ROLE_LABELS[role],
                                hint: ROLE_HINTS[role],
                              }))}
                              onChange={next =>
                                setAssignment(
                                  assignment.key,
                                  { role: next as EventRole },
                                  assignmentField(index, 'role'),
                                )
                              }
                              error={errors[assignmentField(index, 'role')]}
                            />
                          </div>
                          {draft.assignments.length > 1 && (
                            <button
                              type="button"
                              className="btn-remove self-start max-sm:min-w-11 max-sm:min-h-11"
                              onClick={() => removeAssignment(assignment.key)}
                              aria-label={`Remove event ${index + 1}`}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      ))}

                      <FieldError id="team-assignments-error" message={errors.assignments} />

                      {draft.assignments.length < events.length && (
                        <button type="button" className="btn-add self-start" onClick={addAssignment}>
                          <Plus size={16} aria-hidden="true" /> Assign another event
                        </button>
                      )}
                    </div>
                  )}
                </fieldset>
              )}
            </div>

            <div className="admin-modal-footer p-6 border-t border-white/10 flex justify-end items-center gap-3 bg-black/20 shrink-0">
              <button
                type="button"
                onClick={closeModal}
                disabled={isSubmitting}
                className="btn-cancel bg-transparent border-none cursor-pointer"
              >
                Cancel
              </button>
              <button type="submit" className="btn-light" disabled={isSubmitting}>
                {editing ? <UserCog size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                {isSubmitting ? 'Saving' : editing ? 'Save Changes' : 'Send Invitation'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
