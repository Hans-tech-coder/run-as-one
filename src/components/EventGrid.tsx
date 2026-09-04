"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Calendar, MapPin, ChevronRight } from 'lucide-react';
import EventImage from './EventImage';

// Using a type that matches the Prisma Event model payload
type DBEvent = {
  id: string;
  /** What the card links to — see src/lib/event-slug.ts. */
  slug: string;
  title: string;
  date: string;
  location: string;
  imageUrl: string;
}

function EventCard({ event }: { event: DBEvent }) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-[20px] border border-white/5 aspect-[4/5] transition-all duration-300 cursor-pointer hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)] group">
      <div className="absolute inset-0 z-10">
        <EventImage src={event.imageUrl} alt={event.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" iconSize={48} />
        <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#0f0f14]/95 via-[#0f0f14]/70 to-[#0f0f14]/10"></div>
      </div>
      <div className="relative z-30 flex flex-col justify-end h-full p-6 sm:p-8">
        <h2 className="font-sans text-2xl sm:text-3xl font-bold uppercase mb-4 leading-tight text-white tracking-tight">
          {event.title}
        </h2>
        <div className="flex flex-col gap-2 mb-6">
          <div className="flex items-center gap-3 text-white/80 font-body text-sm sm:text-base">
            <Calendar size={18} /> <span>{event.date}</span>
          </div>
          <div className="flex items-center gap-3 text-white/80 font-body text-sm sm:text-base">
            <MapPin size={18} /> <span>{event.location}</span>
          </div>
        </div>
        <Link href={`/events/${event.slug}`} className="btn-gradient w-full py-4 text-base sm:text-lg rounded-[16px] group shadow-xl shadow-accent-orange/20 no-underline">
          Register Now <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform inline-block ml-1" />
        </Link>
      </div>
    </div>
  );
}

export default function EventGrid({ events }: { events: DBEvent[] }) {
  return (
    <section className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-24 w-full">
        {events.map((event, index) => (
          <motion.div
            key={event.id}
            initial={{opacity:0, y:30}} 
            animate={{opacity:1, y:0}} 
            transition={{ duration: 0.6, delay: index * 0.1, ease: "easeOut" }}
          >
            <EventCard event={event} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
