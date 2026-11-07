"use client";

/**
 * The activity trail's table, from `lg` up: one page of entries under day
 * headings, each with a Details toggle that opens its panel in a row below.
 * Split out of `ActivityClient.tsx` (PAYMENT_CORRECTION_PLAN.md Batch 2);
 * the client keeps the reading, the filters and which entry is open.
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { actionLabel, formatTrailDayHeading, formatTrailTime } from '@/lib/activity';
import type { ActivityRow } from './ActivityClient';
import { ActionLabel, ActorLine, EntryDetails, EventLine, entrySentence } from './activity-row-parts';

/** Time, person, what happened, the event, details. */
const columnCount = 5;

export default function ActivityTable({
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
    <div className="dash-desktop-only border border-[var(--dash-border)] rounded-lg overflow-hidden bg-transparent">
      <Table>
        <TableHeader className="bg-transparent">
          <TableRow className="border-b border-[var(--dash-border)] hover:bg-transparent">
            <TableHead className="py-4 px-4 pl-8 text-secondary font-medium h-auto w-28">Time</TableHead>
            <TableHead className="py-4 px-4 text-secondary font-medium h-auto w-[16rem]">Person</TableHead>
            <TableHead className="py-4 px-4 text-secondary font-medium h-auto">What happened</TableHead>
            <TableHead className="py-4 px-4 text-secondary font-medium h-auto w-[14rem]">Event</TableHead>
            <TableHead className="py-4 px-4 text-secondary font-medium h-auto w-28">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-16 px-4 text-center text-[var(--text-muted)]">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            days.map(group => (
              <React.Fragment key={group.day}>
                <TableRow className="border-b border-[var(--dash-hairline)] hover:bg-transparent">
                  <TableCell
                    colSpan={columnCount}
                    className="py-2 px-4 pl-8 bg-[var(--ink-03)] text-xs font-semibold uppercase tracking-wider text-secondary"
                  >
                    {formatTrailDayHeading(group.day, now)}
                  </TableCell>
                </TableRow>
                {group.rows.map(row => {
                  const isOpen = openId === row.id;
                  return (
                    <React.Fragment key={row.id}>
                      <TableRow className={`border-b border-[var(--dash-hairline)] hover:bg-[var(--ink-05)] transition-colors ${isOpen ? 'bg-[var(--ink-03)]' : ''}`}>
                        <TableCell className="py-4 px-4 pl-8 align-top text-secondary whitespace-nowrap">
                          {formatTrailTime(row.at)}
                        </TableCell>
                        <TableCell className="py-4 px-4 align-top max-w-[16rem]">
                          <ActorLine row={row} layout="table" />
                        </TableCell>
                        <TableCell className="py-4 px-4 align-top">
                          <span className="flex flex-col gap-1 min-w-0">
                            <span><ActionLabel row={row} /></span>
                            {entrySentence(row) && (
                              <span className="text-sm text-secondary [overflow-wrap:anywhere]">{entrySentence(row)}</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 px-4 align-top max-w-[14rem] text-primary">
                          <EventLine row={row} />
                        </TableCell>
                        {/* Under its own header, never pushed to the row's right edge (§8, rule 6). */}
                        <TableCell className="py-4 px-4 align-top">
                          <button
                            type="button"
                            onClick={() => toggle(row.id)}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? 'Hide' : 'Show'} details: ${actionLabel(row.action)} by ${row.actorName}`}
                            className="icon-btn"
                          >
                            <ChevronDown
                              size={16}
                              aria-hidden="true"
                              className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                            />
                          </button>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="border-b border-[var(--dash-hairline)] hover:bg-transparent">
                          <TableCell colSpan={columnCount} className="px-4 pl-8 py-4">
                            <div>
                              <EntryDetails row={row} />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
