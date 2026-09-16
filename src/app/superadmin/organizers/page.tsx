"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Search, CheckCircle, Ban, FileText, XCircle } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import AdminCardList, { AdminCardListSkeleton } from '@/app/admin/AdminCardList';
import FilterChip from '@/app/admin/FilterChip';
import ApplicationPanel, { appliedOn, type OrganizerApplicationRow } from './ApplicationPanel';
import RejectDialog, { type RejectResult } from './RejectDialog';
import {
  ORGANIZER_STATUSES,
  ORGANIZER_STATUS_COPY,
  decisionsFrom,
  organizerStatusBadge,
  organizerStatusLabel,
  type OrganizerStatus as OrganizerStatusCode,
} from '@/lib/organizer-status';

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
 * The decisions on offer come from `decisionsFrom` (lib/organizer-status.ts),
 * so a row, a card and the panel offer the same ones the PATCH route accepts: a
 * pending application is approved or **rejected**, an approved account
 * suspended, a suspended or rejected one approved. Approve and suspend ask the
 * shared `confirm`; reject opens RejectDialog, because a rejection cannot be
 * saved without its reason.
 *
 * Approving and rejecting email the applicant (the PATCH route sends after the
 * status is saved). A sent email is announced in the toast; one that did not go
 * out is an alert naming the address and phone, because the decision stands and
 * the applicant still has to hear about it somehow.
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

type StatusFilter = 'ALL' | OrganizerStatusCode;

/** Whether the applicant was told: null when the decision emails nobody. */
type EmailReport = { emailSent: boolean | null; emailError: string | null };

