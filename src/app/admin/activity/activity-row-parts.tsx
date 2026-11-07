"use client";

/**
 * What one activity entry shows, drawn once for the table and the card: who
 * did it, the label, the sentence, the event, and the details panel.
 *
 * Split out of `ActivityClient.tsx` (PAYMENT_CORRECTION_PLAN.md Batch 2),
 * which was on the split-candidates list. A payment correction's details
 * also link to the old and the new proof (`CorrectionProofLinks`), through
 * `/api/admin/proof/[id]?path=`, which serves only pathnames recorded in
 * that order's own correction rows.
 */

import React from 'react';
import { ExternalLink, RotateCcw } from 'lucide-react';
import {
  ACTOR_KIND_LABELS,
  actionGroupLabel,
  actionLabel,
  describeChanges,
  describeDevice,
  formatTrailInstant,
  isWarningAction,
} from '@/lib/activity';
import type { ActivityRow } from './ActivityClient';

/**
 * The old and the new slip of a payment correction (C5), when its row
 * recorded them: `changes.proofOfPayment = [old, new]`. Either may be null (an
 * order with no proof before), and is then left out.
 */
export function correctionProofs(row: ActivityRow): { label: string; href: string }[] {
  if (row.action !== 'registration.payment.corrected' || row.entityType !== 'Registration' || !row.entityId) return [];
  const pair = (row.changes as { proofOfPayment?: unknown } | null)?.proofOfPayment;
  if (!Array.isArray(pair) || pair.length !== 2) return [];
  const href = (path: string) => `/api/admin/proof/${row.entityId}?${new URLSearchParams({ path }).toString()}`;
  return [
    typeof pair[0] === 'string' && pair[0] ? { label: 'Open old proof', href: href(pair[0]) } : null,
    typeof pair[1] === 'string' && pair[1] ? { label: 'Open new proof', href: href(pair[1]) } : null,
  ].filter((link): link is { label: string; href: string } => link !== null);
}

function CorrectionProofLinks({ row }: { row: ActivityRow }) {
  const links = correctionProofs(row);
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {links.map(link => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-filter max-lg:min-h-11"
        >
          <ExternalLink size={16} aria-hidden="true" /> {link.label}
        </a>
      ))}
    </div>
  );
}

/**
 * Who did it. In the table's narrow column the address truncates with the
 * whole of it in a title, as the team table's does — an address broken
 * between two letters reads as a typo. A card has the width to show it whole.
 */
export function ActorLine({ row, layout }: { row: ActivityRow; layout: 'table' | 'card' }) {
  const kind = ACTOR_KIND_LABELS[row.actorKind] ?? row.actorKind;
  const line = row.actorEmail ? `${kind} · ${row.actorEmail}` : kind;
  return (
    <span className="block min-w-0">
      <span className="block font-semibold text-primary [overflow-wrap:anywhere]">{row.actorName}</span>
      <span
        className={`block text-xs text-secondary ${layout === 'table' ? 'truncate' : '[overflow-wrap:anywhere]'}`}
        title={layout === 'table' ? line : undefined}
      >
        {line}
      </span>
    </span>
  );
}

/**
 * The entry's sentence, unless it only repeats the label ("Signed in" over
 * "Signed in."), where saying it twice adds a line and nothing else.
 */
export function entrySentence(row: ActivityRow): string | null {
  const plain = (text: string) => text.trim().replace(/\.$/, '').toLowerCase();
  return plain(row.summary) === plain(actionLabel(row.action)) ? null : row.summary;
}

export function EventLine({ row }: { row: ActivityRow }) {
  if (!row.eventId) return <span className="text-secondary">&mdash;</span>;
  if (!row.eventTitle) return <span className="text-secondary italic">Deleted event</span>;
  return <span className="[overflow-wrap:anywhere]">{row.eventTitle}</span>;
}

export function ActionLabel({ row }: { row: ActivityRow }) {
  return isWarningAction(row.action) ? (
    <span className="status-badge danger">{actionLabel(row.action)}</span>
  ) : (
    <span className="font-medium text-primary">{actionLabel(row.action)}</span>
  );
}

/** Everything the one-line entry leaves out: the fields that moved, and where it came from. */
export function EntryDetails({ row }: { row: ActivityRow }) {
  const lines = describeChanges(row.changes);
  const device = describeDevice(row.userAgent);
  const group = actionGroupLabel(row.action);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">What changed</p>
        {lines.length > 0 ? (
          <dl className="m-0 grid gap-2">
            {lines.map(line => (
              <div key={line.field} className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(8rem,12rem)_1fr]">
                <dt className="text-secondary">{line.field}</dt>
                <dd className={`m-0 min-w-0 [overflow-wrap:anywhere] ${line.redacted ? 'text-secondary italic' : 'text-primary'}`}>
                  {line.text}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="m-0 text-secondary">No field-level changes were recorded for this entry. The sentence above is the whole of it.</p>
        )}
      </div>

      <CorrectionProofLinks row={row} />

      <dl className="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-xs text-secondary">Recorded</dt>
          <dd className="m-0 text-primary">{formatTrailInstant(row.at, true)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-secondary">Kind</dt>
          <dd className="m-0 text-primary">{group ?? 'Other'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-secondary">IP address</dt>
          <dd className="m-0 font-mono text-primary [overflow-wrap:anywhere]">{row.ip ?? 'Not recorded'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-secondary">Device</dt>
          <dd className="m-0 text-primary" title={row.userAgent ?? undefined}>
            {device ?? 'Not recorded'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** What an empty page says: a filter that matched nothing, or a trail with nothing yet. */
export function ActivityEmpty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return filtered ? (
    <>
      <p className="m-0 text-primary font-medium">Nothing in the trail matches these filters.</p>
      <p className="m-0 mt-1">Widen the dates or clear a filter to see more.</p>
      <button type="button" onClick={onClear} className="btn-filter mt-4 max-lg:min-h-11">
        <RotateCcw size={16} aria-hidden="true" /> Clear filters
      </button>
    </>
  ) : (
    <>
      <p className="m-0 text-primary font-medium">Nothing has been recorded yet.</p>
      <p className="m-0 mt-1">
        Every validated payment, edited runner, opened proof, organizer decision and sign-in will appear here under the name of the person who did it.
      </p>
    </>
  );
}
