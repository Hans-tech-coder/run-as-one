"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Search } from 'lucide-react';
import AdminCardList from '@/app/admin/AdminCardList';
import FilterChip from '@/app/admin/FilterChip';
import { formatEventDayShort } from '@/lib/event-schedule';
import {
  SETTLEMENT_STATE_COPY,
  formatSignedPesos,
  type SettlementState,
} from '@/lib/settlement';
import type { EventSettlementRow } from '@/lib/settlement-store';
import SettlementBadge from './SettlementBadge';

/**
 * The races and where each stands with its organizer — the searchable half of
 * `/admin/remittances`. The figures arrive from the server page.
 *
 * **The chips find, they never sort**, as on every list in the dashboard: the
 * races stay latest first, and Balance Due is how staff find the ones still
 * waiting. The due count rides on its chip because it is the number a person
 * opening this screen came for.
 *
 * A row opens the race's settlement. On the table the whole row does, and
 * every row and card also carries a labelled **View Details** — the eye the
 * registrants screen uses for the same job — because a bare chevron did not
 * tell staff what it was for.
 */

const FILTERS: SettlementState[] = ['DUE', 'OVERPAID', 'SETTLED', 'NOTHING'];

export default function RemittancesClient({ rows }: { rows: EventSettlementRow[] }) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<SettlementState | null>(null);

  const term = searchTerm.trim().toLowerCase();
  const filtered = rows.filter(
    row =>
      (!filter || row.settlement.state === filter) &&
      (!term ||
        row.title.toLowerCase().includes(term) ||
        (row.clientName ?? '').toLowerCase().includes(term)),
  );
  const countOf = (state: SettlementState) => rows.filter(row => row.settlement.state === state).length;

  const emptyMessage =
    rows.length === 0
      ? 'No events yet. A race appears here once it is created.'
      : term
        ? 'No events match this search and filter.'
        : `No events are ${SETTLEMENT_STATE_COPY[filter ?? 'NOTHING'].label.toLowerCase()}.`;

  const hrefOf = (row: EventSettlementRow) => `/admin/remittances/${row.id}`;
  const clientLine = (row: EventSettlementRow) => row.clientName ?? 'No client linked';

  return (
    <div className="admin-panel">
      <div className="admin-toolbar">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search by event or client..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="toolbar-actions flex-wrap">
          {FILTERS.map(state => {
            const { label } = SETTLEMENT_STATE_COPY[state];
            const count = state === 'DUE' ? countOf(state) : 0;
            return (
              <FilterChip
                key={state}
                label={count ? `${label} (${count})` : label}
                active={filter === state}
                onClick={() => setFilter(filter === state ? null : state)}
              />
            );
          })}
        </div>
      </div>

      <div className="data-table-wrapper dash-desktop-only">
        <table className="data-table is-dense">
          <thead>
            <tr>
              <th>Event</th>
              <th>Collected</th>
              <th>Owed</th>
              <th>Remitted</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-secondary">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filtered.map(row => (
                <tr
                  key={row.id}
                  onClick={() => router.push(hrefOf(row))}
                  className="cursor-pointer"
                >
                  <td className="font-medium text-primary min-w-48">
                    <div>{row.title}</div>
                    <div className="text-xs text-secondary font-normal">
                      {formatEventDayShort(row.date)} · {clientLine(row)}
                    </div>
                  </td>
                  {/* Run As One's share rides under what was collected rather
                      than taking a column: the two are one fact (what came
                      in, and the part of it that stays), and eight columns
                      overflowed the panel at a laptop's width. */}
                  <td className="whitespace-nowrap">
                    <div>{formatSignedPesos(row.settlement.collected)}</div>
                    <div className="text-xs text-secondary">
                      {formatSignedPesos(row.settlement.share)} Run As One
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{formatSignedPesos(row.settlement.owed)}</td>
                  <td className="whitespace-nowrap">{formatSignedPesos(row.settlement.remitted)}</td>
                  <td className="whitespace-nowrap font-semibold text-primary">
                    {formatSignedPesos(row.settlement.balance)}
                  </td>
                  <td>
                    <SettlementBadge state={row.settlement.state} />
                  </td>
                  {/* Under its own header label; a real link, so it can be
                      opened in a new tab and reached by keyboard. */}
                  <td onClick={e => e.stopPropagation()}>
                    <Link
                      href={hrefOf(row)}
                      className="btn-filter whitespace-nowrap"
                      aria-label={`View details for ${row.title}`}
                    >
                      <Eye size={16} aria-hidden="true" /> View Details
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="dash-mobile-only">
        <AdminCardList
          items={filtered}
          getKey={row => row.id}
          label="Remittances by event"
          title={row => row.title}
          subtitle={row => `${formatEventDayShort(row.date)} · ${clientLine(row)}`}
          badges={row => <SettlementBadge state={row.settlement.state} />}
          fields={row => [
            { label: 'Balance', value: <strong className="text-primary">{formatSignedPesos(row.settlement.balance)}</strong> },
            { label: 'Collected', value: formatSignedPesos(row.settlement.collected) },
            { label: 'Owed', value: formatSignedPesos(row.settlement.owed) },
            { label: 'Remitted', value: formatSignedPesos(row.settlement.remitted) },
          ]}
          actions={row => (
            <Link href={hrefOf(row)} className="btn-filter" aria-label={`View details for ${row.title}`}>
              <Eye size={16} aria-hidden="true" /> View Details
            </Link>
          )}
          empty={<div className="py-12 px-4 text-center text-secondary">{emptyMessage}</div>}
        />
      </div>
    </div>
  );
}
