"use client";

import React, { useEffect, useState } from 'react';
import { Search, Filter, Edit, CheckCircle, Ban } from 'lucide-react';
import { formatPesos, toPesos } from '@/lib/money';
import { useAlert } from '@/components/ui/AlertProvider';
import AdminCardList from '@/app/admin/AdminCardList';
import AdminCardEdit from '@/app/admin/AdminCardEdit';

interface Organizer {
  id: string;
  name: string;
  email: string;
  status: string;
  /** Centavos, as stored. The edit input below works in pesos. */
  adminFee: number;
  createdAt: string;
  _count: {
    events: number;
  };
}

export default function OrganizersManagementPage() {
  // Shadows window.alert / window.confirm on purpose — see AlertProvider.
  const { alert, confirm } = useAlert();
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Edit state. One draft for both layouts: the table's cell and the card's
  // edit block read the same pair, so an edit survives a resize across `lg`.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAdminFee, setEditAdminFee] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const fetchOrganizers = async () => {
    try {
      const res = await fetch('/api/superadmin/organizers');
      if (res.ok) {
        const data = await res.json();
        setOrganizers(data.organizers);
      }
    } catch (error) {
      console.error('Failed to fetch organizers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizers();
  }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const confirmed = await confirm({
      variant: 'info',
      title: 'Change Organizer Status',
      message: `Are you sure you want to change this organizer's status to ${newStatus}?`,
      confirmLabel: `Set to ${newStatus}`,
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/superadmin/organizers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        fetchOrganizers(); // Refresh list
      } else {
        alert('Failed to update status');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred');
    }
  };

  const startEditing = (org: Organizer) => {
    setEditingId(org.id);
    // The input shows pesos; the PATCH route converts back to centavos.
    setEditAdminFee(toPesos(org.adminFee));
  };

  const saveAdminFee = async (id: string) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/superadmin/organizers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminFee: editAdminFee }),
      });

      if (res.ok) {
        setEditingId(null);
        fetchOrganizers(); // Refresh list
      } else {
        alert('Failed to update admin fee');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredOrganizers = organizers.filter(o =>
    o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Organizer Accounts</h1>
      </header>

      <div className="admin-content">
        <div className="admin-panel">
          <div className="admin-toolbar">
            <div className="search-wrapper">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="toolbar-actions">
              <button className="btn-filter">
                <Filter size={16} /> Filter
              </button>
            </div>
          </div>

          <div className="data-table-wrapper dash-desktop-only">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Organizer Details</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th>Admin Fee</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-secondary">
                      Loading organizers...
                    </td>
                  </tr>
                ) : filteredOrganizers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-secondary">
                      No organizers found.
                    </td>
                  </tr>
                ) : (
                  filteredOrganizers.map((org) => (
                    <tr key={org.id}>
                      <td className="font-medium text-primary">
                        <div>{org.name}</div>
                        <div className="text-xs text-secondary font-normal">{org.email}</div>
                      </td>
                      <td>{org._count.events}</td>
                      <td>
                        <OrganizerStatus status={org.status} />
                      </td>
                      <td>
                        {editingId === org.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-secondary">₱</span>
                            <input
                              type="number"
                              value={editAdminFee}
                              onChange={(e) => setEditAdminFee(Number(e.target.value))}
                              className="form-input py-1 px-2"
                              style={{ width: '80px', minHeight: '32px' }}
                            />
                            <button
                              onClick={() => saveAdminFee(org.id)}
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
                          <div className="flex items-center gap-3">
                            <span>₱{formatPesos(org.adminFee)}</span>
                            <button onClick={() => startEditing(org)} className="text-secondary hover:text-accent-blue" title="Edit Admin Fee">
                              <Edit size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <StatusActions org={org} onChange={handleStatusChange} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* The same filtered list as the table, below `lg` (AdminCardList).
              The fee's edit opens under the fields as its own full-width
              block, so the current fee is still on screen while the new one is
              typed; it is the same draft the table's cell edits. */}
          <div className="dash-mobile-only">
            <AdminCardList
              items={isLoading ? [] : filteredOrganizers}
              getKey={org => org.id}
              label="Organizer accounts"
              title={org => org.name}
              subtitle={org => org.email}
              badges={org => <OrganizerStatus status={org.status} />}
              fields={org => [
                { label: 'Events', value: org._count.events },
                { label: 'Admin Fee', value: `₱${formatPesos(org.adminFee)}` },
              ]}
              expanded={org =>
                editingId === org.id && (
                  <AdminCardEdit
                    label="Admin fee per runner"
                    prefix="₱"
                    type="number"
                    inputMode="decimal"
                    value={editAdminFee}
                    onChange={value => setEditAdminFee(Number(value))}
                    onSave={() => saveAdminFee(org.id)}
                    onCancel={() => setEditingId(null)}
                    saving={isSaving}
                  />
                )
              }
              actions={org => (
                <>
                  {editingId !== org.id && (
                    <button type="button" className="btn-filter" onClick={() => startEditing(org)}>
                      <Edit size={16} aria-hidden="true" /> Edit Fee
                    </button>
                  )}
                  <StatusActions org={org} onChange={handleStatusChange} labelled />
                </>
              )}
              empty={
                <div className="py-12 px-4 text-center text-secondary">
                  {isLoading ? 'Loading organizers...' : 'No organizers found.'}
                </div>
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}

/** One badge for the table's cell and the card, so the two cannot drift. */
function OrganizerStatus({ status }: { status: string }) {
  return (
    <span className={`status-badge ${
      status === 'APPROVED' ? 'success' :
      status === 'SUSPENDED' ? 'pending' : ''
    }`} style={status === 'PENDING' ? { background: 'rgba(255, 255, 255, 0.1)', color: 'white' } : {}}>
      {status}
    </span>
  );
}

/**
 * Approve and Suspend. The table keeps its icon-only chips under the Actions
 * header, named by their titles; a card spells them out, because a phone has
 * no hover to read a title from. The tones are the chip classes in Admin.css —
 * a Tailwind colour utility loses to the unlayered .btn-filter.
 */
function StatusActions({
  org,
  onChange,
  labelled = false,
}: {
  org: Organizer;
  onChange: (id: string, status: string) => void;
  labelled?: boolean;
}) {
  const iconOnly = labelled ? undefined : { padding: '0 10px' };
  return (
    <>
      {org.status !== 'APPROVED' && (
        <button
          type="button"
          onClick={() => onChange(org.id, 'APPROVED')}
          className="btn-filter is-success"
          title={labelled ? undefined : 'Approve Organizer'}
          style={iconOnly}
        >
          <CheckCircle size={16} aria-hidden={labelled || undefined} />
          {labelled && 'Approve'}
        </button>
      )}

      {org.status !== 'SUSPENDED' && (
        <button
          type="button"
          onClick={() => onChange(org.id, 'SUSPENDED')}
          className="btn-filter is-danger"
          title={labelled ? undefined : 'Suspend Organizer'}
          style={iconOnly}
        >
          <Ban size={16} aria-hidden={labelled || undefined} />
          {labelled && 'Suspend'}
        </button>
      )}
    </>
  );
}