export default function OrganizersManagementPage() {
  // Shadows window.alert / window.confirm on purpose — see AlertProvider.
  const { alert, confirm, toast } = useAlert();
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
  // The application being rejected, while its reason is being written.
  const [rejecting, setRejecting] = useState<Organizer | null>(null);
  // What the rejection's email did, held until the dialog has closed: the
  // report may be an alert, and it must not open over a dialog still leaving.
  const rejectEmail = useRef<EmailReport | null>(null);

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

  /** Sends one decision. Answers with the route's refusal; never throws. */
  const sendDecision = async (
    id: string,
    status: OrganizerStatusCode,
    note?: string,
  ): Promise<RejectResult & { email?: EmailReport }> => {
    try {
      const res = await fetch(`/api/superadmin/organizers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note }),
      });
      const data = await res.json().catch(() => ({}));
      // Refreshed whatever the answer: a 409 means the row moved under us,
      // and the list should show where it went.
      fetchOrganizers();
      if (res.ok) {
        return {
          ok: true,
          email: { emailSent: data?.emailSent ?? null, emailError: data?.emailError ?? null },
        };
      }
      return {
        ok: false,
        fieldError: data?.errors?.note,
        error: data?.error ?? 'The status could not be changed. Please try again.',
      };
    } catch (error) {
      console.error(error);
      return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
    }
  };

  /**
   * A success is announced, never made to be dismissed (PROJECT_GUIDE §9) —
   * unless its email did not go out. That is something to act on, so it is an
   * alert, the same call `/admin/team` makes for an invitation that never left.
   */
  const announce = async (org: Organizer, status: OrganizerStatusCode, email?: EmailReport | null) => {
    const decided = `${org.name} ${organizerStatusLabel(status).toLowerCase()}`;
    if (!email || email.emailSent === null) {
      toast({ variant: 'success', message: `${decided}.` });
    } else if (email.emailSent) {
      toast({ variant: 'success', message: `${decided}. The applicant has been emailed at ${org.email}.` });
    } else {
      const reach = org.phone ? `${org.email} or ${org.phone}` : org.email;
      await alert({
        variant: 'error',
        title: `${organizerStatusLabel(status)}, but the email did not go out`,
        message: `${email.emailError ?? 'The email could not be sent.'} The decision is saved. Let the applicant know directly at ${reach}.`,
      });
    }
  };

  const handleDecision = async (org: Organizer, status: OrganizerStatusCode) => {
    if (status === 'REJECTED') {
      setRejecting(org);
      return;
    }

    const confirmed = await confirm(
      status === 'SUSPENDED'
        ? {
            variant: 'danger',
            title: 'Suspend This Organizer',
            message: `${org.name} and its staff will no longer be able to sign in. Its events and registrations are kept, and you can approve the account again later.`,
            confirmLabel: 'Suspend',
          }
        : {
            variant: 'info',
            title: org.status === 'PENDING' ? 'Approve This Application' : 'Approve This Organizer',
            message: `${org.name} will be able to sign in, publish events and take registrations.`,
            confirmLabel: 'Approve',
          },
    );
    if (!confirmed) return;

    const result = await sendDecision(org.id, status);
    if (result.ok) await announce(org, status, result.email);
    else if (result.error) alert(result.error);
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
              {ORGANIZER_STATUSES.map(status => {
                const { label } = ORGANIZER_STATUS_COPY[status];
                return (
                  <FilterChip
                    key={status}
                    label={status === 'PENDING' && pendingCount ? `${label} (${pendingCount})` : label}
                    active={statusFilter === status}
                    onClick={() => setStatusFilter(statusFilter === status ? 'ALL' : status)}
                  />
                );
              })}
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
                          <StatusActions org={org} onDecide={handleDecision} />
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
                  <StatusActions org={org} onDecide={handleDecision} labelled />
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
          actions={<StatusActions org={openOrganizer} onDecide={handleDecision} labelled />}
          onClose={() => setOpenId(null)}
        />
      )}

      {rejecting && (
        <RejectDialog
          key={rejecting.id}
          organizerName={rejecting.name}
          onSubmit={async note => {
            const result = await sendDecision(rejecting.id, 'REJECTED', note);
            rejectEmail.current = result.ok ? (result.email ?? null) : null;
            return result;
          }}
          onDone={error => {
            const org = rejecting;
            const email = rejectEmail.current;
            rejectEmail.current = null;
            setRejecting(null);
            if (error) alert(error);
            else if (email) announce(org, 'REJECTED', email);
          }}
        />
      )}
    </>
  );
}

/** One badge for the table's cell, the card and the panel, so they cannot drift.
 *  Label and tone come from lib/organizer-status.ts, never the stored code. */
function OrganizerStatus({ status }: { status: string }) {
  return (
    <span className={`status-badge ${organizerStatusBadge(status)}`}>
      {organizerStatusLabel(status)}
    </span>
  );
}

/** How each decision is drawn. Reject and Suspend share the danger tone: both
 *  stop somebody signing in. */
const DECISION_BUTTONS: Record<
  OrganizerStatusCode,
  { label: string; title: string; Icon: typeof CheckCircle; tone: string }
> = {
  APPROVED: { label: 'Approve', title: 'Approve Organizer', Icon: CheckCircle, tone: 'is-success' },
  REJECTED: { label: 'Reject', title: 'Reject Application', Icon: XCircle, tone: 'is-danger' },
  SUSPENDED: { label: 'Suspend', title: 'Suspend Organizer', Icon: Ban, tone: 'is-danger' },
  // Never offered — decisionsFrom does not return it. Here to keep the record total.
  PENDING: { label: 'Move to Pending', title: 'Move to Pending', Icon: FileText, tone: '' },
};

/**
 * The decisions this account's status allows (`decisionsFrom`). The table
 * keeps its icon-only chips under the Actions header, named by their titles; a
 * card and the panel spell them out, because a phone has no hover to read a
 * title from. The tones are the chip classes in Admin.css — a Tailwind colour
 * utility loses to the unlayered .btn-filter.
 */
function StatusActions({
  org,
  onDecide,
  labelled = false,
}: {
  org: Organizer;
  onDecide: (org: Organizer, status: OrganizerStatusCode) => void;
  labelled?: boolean;
}) {
  const iconOnly = labelled ? undefined : { padding: '0 10px' };
  return (
    <>
      {decisionsFrom(org.status).map(status => {
        const { label, title, Icon, tone } = DECISION_BUTTONS[status];
        return (
          <button
            key={status}
            type="button"
            onClick={() => onDecide(org, status)}
            className={`btn-filter ${tone}`}
            title={labelled ? undefined : title}
            aria-label={labelled ? undefined : title}
            style={iconOnly}
          >
            <Icon size={16} aria-hidden={labelled || undefined} />
            {labelled && label}
          </button>
        );
      })}
    </>
  );
}
