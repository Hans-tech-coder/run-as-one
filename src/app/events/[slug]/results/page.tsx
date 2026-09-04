import prisma from '@/lib/db';
import Link from 'next/link';
import { User, Medal, Hash, ChevronRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import EventHeroBanner from '@/components/EventHeroBanner';
import { canonicalEventPath, eventByParam } from '@/lib/event-slug';

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

  const canonical = canonicalEventPath(event, slug, '/results');
  if (canonical) redirect(canonical);

  // Fetch categories and top 3 results per gender
  const categories = await prisma.category.findMany({
    where: { eventId: event.id },
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

  return (
    <div className="relative w-full">
      <EventHeroBanner event={event as any} />
      <div className="w-full mt-12">
        <div className="w-full">
          <div className="text-center mb-10">
            <h1 
              className="text-4xl md:text-5xl font-bold mb-4 text-transparent bg-clip-text pb-1"
              style={{ backgroundImage: 'var(--gradient-primary)' }}
            >
              Race Winners
            </h1>
            <p className="text-secondary text-lg mb-8">{event.title}</p>
            
            {/* CTA to Full Leaderboard */}
            <div className="flex justify-center mb-16">
              <Link href={`/events/${event.slug}/results/full`} className="btn-gradient w-full max-w-sm py-4 text-base sm:text-lg rounded-[16px] group shadow-xl shadow-accent-orange/20 no-underline">
                View Full Leaderboard
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform inline-block ml-1" />
              </Link>
            </div>
          </div>

          {/* Winners Board */}
          <div className="space-y-16">
            {winnersByCategory.map(cat => (
                <div key={cat.id} className="category-winners-section relative flex flex-col w-full">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6 mb-8 relative z-10 w-full">
                    <div className="flex items-center gap-3">
                      <Medal className="text-accent-blue" size={28} />
                      <h2 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(to right, #ffffff, #a1a1aa)' }}>
                        {/* A package has no distance, so the parenthetical
                            would read "( )". */}
                        {cat.name}{cat.distance ? ` (${cat.distance})` : ''} Winners
                      </h2>
                      <Medal className="text-accent-blue" size={28} />
                    </div>
                    <Link href={`/events/${event.slug}/results/full?category=${cat.id}`} className="group bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/30 transition-all py-2 px-4 rounded-[16px] font-bold text-sm tracking-wide flex items-center gap-1 shrink-0">
                      View {cat.distance || cat.name} Results
                      <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform inline-block" />
                    </Link>
                  </div>
                
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full">
                    {/* Male Winners */}
                    <div className="relative rounded-[24px] bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] p-6 md:p-8 overflow-hidden group hover:border-accent-blue/30 transition-colors duration-500">
                      <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-accent-blue/10 rounded-full blur-[80px] -mr-32 -mt-32 group-hover:bg-accent-blue/20 transition-colors duration-700 pointer-events-none"></div>
                      
                      <div className="flex items-center gap-4 mb-8 relative z-10 border-b border-white/[0.08] pb-5">
                        <div className="w-12 h-12 rounded-[14px] bg-accent-blue/10 flex items-center justify-center text-accent-blue border border-accent-blue/20 shadow-[0_0_15px_rgba(0,122,255,0.15)]">
                          <User size={22} />
                        </div>
                        <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-wider uppercase">Male Division</h3>
                      </div>
                      
                      <div className="space-y-4 relative z-10">
                        {cat.winners.Male.length === 0 ? (
                          <div className="text-center py-10 text-secondary/50 italic bg-black/20 rounded-[16px] border border-white/5">No results recorded yet</div>
                        ) : (
                          cat.winners.Male.map((winner: any, idx: number) => (
                            <Link href={`/events/${event.slug}/results/${winner.id}`} key={winner.id} className="block no-underline">
                              <div className="group/row flex items-center gap-5 p-4 rounded-[16px] bg-black/40 border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.15] hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all duration-300 cursor-pointer">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl shrink-0
                                  ${idx === 0 ? 'bg-gradient-to-tr from-yellow-600 via-yellow-200 to-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.4),inset_0_2px_4px_rgba(255,255,255,0.6)] text-yellow-950 border border-yellow-300' : 
                                    idx === 1 ? 'bg-gradient-to-tr from-slate-400 via-gray-100 to-slate-300 shadow-[0_0_20px_rgba(148,163,184,0.4),inset_0_2px_4px_rgba(255,255,255,0.8)] text-slate-900 border border-gray-300' : 
                                    'bg-gradient-to-tr from-amber-700 via-orange-300 to-amber-800 shadow-[0_0_20px_rgba(217,119,6,0.4),inset_0_2px_4px_rgba(255,255,255,0.4)] text-amber-950 border border-orange-400'}`}
                                >
                                  {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-bold text-white truncate text-lg group-hover/row:text-accent-blue transition-colors">{winner.name}</h4>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-sm text-secondary flex items-center gap-1.5"><Hash size={14} className="text-accent-blue/70" /> {winner.bibNumber}</span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 pl-2">
                                  <span className="font-mono text-xl font-bold text-accent-orange drop-shadow-[0_2px_10px_rgba(249,115,22,0.3)]">{winner.chipTime}</span>
                                </div>
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                    
                    {/* Female Winners */}
                    <div className="relative rounded-[24px] bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] p-6 md:p-8 overflow-hidden group hover:border-accent-orange/30 transition-colors duration-500">
                      <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-accent-orange/10 rounded-full blur-[80px] -mr-32 -mt-32 group-hover:bg-accent-orange/20 transition-colors duration-700 pointer-events-none"></div>
                      
                      <div className="flex items-center gap-4 mb-8 relative z-10 border-b border-white/[0.08] pb-5">
                        <div className="w-12 h-12 rounded-[14px] bg-accent-orange/10 flex items-center justify-center text-accent-orange border border-accent-orange/20 shadow-[0_0_15px_rgba(249,115,22,0.15)]">
                          <User size={22} />
                        </div>
                        <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-wider uppercase">Female Division</h3>
                      </div>
                      
                      <div className="space-y-4 relative z-10">
                        {cat.winners.Female.length === 0 ? (
                          <div className="text-center py-10 text-secondary/50 italic bg-black/20 rounded-[16px] border border-white/5">No results recorded yet</div>
                        ) : (
                          cat.winners.Female.map((winner: any, idx: number) => (
                            <Link href={`/events/${event.slug}/results/${winner.id}`} key={winner.id} className="block no-underline">
                              <div className="group/row flex items-center gap-5 p-4 rounded-[16px] bg-black/40 border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.15] hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all duration-300 cursor-pointer">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl shrink-0
                                  ${idx === 0 ? 'bg-gradient-to-tr from-yellow-600 via-yellow-200 to-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.4),inset_0_2px_4px_rgba(255,255,255,0.6)] text-yellow-950 border border-yellow-300' : 
                                    idx === 1 ? 'bg-gradient-to-tr from-slate-400 via-gray-100 to-slate-300 shadow-[0_0_20px_rgba(148,163,184,0.4),inset_0_2px_4px_rgba(255,255,255,0.8)] text-slate-900 border border-gray-300' : 
                                    'bg-gradient-to-tr from-amber-700 via-orange-300 to-amber-800 shadow-[0_0_20px_rgba(217,119,6,0.4),inset_0_2px_4px_rgba(255,255,255,0.4)] text-amber-950 border border-orange-400'}`}
                                >
                                  {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-bold text-white truncate text-lg group-hover/row:text-accent-orange transition-colors">{winner.name}</h4>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-sm text-secondary flex items-center gap-1.5"><Hash size={14} className="text-accent-orange/70" /> {winner.bibNumber}</span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 pl-2">
                                  <span className="font-mono text-xl font-bold text-accent-orange drop-shadow-[0_2px_10px_rgba(249,115,22,0.3)]">{winner.chipTime}</span>
                                </div>
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
