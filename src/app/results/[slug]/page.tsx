import prisma from '@/lib/db';
import Link from 'next/link';
import { User, Hash, ChevronRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import EventHeroBanner from '@/components/EventHeroBanner';
import LinkPendingIcon from '@/components/ui/LinkPendingIcon';
import { canonicalResultsPath, eventByParam, runnerResultPath } from '@/lib/event-slug';
import { toWholeSeconds } from '@/lib/race-time';
import { CATEGORY_ORDER } from '@/lib/category-order';

type Winner = { id: string; name: string; bibNumber: string; chipTime: string };

const PODIUM = [
  'bg-gradient-to-tr from-yellow-600 via-yellow-200 to-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.4),inset_0_2px_4px_rgba(255,255,255,0.6)] text-yellow-950 border border-yellow-300',
  'bg-gradient-to-tr from-slate-400 via-gray-100 to-slate-300 shadow-[0_0_20px_rgba(148,163,184,0.4),inset_0_2px_4px_rgba(255,255,255,0.8)] text-slate-900 border border-gray-300',
  'bg-gradient-to-tr from-amber-700 via-orange-300 to-amber-800 shadow-[0_0_20px_rgba(217,119,6,0.4),inset_0_2px_4px_rgba(255,255,255,0.4)] text-amber-950 border border-orange-400',
];

// Every class a division needs, spelled out whole so Tailwind can see them —
// the two panels differ only in which accent they wear.
const TONES = {
  blue: {
    panel: 'hover:border-accent-blue/30',
    glow: 'bg-accent-blue/10 group-hover:bg-accent-blue/20',
    badge: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20 shadow-[0_0_15px_rgba(0,122,255,0.15)]',
    name: 'group-hover/row:text-accent-blue',
    hash: 'text-accent-blue/70',
  },
  orange: {
    panel: 'hover:border-accent-orange/30',
    glow: 'bg-accent-orange/10 group-hover:bg-accent-orange/20',
    badge: 'bg-accent-orange/10 text-accent-orange border-accent-orange/20 shadow-[0_0_15px_rgba(249,115,22,0.15)]',
    name: 'group-hover/row:text-accent-orange',
    hash: 'text-accent-orange/70',
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
    <div className={`relative rounded-[20px] sm:rounded-[24px] bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] p-4 sm:p-6 md:p-8 overflow-hidden group transition-colors duration-500 ${t.panel}`}>
      <div className={`absolute top-0 right-0 w-[300px] h-[300px] rounded-full blur-[80px] -mr-32 -mt-32 transition-colors duration-700 pointer-events-none ${t.glow}`}></div>

      <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8 relative z-10 border-b border-white/[0.08] pb-4 sm:pb-5">
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-[12px] sm:rounded-[14px] flex items-center justify-center border shrink-0 ${t.badge}`}>
          <User size={20} />
        </div>
        <h3 className="text-lg sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-wider uppercase whitespace-nowrap">{title}</h3>
      </div>

      <div className="space-y-2.5 sm:space-y-4 relative z-10">
        {winners.length === 0 ? (
          <div className="text-center py-8 sm:py-10 text-secondary/50 italic bg-black/20 rounded-[16px] border border-white/5">No results recorded yet</div>
        ) : (
          winners.map((winner, idx) => {
            const time = toWholeSeconds(winner.chipTime);
            return (
              <Link href={hrefFor(winner)} key={winner.id} className="block no-underline">
                <div className="group/row flex items-center gap-3 sm:gap-5 p-3 sm:p-4 rounded-[14px] sm:rounded-[16px] bg-black/40 border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.15] hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all duration-300 cursor-pointer">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black text-lg sm:text-xl shrink-0 ${PODIUM[idx]}`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`font-bold text-white truncate text-base sm:text-lg transition-colors ${t.name}`} title={winner.name}>{winner.name}</h4>
                    <div className="flex items-center justify-between gap-3 mt-1">
                      <span className="text-sm text-secondary flex items-center gap-1.5 min-w-0"><Hash size={14} className={`shrink-0 ${t.hash}`} /> <span className="truncate">{winner.bibNumber}</span></span>
                      <span className="sm:hidden shrink-0 font-mono text-base font-bold text-accent-orange tabular-nums">{time}</span>
                    </div>
                  </div>
                  <div className="hidden sm:block text-right shrink-0 pl-2">
                    <span className="font-mono text-xl font-bold text-accent-orange tabular-nums drop-shadow-[0_2px_10px_rgba(249,115,22,0.3)]">{time}</span>
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


export default async function WinnersOverviewPage({
  params
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params;

  // Slug or cuid — the old id links stay alive; see eventByParam.
  const event = await prisma.event.findFirst({
    where: eventByParam(slug),
  });

  if (!event) redirect('/');

  const canonical = canonicalResultsPath(event, slug);
  if (canonical) redirect(canonical);

  // Fetch categories and top 3 results per gender
  const categories = await prisma.category.findMany({
    where: { eventId: event.id },
    orderBy: CATEGORY_ORDER,
    include: {
      raceResults: {
        where: { status: 'FINISHED' },
        orderBy: { chipTimeSecs: 'asc' },
      }
    }
  });

  const winnersByCategory = categories.map(cat => {
    const maleResults = cat.raceResults.filter(r => r.gender.toLowerCase() === 'male' || r.gender === 'M').slice(0, 3);
    const femaleResults = cat.raceResults.filter(r => r.gender.toLowerCase() === 'female' || r.gender === 'F').slice(0, 3);

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
    <div className="relative w-full">
      <EventHeroBanner event={event as any} />
      <div className="w-full mt-10 sm:mt-12">
        <div className="w-full">
          <div className="text-center mb-8 sm:mb-10">
            <h1
              className="text-4xl md:text-5xl font-bold mb-3 sm:mb-4 text-transparent bg-clip-text pb-1"
              style={{ backgroundImage: 'var(--gradient-primary)' }}
            >
              Race Winners
            </h1>
            <p className="text-secondary text-base sm:text-lg mb-6 sm:mb-8 text-balance">{event.title}</p>

            {/* CTA to Full Leaderboard */}
            <div className="flex justify-center mb-12 sm:mb-16">
              <Link href={`/results/${event.slug}/full`} className="btn-gradient w-full max-w-sm py-4 text-base sm:text-lg rounded-[16px] group shadow-xl shadow-accent-orange/20 no-underline">
                View Full Leaderboard
                <LinkPendingIcon className="ml-1">
                  <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform inline-block" />
                </LinkPendingIcon>
              </Link>
            </div>
          </div>

          {/* Winners Board */}
          <div className="space-y-12 sm:space-y-16">
            {winnersByCategory.map(cat => (
                <div key={cat.id} className="category-winners-section relative flex flex-col w-full">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-6 mb-5 sm:mb-8 relative z-10 w-full">
                    <h2 className="min-w-0 text-2xl md:text-3xl font-bold text-center md:text-left text-balance text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(to right, #ffffff, #a1a1aa)' }}>
                      {/* A package has no distance, so the parenthetical
                          would read "( )". */}
                      {cat.name}{cat.distance ? ` (${cat.distance})` : ''} Winners
                    </h2>
                    <Link href={`/results/${event.slug}/full?category=${cat.id}`} className="group bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/30 transition-all min-h-10 py-2 px-4 rounded-[16px] font-bold text-sm tracking-wide flex items-center gap-1 shrink-0">
                      View {cat.distance || cat.name} Results
                      <LinkPendingIcon>
                        <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform inline-block" />
                      </LinkPendingIcon>
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 w-full">
                    <DivisionPanel title="Male Division" tone="blue" winners={cat.winners.Male} hrefFor={hrefFor} />
                    <DivisionPanel title="Female Division" tone="orange" winners={cat.winners.Female} hrefFor={hrefFor} />
                  </div>
                </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
