"use client";

import React from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import type { Row } from '@tanstack/react-table';
import { formatEventInstant } from '@/lib/event-schedule';
import { REGISTRATION_STATES } from './registration-state-badge';
import type { CategoryChip, EventRow } from './event-row';

/**
 * The pieces of an events-table row that the table cell and the phone card
 * both draw, kept in one place so the two cannot say different things.
 */

/**
 * The Registrants cell: how many registrants the race has — paid, and bank
 * transfers awaiting verification, the same people the registrants screen
 * lists — and the way to that screen. The split is behind a tooltip on hover
 * or keyboard focus rather than in the cell, because the total is what a row
 * is scanned for; the split is the follow-up question.
 *
 * Unpaid online checkouts sit beside the count as "+N unpaid", never in it
 * (UNPAID_ORDERS_PLAN.md): a client once read four registrants here where the
 * registrants screen listed one. They still hold a slot until the sweep
 * expires them, which is why they are shown at all.
 */
export function RegisteredCount({ event, alignEnd = false }: { event: EventRow; /** Open the tip leftwards, for a count at the right of a card. */ alignEnd?: boolean }) {
  const { paid, awaiting, unpaid } = event.registered ?? { paid: 0, awaiting: 0, unpaid: 0 };
  const total = paid + awaiting;

  return (
    <span className="reg-count-group">
      <span className={`reg-count ${alignEnd ? 'is-end' : ''}`}>
        <Link
          href={`/admin/events/${event.id}/registrants`}
          className="reg-count-trigger"
          aria-label={`${total} ${total === 1 ? 'registrant' : 'registrants'} for ${event.title}: ${paid} paid, ${awaiting} awaiting verification. Open registrants.`}
        >
          <Users size={14} aria-hidden="true" />
          <span className="tabular-nums">{total}</span>
        </Link>
        <span className="reg-count-tip" aria-hidden="true">
          <span className="reg-count-tip-row">
            <span className="reg-count-dot is-paid" />Paid / Validated<b>{paid}</b>
          </span>
          <span className="reg-count-tip-row">
            <span className="reg-count-dot is-pending" />Awaiting verification<b>{awaiting}</b>
          </span>
        </span>
      </span>
      {unpaid > 0 && <UnpaidCount count={unpaid} eventId={event.id} title={event.title} alignEnd={alignEnd} />}
    </span>
  );
}

/**
 * "+N unpaid" beside a race's registrant count: a link to the registrants
 * screen's Unpaid checkouts tab (UNPAID_ORDERS_PLAN.md Batch 3), where staff
 * follow these orders up. Hover or keyboard focus shows what it means; on a
 * phone, which has no hover, the tab it opens says the same at the top.
 */
function UnpaidCount({ count, eventId, title, alignEnd }: { count: number; eventId: string; title: string; alignEnd: boolean }) {
  return (
    <span className={`reg-count ${alignEnd ? 'is-end' : ''}`}>
      <Link
        href={`/admin/events/${eventId}/registrants?tab=unpaid`}
        className="reg-count-trigger is-unpaid"
        aria-label={`${count} unpaid ${count === 1 ? 'checkout' : 'checkouts'} for ${title}: online checkout not paid yet, expires automatically. Open unpaid checkouts.`}
      >
        <span className="tabular-nums">+{count}</span> unpaid
      </Link>
      <span className="reg-count-tip is-note" aria-hidden="true">
        Online checkout not paid yet. Expires automatically.
      </span>
    </span>
  );
}

/**
 * A row's place in the sorted list, for the No. column and the card beside it.
 * Counted by id rather than object identity, for the reason PROJECT_GUIDE §9
 * gives: sorting rebuilds the rows, and an `indexOf` on them finds nothing.
 */
export function rowPosition<T>(sortedRows: Row<T>[], row: Row<T>) {
  return sortedRows.findIndex(sorted => sorted.id === row.id) + 1;
}

/**
 * The Registration column's badge and the line under it. Drawn once for the
 * table cell and the card's badge row, so the two cannot say different things.
 */
export function RegistrationStatus({ event }: { event: EventRow }) {
  const key = (event.registrationState ?? 'OPEN') as keyof typeof REGISTRATION_STATES;
  const state = REGISTRATION_STATES[key];
  return (
    <div>
      <span className={`status-badge ${state.tone} whitespace-nowrap`}>{state.label}</span>
      {/* The date the badge is standing in for. A quiet line rather than
          a second pill: two pills in one cell read as two states, and
          this event has only one. */}
      {key === 'SCHEDULED' && event.registrationOpensAt && (
        <span className="status-note neutral whitespace-nowrap">
          Opens {formatEventInstant(event.registrationOpensAt)}
        </span>
      )}
    </div>
  );
}

/**
 * An event's options on its card. The table has room only for a count; a card
 * has room to name them, which is what an organizer scanning their races on a
 * phone is looking for. A race option keeps its distance beside its name,
 * unless the name already says it ("10K" beside "10K" is noise, not detail).
 */
export function CategoryChips({ categories }: { categories?: CategoryChip[] }) {
  if (!categories?.length) return <span className="text-secondary">No categories</span>;
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
      {categories.map(category => {
        const distance = category.distance?.trim();
        const showDistance = Boolean(distance) && !category.name.toUpperCase().includes(distance!.toUpperCase());
        return (
          <li
            key={category.id}
            className="max-w-full truncate whitespace-nowrap rounded-full border border-[var(--dash-border)] bg-[var(--ink-05)] px-2.5 py-0.5 text-xs text-primary"
          >
            {category.name}
            {showDistance && <span className="text-secondary">{` · ${distance}`}</span>}
          </li>
        );
      })}
    </ul>
  );
}
