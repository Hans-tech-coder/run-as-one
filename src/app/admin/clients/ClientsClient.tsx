"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, FileText, Search, Send, X } from 'lucide-react';
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
import AdminDataTable, { AdminColumnsMenu, rowPosition } from '@/app/admin/AdminDataTable';
import AdminTablePager from '@/app/admin/AdminTablePager';
import FiltersMenu from '@/app/admin/FiltersMenu';
import MobileSortMenu from '@/app/admin/MobileSortMenu';
import RowActionsMenu, { type RowAction } from '@/app/admin/RowActionsMenu';
import ApplicationPanel, { appliedOn, type ClientApplicationRow } from './ApplicationPanel';
import InviteDialog, { type InviteResult } from './InviteDialog';
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_COPY,
  canMoveClient,
  clientContactName,
  clientStatusLabel,
} from '@/lib/client';

/**
 * The client submissions — every organization that applied through
 * `/admin/register`, and what Run As One has done about it
 * (ADMIN_MERGE_PLAN.md, Batch 3). It replaced the organizer accounts screen,
 * whose approve / reject / suspend flow no longer exists: a submission is not
 * decided, it waits here until staff are ready to run a race for it and press
 * **Send invite**.
 *
 * The list wears the events table's furniture (`AdminDataTable`, §9): sortable
 * headers, the View chip, the pager, and cards below `lg` reading the same
 * table instance.
 *
 * A row opens the application in a panel over the list (ApplicationPanel). On
 * the table the whole row opens it, except its ⋮ menu; below
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
  // The Filters sheet's statuses. None chosen is every live submission — all
  // but the archived, which are there when asked for.
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  // An id rather than the row, so the panel reads the refreshed row after an
  // invite or an archive instead of a stale copy.
  const [openId, setOpenId] = useState<string | null>(null);
  // The client an invitation is being written for.
  const [inviting, setInviting] = useState<ClientRow | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

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
  // Memoized: the table goes back to page one whenever its data changes identity.
  const filteredClients = useMemo(
    () =>
      clients.filter(
        c =>
          (selectedStatuses.length === 0 ? c.status !== 'ARCHIVED' : selectedStatuses.includes(c.status)) &&
          (!term ||
            c.name.toLowerCase().includes(term) ||
            c.email.toLowerCase().includes(term) ||
            clientContactName(c).toLowerCase().includes(term)),
      ),
    [clients, selectedStatuses, term],
  );
  const newCount = clients.filter(c => c.status === 'NEW').length;
  const archivedCount = clients.filter(c => c.status === 'ARCHIVED').length;
  // "None at all", "none waiting" and "none that match" are different news.
  const emptyMessage =
    clients.length === 0
      ? 'No submissions yet. Applications sent from the organizer form land here.'
      : term
        ? 'No clients match this search and filter.'
        : selectedStatuses.length === 0 && archivedCount > 0
          ? `No live submissions. ${archivedCount} archived ${archivedCount === 1 ? 'one is' : 'ones are'} under Filters → Archived.`
          : `No ${selectedStatuses.map(status => clientStatusLabel(status).toLowerCase()).join(' or ')}${selectedStatuses.length ? ' ' : ''}clients.`;
  // Looked up in the whole list, not the filtered one: inviting from the New
  // view must not snatch the panel away mid-read.
  const openClient = openId ? clients.find(c => c.id === openId) ?? null : null;

  const handlersFor = (client: ClientRow) => ({
    onInvite: () => setInviting(client),
    onMove: (move: 'archive' | 'restore') => moveClient(client, move),
  });

  /** A row's ⋮ menu, for the table's Actions cell and the card's footer. */
  const menuFor = (client: ClientRow, className = '') => (
    <RowActionsMenu
      label={client.name}
      className={className}
      actions={[
        {
          key: 'read',
          label: 'Read Application',
          icon: <FileText size={16} />,
          onSelect: () => setOpenId(client.id),
        },
        ...clientMoves(client, handlersFor(client)),
      ]}
    />
  );

  const columns = useMemo<ColumnDef<ClientRow>[]>(() => [
    {
      id: 'index',
      header: 'No.',
      cell: ({ row, table }) => (
        <span className="text-gray-400 font-mono">{rowPosition(table.getSortedRowModel().flatRows, row)}</span>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: 'client',
      header: 'Client',
      accessorFn: client => client.name,
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-primary">{row.original.name}</div>
          <div className="text-xs text-secondary">{row.original.email}</div>
        </div>
      ),
      enableHiding: false,
    },
    {
      id: 'contact',
      header: 'Contact',
      accessorFn: client => clientContactName(client),
      cell: ({ getValue }) => <span className="text-secondary">{getValue<string>() || '—'}</span>,
    },
    {
      id: 'applied',
      header: 'Applied',
      accessorFn: client => client.createdAt,
      cell: ({ row }) => <span className="whitespace-nowrap text-secondary">{appliedOn(row.original.createdAt)}</span>,
    },
    {
      id: 'events',
      header: 'Events',
      accessorFn: client => client._count.events,
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: client => clientStatusLabel(client.status),
      cell: ({ row }) => <ClientStatusBadge status={row.original.status} />,
    },
    {
      // Left-aligned, under its own header label. RowActionsMenu swallows the
      // click and the keys, so acting never opens the panel.
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => menuFor(row.original),
      enableSorting: false,
      enableHiding: false,
    },
    // menuFor only opens the panel or a dialog, or calls moveClient, which
    // read nothing that changes what a cell shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  const table = useReactTable({
    data: filteredClients,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Clients</h1>
      </header>

      <div className="admin-content">
        <div className="flex flex-col gap-4 w-full text-white">
          <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
            <div className="toolbar-actions" style={{ flex: 1 }}>
              <div className="search-wrapper">
                <Search className="search-icon" size={16} />
                <input
                  type="text"
                  placeholder="Search by name, contact or email..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-300 bg-transparent border-none cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {/* The Filters chip, the waiting submissions counted beside
                  New. Nothing chosen is every live submission. */}
              <FiltersMenu
                groups={[{
                  label: 'Status',
                  options: CLIENT_STATUSES.map(status => {
                    const { label } = CLIENT_STATUS_COPY[status];
                    return { value: status, label: status === 'NEW' && newCount ? `${label} (${newCount})` : label };
                  }),
                  selected: selectedStatuses,
                  onToggle: status => setSelectedStatuses(prev =>
                    prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]),
                }]}
                onClear={() => setSelectedStatuses([])}
              />
              <AdminColumnsMenu table={table} />
              <MobileSortMenu table={table} />
            </div>
          </div>

          <AdminDataTable
            table={table}
            empty={emptyMessage}
            loading={isLoading}
            leadColumn="index"
            rowProps={row => ({
              onClick: () => setOpenId(row.original.id),
              onKeyDown: e => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenId(row.original.id);
                }
              },
              tabIndex: 0,
              'aria-label': `Read ${row.original.name}'s application`,
              className: 'cursor-pointer',
            })}
          />

          {/* The same rows as the table, below `lg` (AdminCardList). A card
              opens its application from its own button, never from a tap
              anywhere — see the note at the top of this file. */}
          <div className="dash-mobile-only">
            <AdminCardList
              items={isLoading ? [] : table.getRowModel().rows}
              getKey={row => row.id}
              label="Clients"
              className="is-flush"
              title={({ original }) => original.name}
              subtitle={({ original }) => original.email}
              badges={({ original }) => <ClientStatusBadge status={original.status} />}
              fields={({ original }) => [
                { label: 'Contact', value: clientContactName(original) || '—' },
                { label: 'Applied', value: appliedOn(original.createdAt) },
                { label: 'Events', value: original._count.events },
              ]}
              actions={({ original }) => (
                <>
                  <button type="button" className="btn-filter" onClick={() => setOpenId(original.id)}>
                    <FileText size={16} aria-hidden="true" /> Read application
                  </button>
                  {menuFor(original, 'ml-auto')}
                </>
              )}
              empty={
                // While it loads, the list's own shape rather than a line of
                // text the cards then push down (PROJECT_GUIDE §9).
                isLoading ? (
                  <AdminCardListSkeleton cards={3} fields={3} className="is-flush" />
                ) : (
                  <div className="border border-white/10 rounded-lg py-16 px-4 text-center text-gray-500">
                    {emptyMessage}
                  </div>
                )
              }
            />
          </div>

          <AdminTablePager table={table} />
        </div>
      </div>

      {openClient && (
        <ApplicationPanel
          key={openClient.id}
          client={openClient}
          statusBadge={<ClientStatusBadge status={openClient.status} />}
          actions={<ClientActions client={openClient} {...handlersFor(openClient)} />}
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

type ClientHandlers = { onInvite: () => void; onMove: (move: 'archive' | 'restore') => void };

/**
 * The moves this client's status allows (`canMoveClient`), as ⋮ menu items for
 * the table and the card. Archive is the menu's red item, below its divider.
 */
function clientMoves(client: ClientRow, { onInvite, onMove }: ClientHandlers): RowAction[] {
  const inviteLabel = waitingViewer(client) ? 'Resend Invite' : 'Send Invite';
  return [
    ...(canMoveClient(client.status, 'invite')
      ? [{ key: 'invite', label: inviteLabel, icon: <Send size={16} />, onSelect: onInvite }]
      : []),
    ...(canMoveClient(client.status, 'restore')
      ? [{ key: 'restore', label: 'Restore', icon: <ArchiveRestore size={16} />, onSelect: () => onMove('restore') }]
      : []),
    ...(canMoveClient(client.status, 'archive')
      ? [{ key: 'archive', label: 'Archive', icon: <Archive size={16} />, onSelect: () => onMove('archive'), danger: true }]
      : []),
  ];
}

/**
 * The same moves as labelled chips, for the application panel's footer, where
 * there is room to spell them out. Tones are the chip classes in Admin.css.
 */
function ClientActions({ client, ...handlers }: { client: ClientRow } & ClientHandlers) {
  const tones: Record<string, string> = { invite: 'is-primary', archive: 'is-danger' };
  return (
    <>
      {clientMoves(client, handlers).map(action => (
        <button
          key={action.key}
          type="button"
          onClick={action.onSelect}
          className={`btn-filter ${tones[action.key] ?? ''}`}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </>
  );
}
