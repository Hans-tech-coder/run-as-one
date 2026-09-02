import React from 'react';
import Link from 'next/link';
import { Calendar, MapPin, Trophy } from 'lucide-react';
import db from '@/lib/db';
import ResultsClientOrchestrator from '@/components/ResultsClientOrchestrator';

export default async function GlobalResultsPage() {
  const events = await db.event.findMany({
    where: {
      raceResults: {
        some: {}
      }
    },
    orderBy: { date: 'desc' }
  });

  return (
    <div className="relative overflow-hidden w-full flex flex-col items-center min-h-screen">
      {/* Background Orbs */}
      <div className="absolute -top-[10%] -left-[10%] w-[800px] h-[800px] bg-accent-blue opacity-15 blur-[200px] -z-10 rounded-full" />
      <div className="absolute top-[20%] -right-[10%] w-[600px] h-[600px] bg-accent-orange opacity-15 blur-[200px] -z-10 rounded-full" />
      
      <div className="w-full max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col items-center gap-12 pb-20">
        
        <div className="text-center w-full max-w-3xl mb-4 t-stagger is-shown">
          <div className="flex flex-row w-fit mx-auto items-center justify-center gap-2 mb-4 t-stagger-line t-stagger-line--1">
            <Trophy size={20} className="text-accent-blue" />
            <span className="text-sm font-bold tracking-widest uppercase text-accent-orange">Official Rankings</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 uppercase tracking-tighter leading-tight mb-6 t-stagger-line t-stagger-line--2">
            Race Results
          </h1>
          <p className="text-lg text-secondary leading-relaxed t-stagger-line t-stagger-line--3">
            Select an event to view the official race results and your runner analytics.
          </p>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-12 glass-panel rounded-2xl max-w-2xl mx-auto">
            <Trophy size={48} className="text-accent-orange mx-auto mb-4 opacity-50" />
            <h2 className="text-2xl font-bold mb-2">No Results Available Yet</h2>
            <p className="text-secondary">Race results will appear here once organizers have uploaded them after the events.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map(event => (
              <Link href={`/events/${event.id}/results`} key={event.id} className="t-tilt block">
                <div className="t-tilt-card glass-panel p-0 rounded-2xl overflow-hidden hover:border-accent-blue transition-colors cursor-pointer group h-full flex flex-col border border-white/5 hover:shadow-[0_0_15px_rgba(0,122,255,0.3)] bg-dark/50">
                  <div className="h-48 overflow-hidden relative">
                    <img 
                      src={event.imageUrl} 
                      alt={event.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050505] to-transparent opacity-90"></div>
                  </div>
                  <div className="p-6 flex flex-col flex-1 relative z-10 -mt-8">
                    <h2 className="text-xl font-bold text-white mb-3 group-hover:text-accent-blue transition-colors line-clamp-2">
                      {event.title}
                    </h2>
                    <div className="space-y-2 mt-auto text-sm text-secondary">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-accent-orange" />
                        <span>{event.date}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-accent-orange" />
                        <span className="line-clamp-1">{event.location}</span>
                      </div>
                    </div>
                  </div>
                  <div className="t-tilt-glare"></div>
                </div>
              </Link>
            ))}
          </div>
        )}
      <ResultsClientOrchestrator />
      </div>
    </div>
  );
}
