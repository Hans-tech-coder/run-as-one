import React from 'react';
import Link from 'next/link';
import { Calendar, ChevronRight, MapPin, Trophy } from 'lucide-react';
import db from '@/lib/db';
import ResultsClientOrchestrator from '@/components/ResultsClientOrchestrator';
import EventImage from '@/components/EventImage';

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
      
      <div className="w-full relative z-10 flex flex-col items-center gap-8 sm:gap-12 pb-10 sm:pb-20">
        
        <div className="text-center w-full max-w-3xl mb-0 sm:mb-4 t-stagger is-shown">
          <div className="flex flex-row w-fit mx-auto items-center justify-center gap-2 mb-4 t-stagger-line t-stagger-line--1">
            <Trophy size={20} className="text-accent-blue" />
            <span className="text-sm font-bold tracking-widest uppercase text-accent-orange">Official Rankings</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 uppercase tracking-tighter leading-tight mb-4 sm:mb-6 t-stagger-line t-stagger-line--2">
            Race Results
          </h1>
          <p className="text-base sm:text-lg text-secondary leading-relaxed t-stagger-line t-stagger-line--3">
            Select an event to view the official race results and your runner analytics.
          </p>
        </div>

        {events.length === 0 ? (
          <NoResultsYet />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map(event => (
              <Link href={`/events/${event.slug}/results`} key={event.id} className="t-tilt block">
                <div className="t-tilt-card glass-panel p-0 rounded-2xl overflow-hidden hover:border-accent-blue transition-colors cursor-pointer group h-full flex flex-col border border-white/5 hover:shadow-[0_0_15px_rgba(0,122,255,0.3)] bg-dark/50">
                  <div className="h-48 overflow-hidden relative">
                    <EventImage
                      src={event.imageUrl}
                      alt={event.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      iconSize={40}
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

/**
 * What this page shows before any organizer has uploaded a result.
 *
 * A runner reaching /results early is not looking at a broken page — they are
 * early — so this states that plainly, says who publishes results and when, and
 * hands them the one thing they can still do: go find a race. The panel is the
 * winners-board panel from /events/[slug]/results (same 24px radius, gradient
 * fill, inset highlight, blurred accent orb) so an empty results page and a
 * full one are recognisably the same surface.
 */
function NoResultsYet() {
  const steps = [
    'You run the race.',
    'The organizer uploads the official times, usually within a few days.',
    'Your finish time, ranking and e-certificate appear here.',
  ];

  return (
    <div className="relative w-full max-w-2xl mx-auto overflow-hidden rounded-[24px] border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 sm:p-10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
      <div className="pointer-events-none absolute -mr-32 -mt-32 right-0 top-0 h-[300px] w-[300px] rounded-full bg-accent-orange/10 blur-[80px]" />
      <div className="pointer-events-none absolute -mb-32 -ml-32 bottom-0 left-0 h-[240px] w-[240px] rounded-full bg-accent-blue/10 blur-[80px]" />

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[20px] border border-accent-orange/20 bg-accent-orange/10 text-accent-orange shadow-[0_0_20px_rgba(255,107,0,0.15)]">
          <Trophy size={30} />
        </div>

        <h2 className="mb-3 text-2xl sm:text-3xl font-black uppercase tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
          No Results Published Yet
        </h2>
        <p className="max-w-md text-base text-secondary leading-relaxed">
          Nothing has been posted here so far. Results go up after a race, once
          the organizer has uploaded the official times.
        </p>
      </div>

      {/* Numbered rather than iconised: these are three points in time, and the
          order is the whole message. */}
      <ol className="relative z-10 mt-8 mb-8 flex list-none flex-col gap-3 p-0">
        {steps.map((step, idx) => (
          <li
            key={idx}
            className="flex items-center gap-4 rounded-[16px] border border-white/[0.05] bg-black/40 p-4 text-left"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
              {idx + 1}
            </span>
            <span className="text-sm sm:text-base text-secondary leading-relaxed">
              {step}
            </span>
          </li>
        ))}
      </ol>

      <div className="relative z-10 flex justify-center">
        <Link
          href="/events"
          className="btn-gradient w-full sm:w-auto justify-center rounded-[16px] px-8 py-4 text-base text-center group no-underline shadow-xl shadow-accent-orange/20"
        >
          <span>Browse Events</span>
          <ChevronRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}
