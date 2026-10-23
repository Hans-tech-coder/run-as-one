import React from 'react';
import { Trophy } from 'lucide-react';
import type { TrackRunner } from '@/lib/track';

/**
 * One runner's submitted details (TRACK_PAGE_PLAN.md §5), for spotting a
 * mistake rather than copying the record: every value here arrived masked
 * from the server (lib/track-mask.ts), so there is no full email, phone,
 * street, birthdate or medical note on the page to reveal.
 */
export default function TrackRunnerCard({ runner }: { runner: TrackRunner }) {
  const rows: [string, string][] = [
    ['Category', runner.category],
    ...(runner.inclusions.length > 0 ? [['Inclusions', runner.inclusions.join(', ')] as [string, string]] : []),
    ...(runner.size ? [['Singlet size', runner.size] as [string, string]] : []),
    ['Gender', runner.gender],
    ...(runner.birth ? [['Birth month', runner.birth] as [string, string]] : []),
    ['Email', runner.email],
    ['Phone', runner.phone],
    ...(runner.address ? [['Home address', runner.address] as [string, string]] : []),
    ['Running club', runner.club],
    ['Emergency contact', [runner.emergencyName, runner.emergencyPhone].filter(Boolean).join(' · ')],
    ['Medical conditions', runner.medical],
    ...(runner.guardian
      ? [['Guardian', [runner.guardian.name, runner.guardian.relationship].filter(Boolean).join(' · ')] as [string, string]]
      : []),
  ];

  return (
    <article className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-white/[0.02]">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-white/[0.06] bg-white/[0.03] px-4 py-3 sm:px-5">
        <h3 className="m-0 min-w-0 break-words text-base font-black uppercase tracking-wide text-white">{runner.name}</h3>
        <span className="font-mono text-xs font-semibold text-secondary">{runner.ref}</span>
      </header>
      <dl className="m-0">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col gap-0.5 border-b border-white/[0.05] px-4 py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:px-5"
          >
            <dt className="shrink-0 text-xs text-secondary sm:text-sm">{label}</dt>
            <dd className="m-0 min-w-0 break-words text-sm font-semibold text-white sm:text-right">{value || '—'}</dd>
          </div>
        ))}
      </dl>
      {runner.resultHref && (
        <div className="border-t border-white/[0.06] p-4 sm:px-5">
          <a href={runner.resultHref} className="btn-secondary w-full">
            <Trophy size={18} aria-hidden="true" className="shrink-0 text-accent-orange" />
            View Result &amp; Certificate
          </a>
        </div>
      )}
    </article>
  );
}
