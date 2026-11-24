'use client';

import React from 'react';
import { User, Hash } from 'lucide-react';
import type { Row } from '@tanstack/react-table';
import { toWholeSeconds } from '@/lib/race-time';
import { runnerResultPath } from '@/lib/event-slug';
import type { CertificateEvent } from '@/lib/e-certificate';

/** The event as the leaderboard uses it: its slug for result links, the rest for certificates. */
export type LeaderboardEvent = CertificateEvent & { slug: string };

export interface Result {
  id: string;
  name: string;
  bibNumber: string;
  gender: string;
  category: { id: string; name: string };
  chipTime: string;
  gunTime?: string | null;
  /** Without pacers (`ranksWithoutPacers`); null for a pacer, shown as "-". */
  categoryRank?: number | null;
  genderRank?: number | null;
  /** Whether this finisher is one of the race's pacers (see pacerResultMatcher). */
  isPacer?: boolean;
  /** A pacer's pace group, for their certificate; null for everyone else. */
  paceGroup?: string | null;
}

/** A rank as printed: "#3", or "-" for a pacer, who holds no place. */
export function rankLabel(rank: number | null | undefined): string {
  return rank == null ? '-' : `#${rank}`;
}

/**
 * The tag beside a pacer's bib. Their rank is real and stays; the tag says why
 * they are not on the Race Winners podium.
 */
export function PacerTag() {
  return (
    <span className="shrink-0 whitespace-nowrap bg-site-surface text-site-accent px-2 py-0.5 rounded-chip text-[10px] font-bold border border-site-action">
      Pacer
    </span>
  );
}

/**
 * Below lg, the full leaderboard's rows become cards — one column on a phone,
 * two on a tablet — split out of FullResultsClient so the table and card views
 * stay modular.
 */
export default function FullResultsCards({
  rows,
  event,
  openResult,
  openOnKey,
  actionsFor,
}: {
  rows: Row<Result>[];
  event: LeaderboardEvent;
  openResult: (path: string) => void;
  openOnKey: (e: React.KeyboardEvent, path: string) => void;
  actionsFor: (r: Result, path: string) => React.ReactNode;
}) {
  return (
    <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
      {rows.length === 0 ? (
        <div className="md:col-span-2 bg-site-card border border-site-line p-8 rounded-panel text-center text-secondary/70 italic">
          No results found matching your filters.
        </div>
      ) : (
        rows.map((row) => {
          const r = row.original;
          const path = runnerResultPath(event, r);
          return (
            <div
              key={row.id}
              role="link"
              tabIndex={0}
              aria-label={`Open ${r.name}'s result`}
              onClick={() => openResult(path)}
              onKeyDown={(e) => openOnKey(e, path)}
              // `.lb-card` (site.css): a Paper card's panel corner and the lift
              // every linked Paper card gives on hover.
              className="lb-card block no-underline"
            >
              <div className="relative h-full p-4 overflow-hidden">
                <div className="flex items-start gap-3 relative z-10">
                  {/* A runner's name is untrusted length: it truncates here
                      and is spelled out in full on their own result. */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <h3 className="lb-row__name font-bold text-site-ink text-base leading-snug truncate" title={r.name}>
                      {r.name}
                    </h3>
                    {/* One line, always: the chip gives way and truncates
                        rather than wrapping, so every card is one height —
                        wrapping put it on a second line for some runners
                        and not others. */}
                    <div className="flex items-center gap-2.5 mt-1.5 text-xs text-secondary min-w-0">
                      <span className="flex items-center gap-1 whitespace-nowrap tabular-nums shrink-0">
                        <Hash size={12} className="text-site-muted shrink-0" /> {r.bibNumber}
                      </span>
                      <span className="flex items-center gap-1 whitespace-nowrap shrink-0">
                        <User size={12} className="text-site-muted shrink-0" /> {r.gender}
                      </span>
                      {r.isPacer && <PacerTag />}
                      <span className="min-w-0 truncate whitespace-nowrap bg-site-surface text-site-accent px-2 py-0.5 rounded-chip text-[10px] font-bold border border-site-line" title={r.category.name}>
                        {r.category.name}
                      </span>
                    </div>
                  </div>
                  <div className="-mt-1 -mr-1.5 shrink-0">
                    {actionsFor(r, path)}
                  </div>
                </div>

                {/* The time is what a runner opens this list for, so it
                    leads the strip and is the largest figure on the card. */}
                <div className="grid grid-cols-[1.35fr_1fr_1fr] gap-3 mt-4 pt-3 border-t border-site-line relative z-10">
                  <div className="min-w-0">
                    <span className="text-[10px] text-secondary block mb-1">Chip Time</span>
                    <span className="font-mono font-bold text-lg leading-none text-site-accent tabular-nums whitespace-nowrap">
                      {toWholeSeconds(r.chipTime)}
                    </span>
                    {r.gunTime && (
                      <span className="block mt-1.5 text-[11px] font-mono text-secondary tabular-nums whitespace-nowrap">
                        Gun {toWholeSeconds(r.gunTime)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-secondary block mb-1 whitespace-nowrap">Cat. Rank</span>
                    <span className="font-mono font-bold text-base leading-none text-site-ink tabular-nums">
                      {rankLabel(r.categoryRank)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-secondary block mb-1 whitespace-nowrap">Gender Rank</span>
                    <span className="font-mono font-bold text-base leading-none text-site-ink tabular-nums">
                      {rankLabel(r.genderRank)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
