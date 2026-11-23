import prisma, { publishCutoff } from '@/lib/public-db';
import { publishedEvents } from '@/lib/event-visibility';
import { RESULTS_EVENTS } from '@/lib/event-format';
import Link from 'next/link';
import type { ResolvingMetadata } from 'next';
import { ArrowRight, ChevronRight } from 'lucide-react';
import RacePhotoLinks from '@/components/RacePhotoLinks';
import { redirect } from 'next/navigation';
import RaceHeader from '@/components/RaceHeader';
import LinkPendingIcon from '@/components/ui/LinkPendingIcon';
import { canonicalResultsPath, eventByParam, runnerResultPath } from '@/lib/event-slug';
import { toWholeSeconds } from '@/lib/race-time';
import { CATEGORY_ORDER, RACE_DISTANCE_CATEGORIES } from '@/lib/category-order';
import { pacerResultMatcherForEvent } from '@/lib/pacer-store';
import { genderDivision } from '@/lib/gender-division';
import { EVENT_SITE_CLIENT, ensureEventSite, eventPageMetadata } from '@/lib/site-client';

type Winner = { id: string; name: string; bibNumber: string; chipTime: string };

const ORDINALS = ['1st', '2nd', '3rd'] as const;

/**
 * One division's podium as a compact link list (`.winners-*` in `site.css`).
 *
 * Each finisher used to sit in a padded card inside a padded panel with a 48px
 * icon tile and a 48px medal circle, which made six names fill a whole screen
 * and gave no cue on touch that a row opened anything. Now the division is one
 * flat list card, only the rows answer the pointer, and every row ends with a
 * chevron (swapping to the running figure while opening) so a runner can tell
 * at a glance that selecting a winner opens their result and e-certificate.
 */
