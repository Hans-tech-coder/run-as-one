import prisma from '@/lib/db';
import Link from 'next/link';
import { User, Medal, Hash, ChevronRight } from 'lucide-react';
import { redirect } from 'next/navigation';

export default async function WinnersOverviewPage({ 
  params 
}: { 
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  
  const event = await prisma.event.findUnique({
    where: { id },
  });

  if (!event) redirect('/');

  // Fetch categories and top 3 results per gender
  const categories = await prisma.category.findMany({
    where: { eventId: id },
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
      <div className="w-full">
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
              <Link href={`/events/${id}/results/full`} className="btn-gradient inline-flex items-center gap-2 text-sm sm:text-base no-underline group px-8 rounded-full">
                View Full Leaderboard
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Winners Board */}
          <div className="space-y-16">
            {winnersByCategory.map(cat => (
              <div key={cat.id} className="category-winners-section relative">
                <div className="flex items-center justify-center gap-3 mb-8 relative z-10">
                  <Medal className="text-accent-blue" size={28} />
                  <h2 className="text-3xl font-bold text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(to right, #ffffff, #a1a1aa)' }}>
                    {cat.name} ({cat.distance}) Winners
                  </h2>
                  <Medal className="text-accent-blue" size={28} />
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Male Winners */}
                  <div className="glass-panel p-6 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-accent-blue/50 transition-colors">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-accent-blue/10 transition-colors"></div>
                    
                    <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                      <div className="w-10 h-10 rounded-full bg-accent-blue/20 flex items-center justify-center text-accent-blue">
                        <User size={20} />
                      </div>
                      <h3 className="text-xl font-bold text-white tracking-wide uppercase">Male Division</h3>
                    </div>
                    
                    <div className="space-y-3">
                      {cat.winners.Male.length === 0 ? (
                        <div className="text-center py-8 text-secondary/50 italic">No results recorded yet</div>
                      ) : (
                        cat.winners.Male.map((winner: any, idx: number) => (
                          <Link href={`/events/${id}/results/${winner.id}`} key={winner.id} className="block no-underline">
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-dark/40 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all cursor-pointer transform hover:-translate-y-1">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0 shadow-lg
                                ${idx === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-yellow-950 border border-yellow-200/50' : 
                                  idx === 1 ? 'bg-gradient-to-br from-gray-200 to-gray-400 text-gray-800 border border-gray-100/50' : 
                                  'bg-gradient-to-br from-amber-500 to-amber-800 text-amber-50 border border-amber-400/30'}`}
                              >
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-white truncate text-lg">{winner.name}</h4>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs text-secondary flex items-center gap-1"><Hash size={12} /> {winner.bibNumber}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-mono text-xl font-bold text-accent-orange">{winner.chipTime}</span>
                              </div>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                  
                  {/* Female Winners */}
                  <div className="glass-panel p-6 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-accent-orange/50 transition-colors">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-accent-orange/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-accent-orange/10 transition-colors"></div>
                    
                    <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                      <div className="w-10 h-10 rounded-full bg-accent-orange/20 flex items-center justify-center text-accent-orange">
                        <User size={20} />
                      </div>
                      <h3 className="text-xl font-bold text-white tracking-wide uppercase">Female Division</h3>
                    </div>
                    
                    <div className="space-y-3">
                      {cat.winners.Female.length === 0 ? (
                        <div className="text-center py-8 text-secondary/50 italic">No results recorded yet</div>
                      ) : (
                        cat.winners.Female.map((winner: any, idx: number) => (
                          <Link href={`/events/${id}/results/${winner.id}`} key={winner.id} className="block no-underline">
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-dark/40 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all cursor-pointer transform hover:-translate-y-1">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0 shadow-lg
                                ${idx === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-yellow-950 border border-yellow-200/50' : 
                                  idx === 1 ? 'bg-gradient-to-br from-gray-200 to-gray-400 text-gray-800 border border-gray-100/50' : 
                                  'bg-gradient-to-br from-amber-500 to-amber-800 text-amber-50 border border-amber-400/30'}`}
                              >
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-white truncate text-lg">{winner.name}</h4>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs text-secondary flex items-center gap-1"><Hash size={12} /> {winner.bibNumber}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-mono text-xl font-bold text-accent-orange">{winner.chipTime}</span>
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
