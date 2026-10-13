"use client";

import React from 'react';
import Link from 'next/link';
import { Archive, ArchiveRestore, Info, ListOrdered, Send } from 'lucide-react';
import type { RowAction } from '@/app/admin/RowActionsMenu';
import { hasApplicationDetails, signInComing } from '@/lib/organizer-application';
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_COPY,
  canMoveClient,
  clientContactName,
  clientStatusLabel,
} from '@/lib/client';
import type { ClientRow } from './application-rows';

/**
 * What staff may do to one client on `/admin/clients`, shared by the table's
 * ⋮ menu, the card and ApplicationPanel's footer so the three cannot offer
 * different moves; plus the status badge and the invite dialog's opening
 * values. Split out of ClientsClient, which keeps the list and the requests.
 */

/** The invitation this client is waiting on, if one has not been accepted. */
function waitingViewer(client: ClientRow) {
  return client.viewers.find(viewer => !viewer.acceptedAt) ?? null;
}

/**
 * Who the invite dialog opens on. A waiting invitation is resent to the person
 * it was for; otherwise the contact the application named, unless that address
 * already signs in — then the boxes start empty, because this press is for a
 * second person.
 */
export function inviteDefaults(client: ClientRow) {
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
export function ClientStatusBadge({ status }: { status: string }) {
  const known = CLIENT_STATUSES.find(code => code === status);
  const tone = known ? CLIENT_STATUS_COPY[known].badge : 'neutral';
  return <span className={`status-badge ${tone}`}>{clientStatusLabel(status)}</span>;
}

export type ClientHandlers = { onInvite: () => void; onMove: (move: 'archive' | 'restore') => void };

/**
 * The moves this client's status allows (`canMoveClient`), as ⋮ menu items for
 * the table and the card. Archive is the menu's red item, below its divider.
 */
export function clientMoves(client: ClientRow, { onInvite, onMove }: ClientHandlers): RowAction[] {
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
 *
 * Two things only the panel carries (SERVICE_INQUIRY_PLAN.md Batch 4):
 * - **Add Results** for an application that asked for Results and
 *   E-Certificates, opening `/admin/results/new` on its results-only form with
 *   this client's first event filled in (that page reads `?client=` and checks
 *   it for itself). Not for an archived client, whom a race cannot be linked to.
 * - **No sign-in needed** beside Send invite when the application did not ask
 *   for Online Registration (`signInComing`, the rule the thank-you panel
 *   told the applicant). Send invite still works: the note says what is
 *   needed, not what is allowed. An account from before the form asked
 *   nothing, so it gets no note either way.
 */
export function ClientActions({ client, ...handlers }: { client: ClientRow } & ClientHandlers) {
  const tones: Record<string, string> = { invite: 'is-primary', archive: 'is-danger' };
  const noSignIn = hasApplicationDetails(client) && !signInComing(client.services);
  const addResults = client.services.includes('RESULTS') && client.status !== 'ARCHIVED';
  return (
    <>
      {addResults && (
        <Link
          href={`/admin/results/new?client=${encodeURIComponent(client.id)}`}
          className="btn-filter"
        >
          <ListOrdered size={16} aria-hidden="true" />
          Add Results
        </Link>
      )}
      {clientMoves(client, handlers).map(action => (
        <React.Fragment key={action.key}>
          {action.key === 'invite' && noSignIn && (
            <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
              <Info size={14} className="shrink-0" aria-hidden="true" />
              No sign-in needed
            </span>
          )}
          <button
            type="button"
            onClick={action.onSelect}
            className={`btn-filter ${tones[action.key] ?? ''}`}
          >
            {action.icon}
            {action.label}
          </button>
        </React.Fragment>
      ))}
    </>
  );
}
