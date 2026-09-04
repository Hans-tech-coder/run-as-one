"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Edit, CheckCircle, Trash2, Plus, Clock } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';

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
            <form onSubmit={addCommunity} className="toolbar-actions flex gap-2">
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

          <div className="data-table-wrapper">
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
                        <span
                          className={`status-badge ${c.status === 'APPROVED' ? 'success' : 'pending'}`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          {c.status !== 'APPROVED' && (
                            <button
                              onClick={() => approve(c)}
                              disabled={isSaving}
                              className="btn-filter hover:text-green-500"
                              title="Approve club"
                              style={{ padding: '0 10px' }}
                            >
                              <CheckCircle size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingId(c.id);
                              setEditName(c.name);
                            }}
                            className="btn-filter"
                            title="Rename club"
                            style={{ padding: '0 10px' }}
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => reject(c)}
                            disabled={isSaving}
                            className="btn-filter hover:text-red-500"
                            title="Remove from list"
                            style={{ padding: '0 10px', color: '#ff4d4f' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
