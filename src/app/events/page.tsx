import React from 'react';
import EventGrid from '@/components/EventGrid';
import db from '@/lib/db';
import { Calendar } from 'lucide-react';

export default async function EventsPage() {
  const events = await db.event.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="relative overflow-hidden w-full flex flex-col items-center">
      {/* Background Orbs */}
      <div className="absolute -top-[10%] -left-[10%] w-[800px] h-[800px] bg-accent-blue opacity-15 blur-[200px] -z-10 rounded-full" />
      <div className="absolute top-[20%] -right-[10%] w-[600px] h-[600px] bg-accent-orange opacity-15 blur-[200px] -z-10 rounded-full" />
      
      <div className="w-full relative z-10 flex flex-col items-center gap-8 sm:gap-12">
        
        <div className="text-center w-full max-w-3xl mb-0 sm:mb-4 t-stagger is-shown">
          <div className="flex flex-row w-fit mx-auto items-center justify-center gap-2 mb-4 t-stagger-line t-stagger-line--1">
            <Calendar size={20} className="text-accent-blue" />
            <span className="text-sm font-bold tracking-widest uppercase text-accent-orange">Upcoming Events</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 uppercase tracking-tighter leading-tight mb-4 sm:mb-6 t-stagger-line t-stagger-line--2">
            Find Your Next Race
          </h1>
          <p className="text-base sm:text-lg text-secondary leading-relaxed t-stagger-line t-stagger-line--3">
            Browse through all our official marathons, fun runs, and virtual races. Register today and join the community.
          </p>
        </div>

        <EventGrid events={events} />
      </div>
    </div>
  );
}
