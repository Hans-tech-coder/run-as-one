import prisma, { publishCutoff } from '@/lib/public-db';
import { publishedEvents } from '@/lib/event-visibility';
import { RESULTS_EVENTS } from '@/lib/event-format';
import Link from 'next/link';
import type { ResolvingMetadata } from 'next';
import { User, Hash, ArrowRight } from 'lucide-react';
import RacePhotoLinks from '@/components/RacePhotoLinks';
import { redirect } from 'next/navigation';
import RaceHeader from '@/components/RaceHeader';
import LinkPendingIcon from '@/components/ui/LinkPendingIcon';
import { canonicalResultsPath, eventByParam, runnerResultPath } from '@/lib/event-slug';
import { toWholeSeconds } from '@/lib/race-time';
import { CATEGORY_ORDER, RACE_DISTANCE_CATEGORIES } from '@/lib/category-order';
import { pacerResultMatcherForEvent } from '@/lib/pacer-store';
import { EVENT_SITE_CLIENT, ensureEventSite, eventPageMetadata } from '@/lib/site-client';

type Winner = { id: string; name: string; bibNumber: string; chipTime: string };

// Gold, silver and bronze as flat medal colours (the Paper look has no
// gradients), each with a dark numeral that clears 4.5:1 on it.
const PODIUM = [
  'bg-[#e8bb3a] text-[#3d2c00]',
  'bg-[#cfd5dd] text-[#1f2933]',
  'bg-[#d39a62] text-[#3b1f05]',
];

// Every class a division needs, spelled out whole so Tailwind can see them —
// the two panels differ only in which accent they wear.
const TONES = {
  blue: {
    panel: 'hover:border-site-line',
    badge: 'bg-site-surface text-site-accent border-site-line',
    name: 'group-hover/row:text-site-accent',
    hash: 'text-site-muted',
  },
  orange: {
    panel: 'hover:border-site-action',
    badge: 'bg-site-surface text-site-accent border-site-action',
    name: 'group-hover/row:text-site-accent',
    hash: 'text-site-muted',
  },
} as const;

/**
 * One division's podium. On a phone the row is two lines — the name has the
 * whole width beside the medal, and the bib and time share the line under it —
 * because on one line the medal, the gaps and the time left the name about
 * 70px and every winner read "DANIEL…". From `sm` there is room for the time
 * to sit at the right edge again.
 */
