"use client";

import React, { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, FileText, Search, Send } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import AdminCardList, { AdminCardListSkeleton } from '@/app/admin/AdminCardList';
import FilterChip from '@/app/admin/FilterChip';
import ApplicationPanel, { appliedOn, type ClientApplicationRow } from './ApplicationPanel';
import InviteDialog, { type InviteResult } from './InviteDialog';
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_COPY,
  canMoveClient,
  clientContactName,
  clientStatusLabel,
  type ClientStatus,
} from '@/lib/client';

/**
 * The client submissions — every organization that applied through
 * `/admin/register`, and what Run As One has done about it
 * (ADMIN_MERGE_PLAN.md, Batch 3). It replaced the organizer accounts screen,
 * whose approve / reject / suspend flow no longer exists: a submission is not
 * decided, it waits here until staff are ready to run a race for it and press
 * **Send invite**.
 *
 * A row opens the application in a panel over the list (ApplicationPanel). On
 * the table the whole row opens it, except its own action controls; below
 * `lg` a card opens it from a *Read application* button instead — the choice
 * `/admin/feedback` made, because a card carries its own Send invite and
 * Archive and a tap target covering all of them is a mis-tap waiting to
 * happen. Open is `openId`, read by both layouts.
 *
 * **The chips find, they never sort**, so a submission invited from the New
 * view leaves it rather than jumping somewhere else in a list staff are
 * working down. With no chip pressed the list is every **live** submission;
 * archived ones are out of the queue by definition (lib/client.ts) and are
 * found under their own chip, which is what the empty state says.
 *
 * What each row offers comes from `canMoveClient`, the rule the routes run:
 * Send invite from New, Invited or Active — worded *Resend invite* while an
 * invitation is still waiting, since that press replaces its link — Archive
 * from anything live, and Restore from Archived. Archiving asks the shared
 * `confirm`, because it signs the client's viewers out.
 *
 * A sent invitation is announced in a toast; one whose email did not go out is
 * an alert naming the reason, the same call `/admin/team` makes, because the
 * person is waiting on a link that never left.
 */

interface ClientRow extends ClientApplicationRow {
  _count: { events: number };
}

type StatusFilter = 'LIVE' | ClientStatus;

/** The invitation this client is waiting on, if one has not been accepted. */
function waitingViewer(client: ClientRow) {
  return client.viewers.find(viewer => !viewer.acceptedAt) ?? null;
}