function DivisionPanel({
  title,
  winners,
  hrefFor,
}: {
  title: string;
  winners: Winner[];
  hrefFor: (winner: Winner) => string;
}) {
  return (
    <div className="winners-division">
      <div className="winners-division__head">
        <h3 className="winners-division__title">{title}</h3>
        {winners.length > 0 && <span className="winners-division__col">Chip Time</span>}
      </div>

      {winners.length === 0 ? (
        <p className="winners-empty">No finishers recorded</p>
      ) : (
        <ol className="winners-list">
          {winners.map((winner, idx) => {
            const place = (idx + 1) as 1 | 2 | 3;
            const time = toWholeSeconds(winner.chipTime);
            const bib = winner.bibNumber.trim();
            return (
              <li key={winner.id}>
                <Link
                  href={hrefFor(winner)}
                  className="winners-row"
                  aria-label={`${ORDINALS[idx]} ${title}: ${winner.name}${bib ? `, bib ${bib}` : ''}, ${time} — view result and e-certificate`}
                >
                  <span className="winners-medal" data-place={place} aria-hidden="true">
                    {place}
                  </span>
                  <span className="winners-row__who">
                    <span className="winners-row__name" title={winner.name}>
                      {winner.name}
                    </span>
                    <span className="winners-row__bib">
                      {bib ? `Bib #${bib}` : 'Official Finisher'}
                    </span>
                  </span>
                  <span className="winners-row__time">{time}</span>
                  <span className="winners-row__go" aria-hidden="true">
                    <LinkPendingIcon>
                      <ChevronRight size={16} />
                    </LinkPendingIcon>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/**
 * Cached per site and address for at most a minute, and dropped by any write
 * (the note is in src/app/s/[site]/(home)/page.tsx).
 */
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

/** One URL per event, on the site it belongs to (CLIENT_SUBDOMAIN_PLAN.md). */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata,
) {
  const { slug } = await params;
  return eventPageMetadata(slug, eventSlug => `/results/${eventSlug}`, parent, 'results');
}

export default async function WinnersOverviewPage({
  params,
}: {
  params: Promise<{ site: string; slug: string }>;
}) {
  const { site, slug } = await params;

  // Slug or cuid — the old id links stay alive; see eventByParam.
  const event = await prisma.event.findFirst({
    where: { AND: [eventByParam(slug), publishedEvents(await publishCutoff()), RESULTS_EVENTS] },
    include: { client: EVENT_SITE_CLIENT },
  });

  if (!event) redirect('/');

  // On its own site first: a client's race opened on another host goes there,
  // path kept (lib/site-client.ts).
  ensureEventSite(event, site, `/results/${encodeURIComponent(slug)}`);

  const canonical = canonicalResultsPath(event, slug);
  if (canonical) redirect(canonical);

  const categories = await prisma.category.findMany({
    where: { eventId: event.id, ...RACE_DISTANCE_CATEGORIES },
    orderBy: CATEGORY_ORDER,
    include: {
      raceResults: {
        where: { status: 'FINISHED' },
        orderBy: { chipTimeSecs: 'asc' },
      },
    },
  });

  // Pacers are not eligible for the podium (see pacerResultMatcher): the next
  // finisher moves up into their place here. Their rank on the full
  // leaderboard is untouched, where they carry a Pacer tag instead.
  const isPacer = await pacerResultMatcherForEvent(event.id);

  const winnersByCategory = categories.map(cat => {
    const contenders = cat.raceResults.filter(r => !isPacer(r));
    const maleResults = contenders.filter(r => genderDivision(r.gender) === 'Male').slice(0, 3);
    const femaleResults = contenders.filter(r => genderDivision(r.gender) === 'Female').slice(0, 3);

    return {
      ...cat,
      finisherCount: cat.raceResults.length,
      winners: {
        Male: maleResults,
        Female: femaleResults,
      },
    };
  });
  const totalFinishers = winnersByCategory.reduce((sum, cat) => sum + cat.finisherCount, 0);

  const hrefFor = (winner: Winner) => runnerResultPath(event, winner);
  const fullHref = `/results/${event.slug}/full`;
  const finisherWord = totalFinishers === 1 ? 'finisher' : 'finishers';
  const lead =
    totalFinishers > 0
      ? categories.length > 1
        ? `Top 3 male and female finishers in each category (${totalFinishers.toLocaleString()} ${finisherWord} overall). Select a winner for their full result and e-certificate, or search by name or bib on the full leaderboard.`
        : `Top 3 male and female finishers out of ${totalFinishers.toLocaleString()} ${finisherWord}. Select a winner for their full result and e-certificate, or search by name or bib on the full leaderboard.`
      : 'Top 3 male and female finishers by category. Open the full leaderboard to search by name or bib.';

  return (
    <div className="site-wrap">
      {/* Every results link lands here first, though most visitors want their
          own time and e-certificate rather than the podium — so the lead says
          both what this board shows and where to search by name or bib, right
          above the leaderboard button and the race's photo albums (D7). */}
      <RaceHeader event={event} back={{ href: '/results', label: 'All Results' }} title="Race Winners" lead={lead}>
        <Link href={fullHref} className="site-btn site-btn--action group">
          See the Full Leaderboard
          <LinkPendingIcon>
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </LinkPendingIcon>
        </Link>
        <RacePhotoLinks albums={event.photoAlbums} align="start" />
      </RaceHeader>

      <div className="winners-board">
        {winnersByCategory.length === 0 ? (
          <div className="winners-category">
            <p className="winners-empty px-0">No results recorded yet.</p>
          </div>
        ) : (
          <>
            {winnersByCategory.map(cat => {
              const distanceLabel = cat.distance || cat.name;
              const linkText =
                cat.finisherCount > 0
                  ? `All ${distanceLabel} Times (${cat.finisherCount.toLocaleString()})`
                  : `All ${distanceLabel} Times`;
              return (
                <section key={cat.id} className="winners-category" aria-labelledby={`winners-${cat.id}`}>
                  <div className="winners-category__head">
                    <h2 id={`winners-${cat.id}`} className="winners-category__title">
                      {/* A package has no distance, so the parenthetical would read "( )". */}
                      {cat.name}{cat.distance ? ` (${cat.distance})` : ''} Winners
                    </h2>
                    <Link href={`${fullHref}?category=${cat.id}`} className="site-link site-link--arrow shrink-0 text-[0.9375rem]">
                      <span>{linkText}</span>
                      <LinkPendingIcon>
                        <ArrowRight size={16} />
                      </LinkPendingIcon>
                    </Link>
                  </div>

                  <div className="winners-grid">
                    <DivisionPanel title="Male" winners={cat.winners.Male} hrefFor={hrefFor} />
                    <DivisionPanel title="Female" winners={cat.winners.Female} hrefFor={hrefFor} />
                  </div>
                </section>
              );
            })}

            {totalFinishers > 0 && (
              <div className="winners-foot">
                <p className="m-0 text-[0.9375rem] text-site-muted">
                  Looking for your own finish time or e-certificate?
                </p>
                <Link href={fullHref} className="site-link site-link--arrow shrink-0 text-[0.9375rem]">
                  <span>Search the Full Leaderboard</span>
                  <LinkPendingIcon>
                    <ArrowRight size={16} />
                  </LinkPendingIcon>
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
