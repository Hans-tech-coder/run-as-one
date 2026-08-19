import React from 'react';
import prisma from '@/lib/db';
import { ArrowLeft, User, Trophy, Medal, Timer, Hash, Activity, Zap, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import ECertificateGenerator from './ECertificateGenerator';
import EventHeroBanner from '@/components/EventHeroBanner';

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

  return (
    <div className="relative pb-20 w-full">
      <EventHeroBanner event={result.event as any} />
      <div className="container mx-auto py-8">
        <div className="max-w-3xl mx-auto">
          <Link href={`/events/${id}/results`} className="inline-flex items-center gap-2 text-accent-blue hover:text-white transition-colors mb-8">
            <ArrowLeft size={20} /> Back to Search
          </Link>

          {/* Finisher Profile Card */}
          <div className="relative rounded-[32px] bg-gradient-to-br from-white/[0.05] to-white/[0.01] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),_0_20px_40px_-10px_rgba(0,0,0,0.5)] p-8 md:p-12 mb-12 overflow-hidden animate-fade-in t-reveal">
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-accent-blue/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-accent-orange/5 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/4 pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-10 border-b border-white/[0.05] pb-10">
              <div>
                <div className="flex flex-wrap items-center gap-3 text-secondary mb-5">
                  <span className="bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-3 py-1.5 rounded-[12px] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> FINISHER
                  </span>
                  <span className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-[12px] text-xs font-bold uppercase tracking-wider text-white">
                    {result.category.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm bg-black/40 px-3 py-1.5 rounded-[12px] border border-white/5"><Hash size={14} className="text-secondary" /> {result.bibNumber}</span>
                  <span className="flex items-center gap-1.5 text-sm bg-black/40 px-3 py-1.5 rounded-[12px] border border-white/5"><User size={14} className="text-secondary" /> {result.gender}</span>
                </div>
                
                <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-500 uppercase tracking-tighter leading-none t-reveal t-delay-1 drop-shadow-[0_4px_24px_rgba(255,255,255,0.1)]">
                  {result.name}
                </h1>
              </div>

              {/* Huge Chip Time display */}
              <div className="text-right md:text-center w-full md:w-auto bg-black/40 border border-white/[0.08] p-6 rounded-[24px] shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] t-reveal t-delay-2 backdrop-blur-md">
                <div className="text-secondary text-xs uppercase tracking-[0.2em] mb-3 font-bold flex items-center justify-start md:justify-end gap-2">
                  <Timer size={14} className="text-accent-orange" /> Official Chip Time
                </div>
                <div className="text-6xl md:text-7xl font-mono font-black text-accent-orange drop-shadow-[0_0_25px_rgba(249,115,22,0.4)] tracking-tighter">
                  {result.chipTime}
                </div>
                {result.gunTime && (
                  <div className="text-xs text-secondary/70 font-mono mt-3 uppercase tracking-wider">
                    Gun Time: {result.gunTime}
                  </div>
                )}
              </div>
            </div>

            {/* Detailed Analytics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 relative z-10 t-stagger is-shown">
              {/* Overall Rank */}
              <div className="bg-white/[0.03] border border-white/[0.05] p-5 rounded-[20px] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-300 group cursor-default shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                <div className="text-secondary text-[11px] uppercase tracking-wider mb-3 font-medium flex items-center gap-2">
                  <Trophy size={14} className="text-yellow-500 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]" /> Overall Rank
                </div>
                <div className="text-3xl font-bold text-white mb-1 flex items-baseline gap-2">
                  {formatRank(result.categoryRank)}
                  <span className="text-sm font-normal text-secondary/50 font-mono">/ {totalInCategory}</span>
                </div>
                <div className="text-xs text-secondary/60">in {result.category.name}</div>
              </div>

              {/* Gender Rank */}
              <div className="bg-white/[0.03] border border-white/[0.05] p-5 rounded-[20px] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-300 group cursor-default shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                <div className="text-secondary text-[11px] uppercase tracking-wider mb-3 font-medium flex items-center gap-2">
                  <Medal size={14} className="text-accent-blue drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" /> Gender Rank
                </div>
                <div className="text-3xl font-bold text-white mb-1 flex items-baseline gap-2">
                  {formatRank(result.genderRank)}
                  <span className="text-sm font-normal text-secondary/50 font-mono">/ {totalInGender}</span>
                </div>
                <div className="text-xs text-secondary/60">in {result.gender}</div>
              </div>

              {/* Average Pace */}
              <div className="bg-white/[0.03] border border-white/[0.05] p-5 rounded-[20px] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-300 group cursor-default relative overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                <div className="absolute right-0 bottom-0 opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 transition-all duration-500 -mr-4 -mb-4"><Activity size={80} /></div>
                <div className="text-secondary text-[11px] uppercase tracking-wider mb-3 font-medium flex items-center gap-2 relative z-10">
                  <Activity size={14} className="text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]" /> Avg Pace
                </div>
                <div className="text-3xl font-mono font-bold text-white mb-1 relative z-10">
                  {averagePace}
                </div>
                <div className="text-xs text-secondary/60 relative z-10 tracking-widest font-mono">MIN/KM</div>
              </div>

              {/* Estimated Speed */}
              <div className="bg-white/[0.03] border border-white/[0.05] p-5 rounded-[20px] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-300 group cursor-default relative overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                <div className="absolute right-0 bottom-0 opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 transition-all duration-500 -mr-4 -mb-4"><Zap size={80} /></div>
                <div className="text-secondary text-[11px] uppercase tracking-wider mb-3 font-medium flex items-center gap-2 relative z-10">
                  <Zap size={14} className="text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" /> Est Speed
                </div>
                <div className="text-3xl font-mono font-bold text-white mb-1 relative z-10">
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