export default function ClientsClient() {
  // Shadows window.alert / window.confirm on purpose — see AlertProvider.
  const { alert, confirm, toast } = useAlert();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('LIVE');
  // An id rather than the row, so the panel reads the refreshed row after an
  // invite or an archive instead of a stale copy.
  const [openId, setOpenId] = useState<string | null>(null);
  // The client an invitation is being written for.
  const [inviting, setInviting] = useState<ClientRow | null>(null);

  const loadClients = async (): Promise<ClientRow[] | null> => {
    try {
      const res = await fetch('/api/admin/clients');
      if (!res.ok) return null;
      const data = await res.json();
      return data.clients;
    } catch (error) {
      console.error('Failed to fetch clients:', error);
      return null;
    }
  };

  const fetchClients = () =>
    loadClients().then(rows => {
      if (rows) setClients(rows);
      setIsLoading(false);
    });

  useEffect(() => {
    let cancelled = false;
    loadClients().then(rows => {
      if (cancelled) return;
      if (rows) setClients(rows);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Sends one invitation. Answers with the route's refusal; never throws. */
  const sendInvite = async (
    client: ClientRow,
    invitee: { name: string; email: string },
  ): Promise<InviteResult> => {
    try {
      const res = await fetch(`/api/admin/clients/${client.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invitee),
      });
      const data = await res.json().catch(() => ({}));
      // Refreshed whatever the answer: a 409 may mean the row moved under us.
      fetchClients();
      if (!res.ok) {
        return {
          ok: false,
          errors: data?.errors,
          error: data?.error ?? 'The invitation could not be sent. Please try again.',
        };
      }

      if (data.reactivated) {
        toast({
          variant: 'success',
          message: `${data.name} already had a sign-in for ${client.name}, so the client is active again.`,
        });
      } else if (data.emailSent) {
        toast({
          variant: 'success',
          message: `${data.resent ? 'Invitation resent' : 'Invitation sent'} to ${data.name} at ${invitee.email}.`,
        });
      } else {
        // After the dialog has closed, so the alert never opens over it.
        window.setTimeout(() => {
          alert({
            variant: 'error',
            title: 'Invitation saved, but the email did not go out',
            message: `${data.emailError ?? 'The email could not be sent.'} Use Resend invite to try again, or let ${data.name} know at ${invitee.email}.`,
          });
        }, 200);
      }
      return { ok: true };
    } catch (error) {
      console.error(error);
      return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
    }
  };

  const moveClient = async (client: ClientRow, move: 'archive' | 'restore') => {
    const confirmed = await confirm(
      move === 'archive'
        ? {
            variant: 'danger',
            title: 'Archive This Client',
            message: `${client.name} leaves the submissions list, and anyone signing in for it is signed out. Nothing is deleted — you can restore it from Archived.`,
            confirmLabel: 'Archive',
          }
        : {
            variant: 'info',
            title: 'Restore This Client',
            message: `${client.name} goes back to the list as New. Nobody can sign in for it until you send an invite.`,
            confirmLabel: 'Restore',
          },
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: move === 'archive' ? 'ARCHIVED' : 'NEW' }),
      });
      const data = await res.json().catch(() => ({}));
      fetchClients();
      if (res.ok) {
        toast({
          variant: 'success',
          message: `${client.name} ${move === 'archive' ? 'archived' : 'restored as New'}.`,
        });
      } else {
        alert(data?.error ?? 'The client could not be changed. Please try again.');
      }
    } catch (error) {
      console.error(error);
      alert('Could not reach the server. Check your connection and try again.');
    }
  };

  const term = searchTerm.trim().toLowerCase();
  const filteredClients = clients.filter(
    c =>
      (statusFilter === 'LIVE' ? c.status !== 'ARCHIVED' : c.status === statusFilter) &&
      (!term ||
        c.name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        clientContactName(c).toLowerCase().includes(term)),
  );
  const newCount = clients.filter(c => c.status === 'NEW').length;
  const archivedCount = clients.filter(c => c.status === 'ARCHIVED').length;
  // "None at all", "none waiting" and "none that match" are different news.
  const emptyMessage =
    clients.length === 0
      ? 'No submissions yet. Applications sent from the organizer form land here.'
      : term
        ? 'No clients match this search and filter.'
        : statusFilter === 'LIVE' && archivedCount > 0
          ? `No live submissions. ${archivedCount} archived ${archivedCount === 1 ? 'one is' : 'ones are'} under Archived.`
          : `No ${statusFilter === 'LIVE' ? '' : `${clientStatusLabel(statusFilter).toLowerCase()} `}clients.`;
  // Looked up in the whole list, not the filtered one: inviting from the New
  // view must not snatch the panel away mid-read.
  const openClient = openId ? clients.find(c => c.id === openId) ?? null : null;

  const actionsFor = (client: ClientRow, labelled: boolean) => (
    <ClientActions
      client={client}
      labelled={labelled}
      onInvite={() => setInviting(client)}
      onMove={move => moveClient(client, move)}
    />
  );

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Clients</h1>
      </header>

      <div className="admin-content">
        <div className="admin-panel">
          <div className="admin-toolbar">
            <div className="search-wrapper">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Search by name, contact or email..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            {/* One chip per status, the waiting submissions counted. Pressing
                the active chip goes back to every live submission. */}
            <div className="toolbar-actions flex-wrap">
              {CLIENT_STATUSES.map(status => {
                const { label } = CLIENT_STATUS_COPY[status];
                return (
                  <FilterChip
                    key={status}
                    label={status === 'NEW' && newCount ? `${label} (${newCount})` : label}
                    active={statusFilter === status}
                    onClick={() => setStatusFilter(statusFilter === status ? 'LIVE' : status)}
                  />
                );
              })}
            </div>
          </div>

          <div className="data-table-wrapper dash-desktop-only">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Applied</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-secondary">
                      Loading clients...
                    </td>
                  </tr>
                ) : filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-secondary">
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  filteredClients.map(client => (
                    <tr
                      key={client.id}
                      onClick={() => setOpenId(client.id)}
                      onKeyDown={e => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setOpenId(client.id);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Read ${client.name}'s application`}
                      className="cursor-pointer"
                    >
                      <td className="font-medium text-primary">
                        <div>{client.name}</div>
                        <div className="text-xs text-secondary font-normal">{client.email}</div>
                      </td>
                      <td className="text-secondary">{clientContactName(client) || '—'}</td>
                      <td className="whitespace-nowrap text-secondary">{appliedOn(client.createdAt)}</td>
                      <td>{client._count.events}</td>
                      <td>
                        <ClientStatusBadge status={client.status} />
                      </td>
                      {/* Left-aligned, under its own header label. The cell
                          swallows the click, so acting never opens the panel. */}
                      <td onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setOpenId(client.id)}
                            className="btn-filter"
                            title="Read application"
                            aria-label={`Read ${client.name}'s application`}
                            style={{ padding: '0 10px' }}
                          >
                            <FileText size={16} />
                          </button>
                          {actionsFor(client, false)}
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
              items={isLoading ? [] : filteredClients}
              getKey={client => client.id}
              label="Clients"
              title={client => client.name}
              subtitle={client => client.email}
              badges={client => <ClientStatusBadge status={client.status} />}
              fields={client => [
                { label: 'Contact', value: clientContactName(client) || '—' },
                { label: 'Applied', value: appliedOn(client.createdAt) },
                { label: 'Events', value: client._count.events },
              ]}
              actions={client => (
                <>
                  <button type="button" className="btn-filter" onClick={() => setOpenId(client.id)}>
                    <FileText size={16} aria-hidden="true" /> Read application
                  </button>
                  {actionsFor(client, true)}
                </>
              )}
              empty={
                // While it loads, the list's own shape rather than a line of
                // text the cards then push down (PROJECT_GUIDE §9).
                isLoading ? (
                  <AdminCardListSkeleton cards={3} fields={3} />
                ) : (
                  <div className="py-12 px-4 text-center text-secondary">{emptyMessage}</div>
                )
              }
            />
          </div>
        </div>
      </div>

      {openClient && (
        <ApplicationPanel
          key={openClient.id}
          client={openClient}
          statusBadge={<ClientStatusBadge status={openClient.status} />}
          actions={actionsFor(openClient, true)}
          onClose={() => setOpenId(null)}
        />
      )}

      {inviting && (
        <InviteDialog
          key={`invite-${inviting.id}`}
          clientName={inviting.name}
          {...inviteDefaults(inviting)}
          onSubmit={invitee => sendInvite(inviting, invitee)}
          onDone={error => {
            setInviting(null);
            if (error) alert(error);
          }}
        />
      )}
    </>
  );
}

/**
 * Who the invite dialog opens on. A waiting invitation is resent to the person
 * it was for; otherwise the contact the application named, unless that address
 * already signs in — then the boxes start empty, because this press is for a
 * second person.
 */
function inviteDefaults(client: ClientRow) {
  const waiting = waitingViewer(client);
  if (waiting) {
    return { resend: true, initialName: waiting.staff.name, initialEmail: waiting.staff.email };
  }
  const contactTaken = client.viewers.some(viewer => viewer.staff.email === client.email);
  return {
    resend: false,
    initialName: contactTaken ? '' : clientContactName(client),
    initialEmail: contactTaken ? '' : client.email,
  };
}

/** One badge for the table's cell, the card and the panel, so they cannot drift. */
function ClientStatusBadge({ status }: { status: string }) {
  const known = CLIENT_STATUSES.find(code => code === status);
  const tone = known ? CLIENT_STATUS_COPY[known].badge : 'neutral';
  return <span className={`status-badge ${tone}`}>{clientStatusLabel(status)}</span>;
}

/**
 * The moves this client's status allows (`canMoveClient`). The table keeps
 * icon-only chips under the Actions header, named by their titles; a card and
 * the panel spell them out, because a phone has no hover to read a title
 * from. Tones are the chip classes in Admin.css.
 */
function ClientActions({
  client,
  labelled,
  onInvite,
  onMove,
}: {
  client: ClientRow;
  labelled: boolean;
  onInvite: () => void;
  onMove: (move: 'archive' | 'restore') => void;
}) {
  const iconOnly = labelled ? undefined : { padding: '0 10px' };
  const inviteLabel = waitingViewer(client) ? 'Resend invite' : 'Send invite';

  const chip = (
    key: string,
    label: string,
    Icon: typeof Send,
    onClick: () => void,
    tone = '',
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`btn-filter ${tone}`}
      title={labelled ? undefined : label}
      aria-label={labelled ? undefined : `${label}: ${client.name}`}
      style={iconOnly}
    >
      <Icon size={16} aria-hidden={labelled || undefined} />
      {labelled && label}
    </button>
  );

  return (
    <>
      {canMoveClient(client.status, 'invite') && chip('invite', inviteLabel, Send, onInvite, 'is-primary')}
      {canMoveClient(client.status, 'archive') &&
        chip('archive', 'Archive', Archive, () => onMove('archive'), 'is-danger')}
      {canMoveClient(client.status, 'restore') &&
        chip('restore', 'Restore', ArchiveRestore, () => onMove('restore'))}
    </>
  );
}
