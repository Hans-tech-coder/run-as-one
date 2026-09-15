"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Edit, CheckCircle, Trash2, Plus, Clock } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import AdminCardList, { AdminCardListSkeleton } from '@/app/admin/AdminCardList';
import AdminCardEdit from '@/app/admin/AdminCardEdit';

/**
 * The shared list of running clubs every event's registration form suggests.
 *
 * Runners write in clubs that are not on the list yet. Those arrive here as
 * PENDING and stay out of everyone else's suggestions until they are approved,
 * so one person's typo never becomes the name the next fifty people click.
 */

interface Community {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  /** Runners who have registered under this name. Zero usually means a typo. */
  runnerCount: number;
}

export default function CommunitiesManagementPage() {
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

  const fetchCommunities = async () => {
    try {
      const res = await fetch('/api/superadmin/communities');
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
    send(`/api/superadmin/communities/${c.id}`, {
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
    await send(`/api/superadmin/communities/${c.id}`, { method: 'DELETE' });
  };

  const startRename = (c: Community) => {
    setEditingId(c.id);
    setEditName(c.name);
  };

  const saveName = async (c: Community) => {
    const ok = await send(`/api/superadmin/communities/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    });
    if (ok) setEditingId(null);
  };

  const addCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const ok = await send('/api/superadmin/communities', {
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

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Running Communities</h1>
      </header>

      <div className="admin-content">
        {pendingCount > 0 && (
          <div
            className="admin-panel"
            style={{ marginBottom: '24px', borderColor: 'rgba(255, 107, 43, 0.4)' }}
          >
            <div className="flex items-center gap-3 p-4">
              <Clock size={20} className="text-accent-orange shrink-0" />
              <div className="text-sm">
                <strong className="text-white">
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

        <div className="admin-panel">
          <div className="admin-toolbar">
            <div className="search-wrapper">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Search clubs..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="search-input"
              />
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

          <div className="data-table-wrapper dash-desktop-only">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Runners</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-secondary">
                      Loading clubs...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-secondary">
                      No clubs found.
                    </td>
                  </tr>
                ) : (
                  filtered.map(c => (
                    <tr key={c.id}>
                      <td className="font-medium text-primary">
                        {editingId === c.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              className="form-input py-1 px-2"
                              style={{ minHeight: '32px', minWidth: '240px' }}
                            />
                            <button
                              onClick={() => saveName(c)}
                              disabled={isSaving}
                              className="text-accent-blue text-sm"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-secondary text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          c.name
                        )}
                      </td>
                      <td>{c.runnerCount}</td>
                      <td>
                        <ClubStatus status={c.status} />
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <ClubActions
                            club={c}
                            saving={isSaving}
                            onApprove={approve}
                            onRename={startRename}
                            onRemove={reject}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* The same filtered list as the table, below `lg` (AdminCardList).
              A rename opens under the runner count as a full-width edit block,
              the club's current name still in the title above it. */}
          <div className="dash-mobile-only">
            <AdminCardList
              items={isLoading ? [] : filtered}
              getKey={c => c.id}
              label="Running clubs"
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
              actions={c => (
                <ClubActions
                  club={c}
                  saving={isSaving}
                  renaming={editingId === c.id}
                  onApprove={approve}
                  onRename={startRename}
                  onRemove={reject}
                  labelled
                />
              )}
              empty={
                // While it loads, the list's own shape rather than a line of
                // text the cards then push down (PROJECT_GUIDE §9).
                isLoading ? (
                  <AdminCardListSkeleton cards={4} fields={1} />
                ) : (
                  <div className="py-12 px-4 text-center text-secondary">No clubs found.</div>
                )
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}

/** One badge for the table's cell and the card. */
function ClubStatus({ status }: { status: string }) {
  return (
    <span className={`status-badge ${status === 'APPROVED' ? 'success' : 'pending'}`}>
      {status}
    </span>
  );
}

/**
 * Approve, Rename and Remove. The table keeps its icon-only chips, named by
 * their titles; a card spells them out, since a phone has no hover. Remove
 * still asks first — `reject` holds the AlertProvider confirm for both.
 */
function ClubActions({
  club,
  saving,
  renaming = false,
  onApprove,
  onRename,
  onRemove,
  labelled = false,
}: {
  club: Community;
  saving: boolean;
  /** A card hides Rename while its own edit block is open. */
  renaming?: boolean;
  onApprove: (c: Community) => void;
  onRename: (c: Community) => void;
  onRemove: (c: Community) => void;
  labelled?: boolean;
}) {
  const iconOnly = labelled ? undefined : { padding: '0 10px' };
  return (
    <>
      {club.status !== 'APPROVED' && (
        <button
          type="button"
          onClick={() => onApprove(club)}
          disabled={saving}
          className="btn-filter is-success"
          title={labelled ? undefined : 'Approve club'}
          style={iconOnly}
        >
          <CheckCircle size={16} aria-hidden={labelled || undefined} />
          {labelled && 'Approve'}
        </button>
      )}
      {!renaming && (
        <button
          type="button"
          onClick={() => onRename(club)}
          className="btn-filter"
          title={labelled ? undefined : 'Rename club'}
          style={iconOnly}
        >
          <Edit size={16} aria-hidden={labelled || undefined} />
          {labelled && 'Rename'}
        </button>
      )}
      <button
        type="button"
        onClick={() => onRemove(club)}
        disabled={saving}
        className="btn-filter is-danger"
        title={labelled ? undefined : 'Remove from list'}
        style={iconOnly}
      >
        <Trash2 size={16} aria-hidden={labelled || undefined} />
        {labelled && 'Remove'}
      </button>
    </>
  );
}
