"use client";

/**
 * The activity trail as cards, below `lg`, under the same day headings as
 * the table. Split out of `ActivityClient.tsx` (PAYMENT_CORRECTION_PLAN.md
 * Batch 2); the client keeps which entry is open.
 */

import React from 'react';
import AdminCardList from '../AdminCardList';
import { actionGroupLabel, formatTrailDayHeading, formatTrailTime } from '@/lib/activity';
import type { ActivityRow } from './ActivityClient';
import { ActionLabel, ActorLine, EntryDetails, EventLine, entrySentence } from './activity-row-parts';

export default function ActivityCards({
  days,
  now,
  openId,
  toggle,
  emptyMessage,
}: {
  days: { day: string; rows: ActivityRow[] }[];
  now: string;
  openId: string | null;
  toggle: (id: string) => void;
  emptyMessage: React.ReactNode;
}) {
  return (
    <div className="dash-mobile-only">
      {days.length === 0 ? (
        <div className="border border-[var(--dash-border)] rounded-lg py-12 px-4 text-center text-[var(--text-muted)]">{emptyMessage}</div>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map(group => (
            <section key={group.day} className="flex flex-col gap-3">
              <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-secondary">
                {formatTrailDayHeading(group.day, now)}
              </h2>
              <AdminCardList
                items={group.rows}
                getKey={row => row.id}
                label={`Activity on ${formatTrailDayHeading(group.day, now)}`}
                className="is-flush"
                title={row => <ActionLabel row={row} />}
                subtitle={row => {
                  const sentence = entrySentence(row);
                  return sentence ? <span className="[overflow-wrap:anywhere]">{sentence}</span> : null;
                }}
                fields={row => [
                  { label: 'Time', value: formatTrailTime(row.at) },
                  { label: 'Kind', value: actionGroupLabel(row.action) ?? 'Other' },
                  { label: 'Person', value: <ActorLine row={row} layout="card" />, full: true },
                  ...(row.eventId ? [{ label: 'Event', value: <EventLine row={row} />, full: true }] : []),
                ]}
                expanded={row => {
                  const isOpen = openId === row.id;
                  return (
                    // transitions.dev's accordion (21), as the feedback
                    // inbox's cards. No `id` or aria-controls: the table
                    // renders beside these cards.
                    <div className="t-acc" data-open={isOpen ? 'true' : 'false'}>
                      <button
                        type="button"
                        onClick={() => toggle(row.id)}
                        aria-expanded={isOpen}
                        className="t-acc-head btn-filter w-full justify-between min-h-11"
                      >
                        <span>{isOpen ? 'Hide details' : 'Show details'}</span>
                        <span className="t-acc-chevron" aria-hidden="true">
                          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 6.5L8 10.5L12 6.5" />
                          </svg>
                        </span>
                      </button>
                      <div className="t-acc-panel" inert={!isOpen}>
                        <div className="t-acc-panel-inner">
                          <div className="pt-3">
                            <EntryDetails row={row} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
