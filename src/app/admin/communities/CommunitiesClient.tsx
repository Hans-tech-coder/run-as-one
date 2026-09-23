"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Edit, Check, CheckCircle, Trash2, Plus, Clock, X } from 'lucide-react';
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useAlert } from '@/components/ui/AlertProvider';
import AdminCardList, { AdminCardListSkeleton } from '@/app/admin/AdminCardList';
import AdminCardEdit from '@/app/admin/AdminCardEdit';
import AdminDataTable, { AdminColumnsMenu, rowPosition } from '@/app/admin/AdminDataTable';
import AdminTablePager from '@/app/admin/AdminTablePager';
import MobileSortMenu from '@/app/admin/MobileSortMenu';
import RowActionsMenu from '@/app/admin/RowActionsMenu';
import DashboardHeader from '@/app/admin/DashboardHeader';

/**
 * The shared list of running clubs every event's registration form suggests.
 *
 * Runners write in clubs that are not on the list yet. Those arrive here as
 * PENDING and stay out of everyone else's suggestions until they are approved,
 * so one person's typo never becomes the name the next fifty people click.
 *
 * The list wears the events table's furniture (`AdminDataTable`, §9). A rename
 * opens in the Club cell on the table and under the count on a card; the
 * draft reaches the cell through the table's `meta` rather than the column
 * list, because rebuilding the columns on every keystroke would remount the
 * cell and take the cursor out of the box.
 */

/** What the Club and Actions cells read that changes while the list is open. */
type ClubTableMeta = {
  editingId: string | null;
  editName: string;
  isSaving: boolean;
  setEditName: (name: string) => void;
  saveName: (c: Community) => void;
  cancelRename: () => void;
  approve: (c: Community) => void;
  startRename: (c: Community) => void;
  reject: (c: Community) => void;
};

interface Community {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  /** Runners who have registered under this name. Zero usually means a typo. */
  runnerCount: number;
}