function DivisionPanel({
  title,
  tone,
  winners,
  hrefFor,
}: {
  title: string;
  tone: keyof typeof TONES;
  winners: Winner[];
  hrefFor: (winner: Winner) => string;
}) {
  const t = TONES[tone];
  return (
    <div className={`relative rounded-[14px] sm:rounded-[14px] bg-site-card border border-site-line p-4 sm:p-6 md:p-8 overflow-hidden group transition-colors duration-500 ${t.panel}`}>

      <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8 relative z-10 border-b border-site-line pb-4 sm:pb-5">
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-[12px] sm:rounded-[14px] flex items-center justify-center border shrink-0 ${t.badge}`}>
          <User size={20} />
        </div>
        <h3 className="text-lg sm:text-2xl font-semibold text-site-ink whitespace-nowrap">{title}</h3>
      </div>

      <div className="space-y-2.5 sm:space-y-4 relative z-10">
        {winners.length === 0 ? (
          <div className="text-center py-8 sm:py-10 text-site-muted bg-site-bg rounded-[10px] border border-site-line">No results recorded yet</div>
        ) : (
          winners.map((winner, idx) => {
            const time = toWholeSeconds(winner.chipTime);
            return (
              <Link href={hrefFor(winner)} key={winner.id} className="block no-underline">
                <div className="group/row flex items-center gap-3 sm:gap-5 p-3 sm:p-4 rounded-[14px] sm:rounded-[10px] bg-site-card border border-site-line hover:border-site-ink transition-colors duration-200 cursor-pointer">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-semibold text-lg sm:text-xl shrink-0 ${PODIUM[idx]}`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`font-bold text-site-ink truncate text-base sm:text-lg transition-colors ${t.name}`} title={winner.name}>{winner.name}</h4>
                    <div className="flex items-center justify-between gap-3 mt-1">
                      <span className="text-sm text-secondary flex items-center gap-1.5 min-w-0"><Hash size={14} className={`shrink-0 ${t.hash}`} /> <span className="truncate">{winner.bibNumber}</span></span>
                      <span className="sm:hidden shrink-0 font-mono text-base font-bold text-site-accent tabular-nums">{time}</span>
                    </div>
                  </div>
                  <div className="hidden sm:block text-right shrink-0 pl-2">
                    <span className="font-mono text-xl font-bold text-site-accent tabular-nums">{time}</span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
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
  params
}: {
  params: Promise<{ site: string; slug: string }>
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

  // Fetch categories and top 3 results per gender
  const categories = await prisma.category.findMany({
    where: { eventId: event.id, ...RACE_DISTANCE_CATEGORIES },
    orderBy: CATEGORY_ORDER,
    include: {
      raceResults: {
        where: { status: 'FINISHED' },
        orderBy: { chipTimeSecs: 'asc' },
      }
    }
  });

  // Pacers are not eligible for the podium (see pacerResultMatcher): the next
  // finisher moves up into their place here. Their rank on the full
  // leaderboard is untouched, where they carry a Pacer tag instead.
  const isPacer = await pacerResultMatcherForEvent(event.id);

  const winnersByCategory = categories.map(cat => {
    const contenders = cat.raceResults.filter(r => !isPacer(r));
    const maleResults = contenders.filter(r => r.gender.toLowerCase() === 'male' || r.gender === 'M').slice(0, 3);
    const femaleResults = contenders.filter(r => r.gender.toLowerCase() === 'female' || r.gender === 'F').slice(0, 3);

    return {
      ...cat,
      winners: {
        Male: maleResults,
        Female: femaleResults
      }
    };
  });

  const hrefFor = (winner: Winner) => runnerResultPath(event, winner);

  return (
    <div className="site-wrap">
      {/* The leaderboard first, under the race's name: most runners arriving
          here want their own time, not the podium. The organizer's photo
          albums sit beside it (PAST_EVENTS_PLAN.md D7), here as well as on
          the event page, because a race with results redirects here. */}
      <RaceHeader event={event} back={{ href: '/results', label: 'All results' }} title="Race winners">
        <Link href={`/results/${event.slug}/full`} className="site-btn site-btn--action group">
          See the full leaderboard
          <LinkPendingIcon>
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </LinkPendingIcon>
        </Link>
        <RacePhotoLinks albums={event.photoAlbums} align="center" />
      </RaceHeader>
      <div className="w-full pt-6 pb-16 md:pt-8 md:pb-20">
        <div className="w-full">
          {/* Winners Board */}
          <div className="space-y-12 sm:space-y-16">
            {winnersByCategory.map(cat => (
                <div key={cat.id} className="category-winners-section relative flex flex-col w-full">
                  <div className="site-section__head mb-5 sm:mb-6 w-full">
                    <h2 className="site-h2 min-w-0 break-words">
                      {/* A package has no distance, so the parenthetical
                          would read "( )". */}
                      {cat.name}{cat.distance ? ` (${cat.distance})` : ''} winners
                    </h2>
                    <Link href={`/results/${event.slug}/full?category=${cat.id}`} className="site-link shrink-0">
                      <span>All {cat.distance || cat.name} times</span>
                      <LinkPendingIcon>
                        <ArrowRight size={16} />
                      </LinkPendingIcon>
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 w-full">
                    <DivisionPanel title="Male" tone="blue" winners={cat.winners.Male} hrefFor={hrefFor} />
                    <DivisionPanel title="Female" tone="orange" winners={cat.winners.Female} hrefFor={hrefFor} />
                  </div>
                </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
