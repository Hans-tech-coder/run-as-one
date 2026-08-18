import React from 'react';
import Navbar from '@/components/Navbar';
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
    <main className="min-h-screen relative">
      <Navbar />
      <div className="container mx-auto mt-navbar py-8">
        <div className="text-center mb-12 t-stagger">
          <h1 
            className="text-4xl md:text-5xl font-bold mb-4 text-transparent bg-clip-text pb-1 inline-block t-stagger-line t-stagger-line--1" 
            style={{ backgroundImage: 'var(--gradient-primary)' }}
          >
            Race Results
          </h1>
          <p className="text-secondary text-lg t-stagger-line t-stagger-line--2">Select an event to view the official race results and your runner analytics.</p>
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
      </div>
      <ResultsClientOrchestrator />
    </main>
  );
}
