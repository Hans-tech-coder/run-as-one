import prisma from '@/lib/db';
import Navbar from '@/components/Navbar';
import { ArrowLeft, User, Trophy, Medal, Timer, Hash } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import ECertificateGenerator from './ECertificateGenerator';

export default async function RunnerAnalyticsPage({ 
  params 
}: { 
  params: Promise<{ id: string, resultId: string }>
}) {
  const { id, resultId } = await params;

  const result = await prisma.raceResult.findUnique({
    where: { id: resultId },
    include: {
      category: true,
      event: true
    }
  });

  if (!result || result.eventId !== id) {
    redirect(`/events/${id}/results`);
  }

  // Helper to format rank (1st, 2nd, 3rd, 4th)
  const formatRank = (rank: number) => {
    if (rank === 0) return '-';
    const j = rank % 10, k = rank % 100;
    if (j == 1 && k != 11) return rank + "st";
    if (j == 2 && k != 12) return rank + "nd";
    if (j == 3 && k != 13) return rank + "rd";
    return rank + "th";
  };

  return (
    <main className="min-h-screen relative pb-20">
      <Navbar />
      
      <div className="container mx-auto py-8 mt-navbar">
        <div className="max-w-3xl mx-auto">
          <Link href={`/events/${id}/results`} className="inline-flex items-center gap-2 text-accent-blue hover:text-white transition-colors mb-8">
            <ArrowLeft size={20} /> Back to Search
          </Link>

          {/* Header Card */}
          <div className="glass-panel p-8 rounded-3xl relative overflow-hidden mb-8 border-t border-accent-blue/30">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent-blue/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 text-secondary mb-2">
                <span className="bg-dark/50 px-3 py-1 rounded-full text-xs font-medium border border-gray-800">
                  {result.category.name}
                </span>
                <span className="flex items-center gap-1 text-sm"><Hash size={14} /> Bib: {result.bibNumber}</span>
                <span className="flex items-center gap-1 text-sm"><User size={14} /> {result.gender}</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 uppercase tracking-tight">
                {result.name}
              </h1>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-dark/40 border border-gray-800/50 p-4 rounded-xl">
                  <div className="text-secondary text-xs uppercase tracking-wider mb-1 flex items-center gap-2">
                    <Timer size={14} className="text-accent-orange" /> Chip Time
                  </div>
                  <div className="text-3xl font-mono font-bold text-white">{result.chipTime}</div>
                </div>
                <div className="bg-dark/40 border border-gray-800/50 p-4 rounded-xl">
                  <div className="text-secondary text-xs uppercase tracking-wider mb-1 flex items-center gap-2">
                    <Timer size={14} className="text-secondary" /> Gun Time
                  </div>
                  <div className="text-2xl font-mono font-bold text-gray-400">{result.gunTime || '--:--:--'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Rankings Grid */}
          <h2 className="text-2xl font-bold mb-4 text-white flex items-center gap-2">
            <Trophy className="text-accent-orange" /> Official Rankings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="glass-panel p-6 rounded-2xl text-center relative overflow-hidden group hover:border-accent-blue/50 transition-colors">
              <div className="text-secondary text-sm mb-2 font-medium">Overall Rank</div>
              <div className="text-5xl font-bold text-white mb-1">{formatRank(result.overallRank)}</div>
              <div className="text-xs text-secondary">out of all runners</div>
            </div>
            
            <div className="glass-panel p-6 rounded-2xl text-center relative overflow-hidden group hover:border-accent-blue/50 transition-colors">
              <div className="text-secondary text-sm mb-2 font-medium">Gender Rank</div>
              <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-blue-400 to-accent-blue mb-1">
                {formatRank(result.genderRank)}
              </div>
              <div className="text-xs text-secondary">in {result.category.name} ({result.gender})</div>
            </div>
            
            <div className="glass-panel p-6 rounded-2xl text-center relative overflow-hidden group hover:border-accent-orange/50 transition-colors">
              <div className="text-secondary text-sm mb-2 font-medium">Category Rank</div>
              <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-orange-400 to-accent-orange mb-1">
                {formatRank(result.categoryRank)}
              </div>
              <div className="text-xs text-secondary">in {result.category.name}</div>
            </div>
          </div>

          {/* Certificate Generator */}
          <ECertificateGenerator result={result} event={result.event} />

        </div>
      </div>
    </main>
  );
}
