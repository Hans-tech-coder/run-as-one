import React from 'react';
import prisma from '@/lib/db';
import { ArrowLeft, User, Trophy, Medal, Timer, Hash, Activity, Zap, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import ECertificateGenerator from './ECertificateGenerator';
import EventHeroBanner from '@/components/EventHeroBanner';
import { canonicalResultsPath, eventByParam, resultsPath, runnerResultPath } from '@/lib/event-slug';
import { toWholeSeconds } from '@/lib/race-time';

/**
 * One runner's result, addressed by the number they wore: /results/[slug]/1042.
 *
 * The segment is read as a bib first and as a row cuid only if that finds
 * nothing, which is what keeps every link ever handed to a runner alive. The
 * page used to be addressed by the cuid, so those URLs are in people's messages
 * already; they still resolve here and are then sent on to the bib address, the
 * same way an old cuid *event* link is sent on to its slug.
 *
 * Reading the bib first also means a bib that happens to look like a cuid is
 * still read as the bib — the runner's own number wins over a collision that
 * would show them somebody else.
 */
export default async function RunnerAnalyticsPage({ 
  params 
}: { 
  params: Promise<{ slug: string, bib: string }>
}) {
  const { slug, bib } = await params;

  // The event comes first here, unlike the old cuid lookup: a bib only means
  // something inside one race, so there is nothing to look up until we know
  // which race the URL is naming.
  const event = await prisma.event.findFirst({ where: eventByParam(slug) });
  if (!event) redirect('/results');

  const include = { category: true, event: true } as const;

  let result = await prisma.raceResult.findUnique({
    where: { eventId_bibNumber: { eventId: event.id, bibNumber: bib } },
    include,
  });

  if (!result) {
    // An old link, or a blank-bib row that never had a bib address. Either way
    // the cuid is the only thing left to try.
    const byId = await prisma.raceResult.findUnique({ where: { id: bib }, include });

    // The row still has to belong to the race named in the URL, so a runner
    // cannot be shown under someone else's event.
    if (!byId || byId.eventId !== event.id) redirect(resultsPath(event));

    const bibAddress = runnerResultPath(event, byId);
    if (bibAddress !== `/results/${slug}/${bib}`) redirect(bibAddress);

    result = byId;
  }

  // Whatever the URL carried, the canonical address spells the event as its
  // slug and the runner as their bib.
  const canonical = canonicalResultsPath(event, slug, `/${encodeURIComponent(result.bibNumber.trim() || result.id)}`);
  if (canonical) redirect(canonical);

  // Fetch total runners in this category to show "X out of Y"
  const totalInCategory = await prisma.raceResult.count({
    where: {
      categoryId: result.categoryId,
      status: 'FINISHED'
    }
  });

  const totalInGender = await prisma.raceResult.count({
    where: {
      categoryId: result.categoryId,
      gender: result.gender,
      status: 'FINISHED'
    }
  });

  // Helper to format rank (1st, 2nd, 3rd, 4th)
  const formatRank = (rank: number) => {
    if (rank === 0) return '-';
    const j = rank % 10, k = rank % 100;
    if (j == 1 && k != 11) return rank + "st";
    if (j == 2 && k != 12) return rank + "nd";
    if (j == 3 && k != 13) return rank + "rd";
    return rank + "th";
  };

  // Pace Calculator
  let averagePace = "--:--";
  let speedKmH = "--";
  let distanceKm = 0;
  
  // Extract number from distance string (e.g. "21KM" -> 21, "5K" -> 5, "Half Marathon" -> 21.1)
  const distStr = result.category.distance.toUpperCase();
  if (distStr.includes('21') || distStr.includes('HALF')) distanceKm = 21.1;
  else if (distStr.includes('42') || distStr.includes('FULL')) distanceKm = 42.2;
  else {
    const match = distStr.match(/([\d\.]+)/);
    if (match) distanceKm = parseFloat(match[1]);
  }

  if (distanceKm > 0 && result.chipTime) {
    // Parse chip time HH:MM:SS
    const parts = result.chipTime.split(':').map(Number);
    let totalSeconds = 0;
    if (parts.length === 3) totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) totalSeconds = parts[0] * 60 + parts[1];

    if (totalSeconds > 0) {
      const paceSeconds = totalSeconds / distanceKm;
      const paceMins = Math.floor(paceSeconds / 60);
      const paceSecs = Math.floor(paceSeconds % 60);
      averagePace = `${paceMins.toString().padStart(2, '0')}:${paceSecs.toString().padStart(2, '0')}`;
      
      const speed = distanceKm / (totalSeconds / 3600);
      speedKmH = speed.toFixed(1);
    }
  }

  // The name is the loudest thing on the card, but a 30-character name set at
  // the same size as a 9-character one wraps to four lines and leaves the time
  // panel floating in a hole. Step the display size down as the name grows so
  // every runner gets the same silhouette — roughly two lines — and let each
  // step stay fluid rather than snapping at a breakpoint: the vw term is what
  // keeps a long word from having to break in half in the narrow column at md,
  // and the cap is the size the name reaches once the card is wide enough to
  // carry it. Sizing by length beats forcing line breaks into the name.
  const nameLength = result.name.trim().length;
  const nameScale =
    nameLength > 30 ? 'text-[clamp(1.5rem,4.4vw,2.375rem)]' :
    nameLength > 22 ? 'text-[clamp(1.75rem,4.7vw,2.75rem)]' :
    nameLength > 14 ? 'text-[clamp(2rem,5.5vw,3.25rem)]' :
    'text-[clamp(2.25rem,7vw,3.75rem)]';

  // Timing sheets carry the gender as a letter. "in M" under a rank reads as
  // a typo, so the tile names the division in words.
  const genderWord = /^m(ale)?$/i.test(result.gender.trim()) ? 'Male'
    : /^f(emale)?$/i.test(result.gender.trim()) ? 'Female'
    : result.gender;

  return (
    <div className="relative pb-16 sm:pb-20 w-full">
      <EventHeroBanner event={result.event as any} />
      <div className="py-6 sm:py-8">
        {/* Wide enough that the four analytics tiles each get a real column
            instead of squeezing their labels onto two lines. */}
        <div className="max-w-5xl mx-auto">
          {/* The label always promised the search, and the search lives on
              the full leaderboard — the winners board it used to open has
              only the podiums on it. */}
          <Link href={`/results/${result.event.slug}/full`} className="inline-flex items-center gap-2 min-h-10 text-accent-blue hover:text-white transition-colors mb-4 sm:mb-8">
            <ArrowLeft size={20} /> Back to Leaderboard
          </Link>

          {/* Finisher Profile Card. The padding steps down on a phone: 32px a
              side there left the analytics tiles too narrow for their own
              labels. */}
          <div className="relative rounded-[24px] sm:rounded-[32px] bg-gradient-to-br from-white/[0.05] to-white/[0.01] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),_0_20px_40px_-10px_rgba(0,0,0,0.5)] p-4 min-[360px]:p-5 sm:p-8 md:p-12 mb-8 sm:mb-12 overflow-hidden animate-fade-in t-reveal">
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-accent-blue/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-accent-orange/5 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/4 pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 md:gap-8 mb-6 sm:mb-10 border-b border-white/[0.05] pb-6 sm:pb-10">
              {/* min-w-0 lets this column give way to the time panel instead of
                  holding itself open and squeezing the badges into a ragged second
                  row. The name sizes below are set so that even at 768 — where the
                  column is at its narrowest, about 300px — no word has to break in
                  half. */}
              <div className="w-full md:flex-1 md:min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-secondary mb-4 sm:mb-5">
                  <span className="bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-3 py-1.5 rounded-[12px] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                    <CheckCircle2 size={14} className="shrink-0" /> FINISHER
                  </span>
                  {/* An organizer names their own categories, so this one is the
                      unpredictable label: it keeps to a single line and truncates
                      rather than wrapping inside its pill — the full name is spelled
                      out again under Overall Rank below. */}
                  <span className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-[12px] text-xs font-bold uppercase tracking-wider text-white whitespace-nowrap truncate max-w-full" title={result.category.name}>
                    {result.category.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm bg-black/40 px-3 py-1.5 rounded-[12px] border border-white/5 whitespace-nowrap"><Hash size={14} className="text-secondary shrink-0" /> {result.bibNumber}</span>
                  <span className="flex items-center gap-1.5 text-sm bg-black/40 px-3 py-1.5 rounded-[12px] border border-white/5 whitespace-nowrap"><User size={14} className="text-secondary shrink-0" /> {result.gender}</span>
                </div>
                
                <h1 className={`${nameScale} font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-500 uppercase tracking-tighter leading-[1.05] text-balance break-words t-reveal t-delay-1 drop-shadow-[0_4px_24px_rgba(255,255,255,0.1)]`}>
                  {result.name}
                </h1>
              </div>

              {/* Huge Chip Time display — shrink-0 with a floor on its width, so
                  the time sits in the same place at the same size on every
                  runner's card no matter how long the name beside it is. */}
              <div className="shrink-0 text-center w-full md:w-auto md:min-w-[17rem] bg-black/40 border border-white/[0.08] px-5 sm:px-6 py-4 sm:py-5 rounded-[20px] sm:rounded-[24px] shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] t-reveal t-delay-2 backdrop-blur-md">
                <div className="text-secondary text-xs uppercase tracking-[0.2em] mb-2 font-bold flex items-center justify-center gap-2">
                  <Timer size={14} className="text-accent-orange shrink-0" /> Official Chip Time
                </div>
                <div className="text-[clamp(2.75rem,7.5vw,4.5rem)] leading-[1.1] font-mono font-black text-accent-orange drop-shadow-[0_0_25px_rgba(249,115,22,0.4)] tracking-tighter tabular-nums">
                  {toWholeSeconds(result.chipTime)}
                </div>
                {result.gunTime && (
                  <div className="text-xs text-secondary/70 font-mono mt-2 uppercase tracking-wider">
                    Gun Time: {toWholeSeconds(result.gunTime)}
                  </div>
                )}
              </div>
            </div>

            {/* Detailed Analytics Grid */}
            {/* Four across from 860px, the width at which each tile is finally wide
                enough to hold "Overall Rank" on one line; below that, two roomy
                columns read better than four cramped ones. */}
            <div className="grid grid-cols-2 min-[860px]:grid-cols-4 gap-3 sm:gap-4 md:gap-6 relative z-10 t-stagger is-shown">
              {/* Overall Rank */}
              <div className="bg-white/[0.03] border border-white/[0.05] p-3.5 sm:p-5 rounded-[16px] sm:rounded-[20px] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-300 group cursor-default shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                <div className="text-secondary text-[11px] uppercase tracking-wide sm:tracking-wider mb-2 sm:mb-3 font-medium flex items-center gap-1 min-[360px]:gap-1.5 sm:gap-2 whitespace-nowrap">
                  <Trophy size={14} className="text-yellow-500 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]" /> Overall Rank
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white mb-1 flex items-baseline gap-2">
                  {formatRank(result.categoryRank)}
                  <span className="text-sm font-normal text-secondary/50 font-mono">/ {totalInCategory}</span>
                </div>
                <div className="text-xs text-secondary/60 break-words">in {result.category.name}</div>
              </div>

              {/* Gender Rank */}
              <div className="bg-white/[0.03] border border-white/[0.05] p-3.5 sm:p-5 rounded-[16px] sm:rounded-[20px] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-300 group cursor-default shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                <div className="text-secondary text-[11px] uppercase tracking-wide sm:tracking-wider mb-2 sm:mb-3 font-medium flex items-center gap-1 min-[360px]:gap-1.5 sm:gap-2 whitespace-nowrap">
                  <Medal size={14} className="text-accent-blue drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" /> Gender Rank
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white mb-1 flex items-baseline gap-2">
                  {formatRank(result.genderRank)}
                  <span className="text-sm font-normal text-secondary/50 font-mono">/ {totalInGender}</span>
                </div>
                <div className="text-xs text-secondary/60">in {genderWord} division</div>
              </div>

              {/* Average Pace */}
              <div className="bg-white/[0.03] border border-white/[0.05] p-3.5 sm:p-5 rounded-[16px] sm:rounded-[20px] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-300 group cursor-default relative overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                <div className="absolute right-0 bottom-0 opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 transition-all duration-500 -mr-4 -mb-4"><Activity size={80} /></div>
                <div className="text-secondary text-[11px] uppercase tracking-wide sm:tracking-wider mb-2 sm:mb-3 font-medium flex items-center gap-1 min-[360px]:gap-1.5 sm:gap-2 whitespace-nowrap relative z-10">
                  <Activity size={14} className="text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]" /> Avg Pace
                </div>
                <div className="text-2xl sm:text-3xl font-mono font-bold text-white mb-1 relative z-10">
                  {averagePace}
                </div>
                <div className="text-xs text-secondary/60 relative z-10 tracking-widest font-mono">MIN/KM</div>
              </div>

              {/* Estimated Speed */}
              <div className="bg-white/[0.03] border border-white/[0.05] p-3.5 sm:p-5 rounded-[16px] sm:rounded-[20px] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-300 group cursor-default relative overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                <div className="absolute right-0 bottom-0 opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 transition-all duration-500 -mr-4 -mb-4"><Zap size={80} /></div>
                <div className="text-secondary text-[11px] uppercase tracking-wide sm:tracking-wider mb-2 sm:mb-3 font-medium flex items-center gap-1 min-[360px]:gap-1.5 sm:gap-2 whitespace-nowrap relative z-10">
                  <Zap size={14} className="text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" /> Est Speed
                </div>
                <div className="text-2xl sm:text-3xl font-mono font-bold text-white mb-1 relative z-10">
                  {speedKmH}
                </div>
                <div className="text-xs text-secondary/60 relative z-10 tracking-widest font-mono">KM/H</div>
              </div>
            </div>
          </div>

          {/* Certificate Generator */}
          <React.Suspense fallback={<div className="p-8 text-center text-secondary">Loading certificate...</div>}>
            <ECertificateGenerator result={result} event={result.event} />
          </React.Suspense>

        </div>
      </div>
    </div>
  );
}
