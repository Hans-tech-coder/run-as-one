"use client";

import React from 'react';
import { CalendarDays, MapPin, Package, Trophy, Truck, Users } from 'lucide-react';
import type { TrackView } from '@/lib/track';
import TrackStatusCard from './TrackStatusCard';
import TrackRunnerCard from './TrackRunnerCard';
import TrackHelpCard, { type TrackHelp } from './TrackHelpCard';

/**
 * Everything one lookup opens (TRACK_PAGE_PLAN.md §3, §5, §6), in the order a
 * runner asks it: is it paid, how do I get my kit, are my details right, who
 * do I tell when they are not. Shared by the form on /track and the emailed
 * link on /track/<token>, so the two cannot drift.
 *
 * Kit status (claimed, shipped) is out of scope (§1): the kit section says only
 * what the app already knows — where and when to pick up, or where it ships.
 */

/** D7: shown as text; a prefilled letter is a later nice-to-have. */
const PROXY_RULE =
  'Someone else may claim your kit for you. They must bring an authorization letter signed by you and a copy of your valid ID with your signature.';

export default function TrackResult({
  view,
  help,
  headingRef,
}: {
  view: TrackView;
  help: TrackHelp;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const { event, logistics } = view;
  const showsAll = view.wholeOrder || view.runners.length === view.runnersOnOrder;

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-col gap-2 text-center">
        <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.2em] text-secondary">{view.orderRef}</p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="m-0 break-words text-2xl font-black uppercase tracking-wide text-white outline-none sm:text-3xl"
        >
          {event.title}
        </h2>
        <p className="m-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={15} aria-hidden="true" className="shrink-0 text-accent-orange" />
            {event.when}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 break-words">
            <MapPin size={15} aria-hidden="true" className="shrink-0 text-accent-orange" />
            {event.where}
          </span>
        </p>
      </header>

      <TrackStatusCard view={view} />

      {event.finished && (event.resultsHref || event.resultsComing) && (
        <section aria-labelledby="track-results-title" className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-5 sm:p-6">
          <h2 id="track-results-title" className="m-0 flex items-center gap-2 text-lg font-black uppercase tracking-wide text-white">
            <Trophy size={20} aria-hidden="true" className="shrink-0 text-accent-orange" />
            Results
          </h2>
          {event.resultsHref ? (
            <>
              <p className="m-0 mt-1 text-sm leading-relaxed text-secondary">
                {view.runners.some(r => r.resultHref)
                  ? 'The results are up. Open a runner’s result below to download the e-certificate.'
                  : 'The results are up. Find your name to see your time and download your e-certificate.'}
              </p>
              <a href={event.resultsHref} className="btn-secondary mt-4 w-full">
                View Race Results
              </a>
            </>
          ) : (
            <p className="m-0 mt-1 text-sm leading-relaxed text-secondary">
              The times are being prepared. They will be posted on the Results page, with your e-certificate.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="track-kit-title" className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-5 sm:p-6">
        <h2 id="track-kit-title" className="m-0 flex items-center gap-2 text-lg font-black uppercase tracking-wide text-white">
          {logistics.method === 'pickup' ? (
            <Package size={20} aria-hidden="true" className="shrink-0 text-accent-orange" />
          ) : (
            <Truck size={20} aria-hidden="true" className="shrink-0 text-accent-orange" />
          )}
          {logistics.method === 'pickup' ? logistics.label : 'Kit Delivery'}
        </h2>
        {logistics.method === 'pickup' ? (
          <>
            {logistics.location || logistics.schedule ? (
              <dl className="m-0 mt-3 flex flex-col gap-2 text-sm">
                {logistics.location && (
                  <div>
                    <dt className="text-xs text-secondary">Where</dt>
                    <dd className="m-0 break-words font-semibold text-white">{logistics.location}</dd>
                  </div>
                )}
                {logistics.schedule && (
                  <div>
                    <dt className="text-xs text-secondary">When</dt>
                    <dd className="m-0 whitespace-pre-line break-words font-semibold text-white">{logistics.schedule}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="m-0 mt-1 text-sm leading-relaxed text-secondary">{logistics.fallback}</p>
            )}
            <p className="m-0 mt-4 rounded-[12px] border border-white/5 bg-black/30 px-4 py-3 text-xs leading-relaxed text-secondary">
              <span className="font-bold text-white">Can’t claim it yourself? </span>
              {PROXY_RULE}
            </p>
          </>
        ) : (
          <dl className="m-0 mt-3 flex flex-col gap-2 text-sm">
            {logistics.area && (
              <div>
                <dt className="text-xs text-secondary">Area</dt>
                <dd className="m-0 font-semibold text-white">{logistics.area}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-secondary">Ships to</dt>
              <dd className="m-0 break-words font-semibold text-white">
                {logistics.perRunner
                  ? 'Each kit ships to its runner’s home address, shown below'
                  : logistics.shipsTo || 'The address given at registration'}
              </dd>
            </div>
            <p className="m-0 text-xs text-secondary">The street and barangay are hidden here to protect your privacy.</p>
          </dl>
        )}
      </section>

      <section aria-labelledby="track-runners-title" className="flex flex-col gap-3">
        <div>
          <h2 id="track-runners-title" className="m-0 flex items-center gap-2 text-lg font-black uppercase tracking-wide text-white">
            <Users size={20} aria-hidden="true" className="shrink-0 text-accent-orange" />
            What you submitted
          </h2>
          <p className="m-0 mt-1 text-sm leading-relaxed text-secondary">
            {showsAll
              ? 'Check every detail. Some are partly hidden to protect your privacy.'
              : `Showing ${view.runners.length} of the ${view.runnersOnOrder} runners on this order: the ones registered with your email. Some details are partly hidden to protect your privacy.`}
          </p>
        </div>
        {view.runners.map(runner => (
          <TrackRunnerCard key={runner.ref} runner={runner} />
        ))}
      </section>

      <TrackHelpCard view={view} help={help} />
    </div>
  );
}