export default function CommunitiesClient() {
  // Shadows window.alert / window.confirm on purpose — see AlertProvider.
  const { alert, confirm } = useAlert();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // One rename draft for both layouts, so it survives a resize across `lg`.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const fetchCommunities = async () => {
    try {
      const res = await fetch('/api/admin/communities');
      if (res.ok) {
        const data = await res.json();
        setCommunities(data.communities);
      }
    } catch (error) {
      console.error('Failed to fetch running communities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCommunities();
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
      await fetchCommunities();
      return true;
    } catch (error) {
      console.error(error);
      alert('An error occurred');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const approve = (c: Community) =>
    send(`/api/admin/communities/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'APPROVED' }),
    });

  const reject = async (c: Community) => {
    const warning =
      c.runnerCount > 0
        ? `${c.name} has ${c.runnerCount} runner${c.runnerCount === 1 ? '' : 's'} registered under it. Removing it only takes it out of the suggestions — their registrations keep the name. Continue?`
        : `Remove "${c.name}" from the list?`;
    const confirmed = await confirm({
      variant: 'danger',
      title: 'Remove from Suggestions',
      message: warning,
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    await send(`/api/admin/communities/${c.id}`, { method: 'DELETE' });
  };

  const startRename = (c: Community) => {
    setEditingId(c.id);
    setEditName(c.name);
  };

  const saveName = async (c: Community) => {
    const ok = await send(`/api/admin/communities/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    });
    if (ok) setEditingId(null);
  };

  const addCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const ok = await send('/api/admin/communities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    if (ok) setNewName('');
  };

  const pendingCount = useMemo(
    () => communities.filter(c => c.status === 'PENDING').length,
    [communities]
  );

  const filtered = useMemo(() => {
    const needle = searchTerm.trim().toUpperCase();
    if (!needle) return communities;
    return communities.filter(c => c.name.toUpperCase().includes(needle));
  }, [communities, searchTerm]);

  const meta: ClubTableMeta = {
    editingId,
    editName,
    isSaving,
    setEditName,
    saveName,
    cancelRename: () => setEditingId(null),
    approve,
    startRename,
    reject,
  };

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
      <DashboardHeader title="Running Communities" />

      <div className="admin-content">
        {pendingCount > 0 && (
          <div
            className="admin-panel"
            style={{ marginBottom: '24px', borderColor: 'rgba(255, 107, 43, 0.4)' }}
          >
            <div className="flex items-center gap-3 p-4">
              <Clock size={20} className="text-accent-orange-ink shrink-0" />
              <div className="text-sm">
                <strong className="text-primary">
                  {pendingCount} club{pendingCount === 1 ? '' : 's'} awaiting review
                </strong>
                <div className="text-secondary">
                  Runners wrote these in during registration. They stay out of the
                  suggestions on every event until you approve them.
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 w-full text-primary">
          <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
            <div className="toolbar-actions" style={{ flex: 1 }}>
              <div className="search-wrapper">
                <Search className="search-icon" size={16} />
                <input
                  type="text"
                  placeholder="Search clubs..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--ink-85)] bg-transparent border-none cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <AdminColumnsMenu table={table} />
              <MobileSortMenu table={table} />
            </div>
            {/* .toolbar-form: below `sm` the box and Add stack at full width. */}
            <form onSubmit={addCommunity} className="toolbar-actions toolbar-form flex gap-2">
              <input
                type="text"
                placeholder="Add a club..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="form-input"
                style={{ minHeight: '40px', minWidth: '200px' }}
              />
              <button type="submit" className="btn-filter" disabled={isSaving}>
                <Plus size={16} /> Add
              </button>
            </form>
          </div>

          <AdminDataTable table={table} empty="No clubs found." loading={isLoading} leadColumn="index" />

          {/* The same rows as the table, below `lg` (AdminCardList). A rename
              opens under the runner count as a full-width edit block, the
              club's current name still in the title above it. */}
          <div className="dash-mobile-only">
            <AdminCardList
              items={isLoading ? [] : table.getRowModel().rows.map(row => row.original)}
              getKey={c => c.id}
              label="Running clubs"
              className="is-flush"
              title={c => c.name}
              badges={c => <ClubStatus status={c.status} />}
              fields={c => [{ label: 'Runners', value: c.runnerCount }]}
              expanded={c =>
                editingId === c.id && (
                  <AdminCardEdit
                    label="New name"
                    // A sample, so uppercase — the way a club reads on a
                    // runner's registration.
                    placeholder="TEAM ARMY"
                    value={editName}
                    onChange={setEditName}
                    onSave={() => saveName(c)}
                    onCancel={() => setEditingId(null)}
                    saving={isSaving}
                  />
                )
              }
              // Approve one tap away while a club waits for it, since that is
              // what this list is worked for, and Rename once it is approved
              // (§9, a card's footer). Both stay in the menu too.
              actions={c => (
                <>
                  {c.status !== 'APPROVED' ? (
                    <button
                      type="button"
                      onClick={() => approve(c)}
                      disabled={isSaving}
                      className="btn-filter is-success"
                    >
                      <CheckCircle size={16} aria-hidden="true" /> Approve
                    </button>
                  ) : (
                    editingId !== c.id && (
                      <button type="button" onClick={() => startRename(c)} className="btn-filter">
                        <Edit size={16} aria-hidden="true" /> Rename
                      </button>
                    )
                  )}
                  <ClubMenu
                    club={c}
                    saving={isSaving}
                    renaming={editingId === c.id}
                    onApprove={approve}
                    onRename={startRename}
                    onRemove={reject}
                    className="ml-auto"
                  />
                </>
              )}
              empty={
                // While it loads, the list's own shape rather than a line of
                // text the cards then push down (PROJECT_GUIDE §9).
                isLoading ? (
                  <AdminCardListSkeleton cards={4} fields={1} className="is-flush" />
                ) : (
                  <div className="border border-[var(--dash-border)] rounded-lg py-16 px-4 text-center text-[var(--text-muted)]">
                    No clubs found.
                  </div>
                )
              }
            />
          </div>

          <AdminTablePager table={table} />
        </div>
      </div>
    </>
  );
}

const COLUMNS: ColumnDef<Community>[] = [
  {
    id: 'index',
    header: 'No.',
    cell: ({ row, table }) => (
      <span className="text-secondary font-mono">{rowPosition(table.getSortedRowModel().flatRows, row)}</span>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'name',
    header: 'Club',
    cell: ({ row, table }) => {
      const meta = table.options.meta as ClubTableMeta;
      const club = row.original;
      if (meta.editingId !== club.id) return <span className="font-medium text-primary">{club.name}</span>;
      return (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={meta.editName}
            onChange={e => meta.setEditName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') meta.saveName(club);
              if (e.key === 'Escape') meta.cancelRename();
            }}
            aria-label={`New name for ${club.name}`}
            placeholder="TEAM ARMY"
            className="form-input"
            style={{ height: '40px', minWidth: '240px' }}
            autoFocus
          />
          <button
            type="button"
            onClick={() => meta.saveName(club)}
            disabled={meta.isSaving}
            className="btn-filter is-success"
          >
            <Check size={16} aria-hidden="true" /> Save
          </button>
          <button type="button" onClick={meta.cancelRename} className="btn-filter">
            <X size={16} aria-hidden="true" /> Cancel
          </button>
        </div>
      );
    },
    enableHiding: false,
  },
  {
    accessorKey: 'runnerCount',
    header: 'Runners',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <ClubStatus status={row.original.status} />,
  },
  {
    // Left-aligned, under its own header label — never pushed to the row's
    // right edge.
    id: 'actions',
    header: 'Actions',
    cell: ({ row, table }) => {
      const meta = table.options.meta as ClubTableMeta;
      return (
        <ClubMenu
          club={row.original}
          saving={meta.isSaving}
          renaming={meta.editingId === row.original.id}
          onApprove={meta.approve}
          onRename={meta.startRename}
          onRemove={meta.reject}
        />
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
];

/** One badge for the table's cell and the card. */
function ClubStatus({ status }: { status: string }) {
  return (
    <span className={`status-badge ${status === 'APPROVED' ? 'success' : 'pending'}`}>
      {status}
    </span>
  );
}

/**
 * Approve, Rename and Remove, behind the row's ⋮ menu on the table and the
 * card alike. Remove still asks first — `reject` holds the AlertProvider
 * confirm for both.
 */
function ClubMenu({
  club,
  saving,
  renaming = false,
  onApprove,
  onRename,
  onRemove,
  className,
}: {
  club: Community;
  saving: boolean;
  /** Rename is withheld while this club's own rename box is open. */
  renaming?: boolean;
  onApprove: (c: Community) => void;
  onRename: (c: Community) => void;
  onRemove: (c: Community) => void;
  className?: string;
}) {
  return (
    <RowActionsMenu
      label={club.name}
      className={className}
      actions={[
        ...(club.status !== 'APPROVED'
          ? [{ key: 'approve', label: 'Approve', icon: <CheckCircle size={16} />, onSelect: () => onApprove(club), disabled: saving }]
          : []),
        ...(!renaming
          ? [{ key: 'rename', label: 'Rename', icon: <Edit size={16} />, onSelect: () => onRename(club) }]
          : []),
        { key: 'remove', label: 'Remove from List', icon: <Trash2 size={16} />, onSelect: () => onRemove(club), danger: true, disabled: saving },
      ]}
    />
  );
}
