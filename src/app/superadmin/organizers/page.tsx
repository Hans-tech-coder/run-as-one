"use client";

import React, { useEffect, useState } from 'react';
import { Search, CheckCircle, Ban, FileText } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import AdminCardList, { AdminCardListSkeleton } from '@/app/admin/AdminCardList';
import FilterChip from '@/app/admin/FilterChip';
import ApplicationPanel, { appliedOn, type OrganizerApplicationRow } from './ApplicationPanel';

/**
 * The organizer accounts, and the applications they were created from.
 *
 * A row opens its application in a panel over the list (ApplicationPanel), so
 * the super admin decides from everything the applicant wrote rather than from
 * a name and an address. On the table the whole row opens it, except its own
 * action controls; below `lg` a card opens it from a *Read application* button
 * instead — the choice `/superadmin/feedback` made, because a card carries its
 * own Approve and Suspend and a tap target covering all of them is a mis-tap
 * waiting to happen. Open is `openId`, read by both layouts.
 *
 * There is no fee editor here any more. `Organizer.adminFee` was edited on
 * this screen and read by nothing that charges a runner — the fee on an order
 * is `Event.adminFee`, which the organizer sets per event — so the control was
 * removed rather than left looking like it moved money.
 */

interface Organizer extends OrganizerApplicationRow {
  _count: {
    events: number;
  };
}

/** The states an account can be in, as the toolbar's chips name them. */
const STATUS_CHIPS = [
  { status: 'PENDING', label: 'Pending' },
  { status: 'APPROVED', label: 'Approved' },
  { status: 'SUSPENDED', label: 'Suspended' },
] as const;

type StatusFilter = 'ALL' | (typeof STATUS_CHIPS)[number]['status'];

export default function OrganizersManagementPage() {
  // Shadows window.alert / window.confirm on purpose — see AlertProvider.
  const { alert, confirm } = useAlert();
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // Which accounts are listed. The chips find rows and never sort them, so an
  // application approved from the Pending view leaves it rather than jumping
  // to another place in a list the owner is working down.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  // Whose application is open. An id rather than the row, so the panel reads
  // the refreshed row after a status change instead of a stale copy.
  const [openId, setOpenId] = useState<string | null>(null);

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

  const filteredOrganizers = organizers.filter(o =>
    (statusFilter === 'ALL' || o.status === statusFilter) &&
    (o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const pendingCount = organizers.filter(o => o.status === 'PENDING').length;
  // "None at all" and "none that match" are different news.
  const emptyMessage =
    organizers.length === 0 ? 'No organizers found.' : 'No organizers match this search and filter.';
  // Looked up in the whole list, not the filtered one: approving from the
  // Pending view must not snatch the panel away mid-read.
  const openOrganizer = openId ? organizers.find(o => o.id === openId) ?? null : null;

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
            {/* The feedback inbox's chips, one per status, with the waiting
                applications counted. The Filter button that stood here had no
                handler and no menu. Pressing the active chip shows everyone. */}
            <div className="toolbar-actions flex-wrap">
              {STATUS_CHIPS.map(({ status, label }) => (
                <FilterChip
                  key={status}
                  label={status === 'PENDING' && pendingCount ? `${label} (${pendingCount})` : label}
                  active={statusFilter === status}
                  onClick={() => setStatusFilter(statusFilter === status ? 'ALL' : status)}
                />
              ))}
            </div>
          </div>

          <div className="data-table-wrapper dash-desktop-only">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Organizer Details</th>
                  <th>Applied</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th>Actions</th>
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
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  filteredOrganizers.map((org) => (
                    <tr
                      key={org.id}
                      onClick={() => setOpenId(org.id)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setOpenId(org.id);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Read ${org.name}'s application`}
                      className="cursor-pointer"
                    >
                      <td className="font-medium text-primary">
                        <div>{org.name}</div>
                        <div className="text-xs text-secondary font-normal">{org.email}</div>
                      </td>
                      <td className="whitespace-nowrap text-secondary">{appliedOn(org.createdAt)}</td>
                      <td>{org._count.events}</td>
                      <td>
                        <OrganizerStatus status={org.status} />
                      </td>
                      {/* Left-aligned, under its own header label. The cell
                          swallows the click, so deciding never opens the panel. */}
                      <td onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setOpenId(org.id)}
                            className="btn-filter"
                            title="Read application"
                            aria-label={`Read ${org.name}'s application`}
                            style={{ padding: '0 10px' }}
                          >
                            <FileText size={16} />
                          </button>
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
              A card opens its application from its own button, never from a
              tap anywhere — see the note at the top of this file. */}
          <div className="dash-mobile-only">
            <AdminCardList
              items={isLoading ? [] : filteredOrganizers}
              getKey={org => org.id}
              label="Organizer accounts"
              title={org => org.name}
              subtitle={org => org.email}
              badges={org => <OrganizerStatus status={org.status} />}
              fields={org => [
                { label: 'Applied', value: appliedOn(org.createdAt) },
                { label: 'Events', value: org._count.events },
              ]}
              actions={org => (
                <>
                  <button type="button" className="btn-filter" onClick={() => setOpenId(org.id)}>
                    <FileText size={16} aria-hidden="true" /> Read application
                  </button>
                  <StatusActions org={org} onChange={handleStatusChange} labelled />
                </>
              )}
              empty={
                // While it loads, the list's own shape rather than a line of
                // text the cards then push down (PROJECT_GUIDE §9).
                isLoading ? (
                  <AdminCardListSkeleton cards={3} fields={2} />
                ) : (
                  <div className="py-12 px-4 text-center text-secondary">{emptyMessage}</div>
                )
              }
            />
          </div>
        </div>
      </div>

      {openOrganizer && (
        <ApplicationPanel
          key={openOrganizer.id}
          organizer={openOrganizer}
          statusBadge={<OrganizerStatus status={openOrganizer.status} />}
          actions={<StatusActions org={openOrganizer} onChange={handleStatusChange} labelled />}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

/** One badge for the table's cell, the card and the panel, so they cannot drift. */
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
 * header, named by their titles; a card and the panel spell them out, because
 * a phone has no hover to read a title from. The tones are the chip classes in
 * Admin.css — a Tailwind colour utility loses to the unlayered .btn-filter.
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
          aria-label={labelled ? undefined : 'Approve Organizer'}
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
          aria-label={labelled ? undefined : 'Suspend Organizer'}
          style={iconOnly}
        >
          <Ban size={16} aria-hidden={labelled || undefined} />
          {labelled && 'Suspend'}
        </button>
      )}
    </>
  );
}
