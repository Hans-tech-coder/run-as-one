"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Calendar, MapPin, ChevronRight } from 'lucide-react';
import EventImage from './EventImage';
import { formatEventDayShort } from '@/lib/event-schedule';

// Using a type that matches the Prisma Event model payload
type DBEvent = {
  id: string;
  /** What the card links to — see src/lib/event-slug.ts. */
  slug: string;
  title: string;
  date: string;
  location: string;
  imageUrl: string;
  /**
   * Set by `forListing` in lib/registration-gate.ts when this race cannot be
   * signed up for: every option sold out, or the organizer paused it. Absent on
   * /results, where every event is finished and the card offers times instead.
   */
  registrationClosed?: 'PAUSED' | 'FULL' | null;
}

/**
 * What the card's button does. The two public listings show the same event at
 * two points in its life — open for registration on /events, already run on
 * /results — so they share one card and differ only in where it sends you. A
 * plain string rather than a callback because the pages rendering this client
 * component are Server Components, and a function cannot cross that boundary.
 */
export type EventCardAction = 'register' | 'results';

const ACTIONS: Record<EventCardAction, { label: string; path: (slug: string) => string }> = {
  register: { label: 'Register Now', path: (slug) => `/events/${slug}` },
  results: { label: 'View Results', path: (slug) => `/events/${slug}/results` },
};

/** The corner chip, and the word the button uses instead of "Register Now". */
const CLOSURES = {
  FULL: { badge: 'Full', label: 'View Event' },
  PAUSED: { badge: 'Paused', label: 'View Event' },
} as const;

function EventCard({ event, action }: { event: DBEvent; action: EventCardAction }) {
  const { label, path } = ACTIONS[action];
  // A race nobody can enter still links to its own page: that page is where
  // the reason lives, and the categories, inclusions and race kit are all
  // still worth reading. What changes is that the card stops promising a
  // sign-up it cannot deliver — the button drops the gradient it shares with
  // every live card and says what it actually does.
  const closure =
    action === 'register' && event.registrationClosed
      ? CLOSURES[event.registrationClosed]
      : null;

  return (
    <div className="relative flex flex-col overflow-hidden rounded-[20px] border border-white/5 aspect-[4/5] transition-all duration-300 cursor-pointer hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)] group">
      <div className="absolute inset-0 z-10">
        <EventImage src={event.imageUrl} alt={event.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" iconSize={48} />
        <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#0f0f14]/95 via-[#0f0f14]/70 to-[#0f0f14]/10"></div>
      </div>
      {/* Over the image rather than down beside the title, so a runner
          scanning a grid of six reads it without reading anything else. */}
      {closure && (
        <span className="absolute right-4 top-4 z-30 rounded-full border border-white/20 bg-black/70 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-sm">
          {closure.badge}
        </span>
      )}
      <div className="relative z-30 flex flex-col justify-end h-full p-5 sm:p-8">
        <h2 className="font-sans text-2xl sm:text-3xl font-bold uppercase mb-4 leading-tight text-white tracking-tight">
          {event.title}
        </h2>
        <div className="flex flex-col gap-2 mb-6">
          <div className="flex items-center gap-3 text-white/80 font-body text-sm sm:text-base">
            <Calendar size={18} /> <span>{formatEventDayShort(event.date)}</span>
          </div>
          <div className="flex items-center gap-3 text-white/80 font-body text-sm sm:text-base">
            <MapPin size={18} /> <span>{event.location}</span>
          </div>
        </div>
        {closure ? (
          <Link href={path(event.slug)} className="w-full flex items-center justify-center gap-2 py-4 text-base sm:text-lg rounded-[16px] border border-white/15 bg-white/[0.06] font-bold uppercase tracking-wider text-white no-underline transition-colors hover:border-white/30 hover:bg-white/10 group">
            {closure.label} <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform inline-block" />
          </Link>
        ) : (
          <Link href={path(event.slug)} className="btn-gradient w-full py-4 text-base sm:text-lg rounded-[16px] group shadow-xl shadow-accent-orange/20 no-underline">
            {label} <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform inline-block ml-1" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function EventGrid({
  events,
  action = 'register',
}: {
  events: DBEvent[];
  action?: EventCardAction;
}) {
  return (
    <section className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 w-full">
        {events.map((event, index) => (
          <motion.div
            key={event.id}
            initial={{opacity:0, y:30}} 
            animate={{opacity:1, y:0}} 
            transition={{ duration: 0.6, delay: index * 0.1, ease: "easeOut" }}
          >
            <EventCard event={event} action={action} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
