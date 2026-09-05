import React from 'react';
import HeroSection from '@/components/HeroSection';
import HomeEventBrowser from '@/components/HomeEventBrowser';
import db from '@/lib/db';
import { soonestFirst, upcomingEvents } from '@/lib/event-schedule';

const HOME_EVENT_LIMIT = 6;

export default async function Home() {
  // Two rows of cards on a desktop grid rather than one, so the section that
  // the page exists for looks like a listing instead of a leftover. The count
  // decides whether a "view all" link is worth showing at all.
  //
  // Upcoming races only, soonest first: this section is headed "Open For
  // Registration", and a race that has already been run is neither. Finished
  // races move to /results — see src/lib/event-schedule.ts.
  const upcoming = upcomingEvents();
  const [events, totalEvents] = await Promise.all([
    db.event.findMany({
      where: upcoming,
      orderBy: soonestFirst,
      take: HOME_EVENT_LIMIT,
    }),
    db.event.count({ where: upcoming }),
  ]);

  return (
    <div className="relative overflow-hidden w-full flex flex-col items-center">
      {/* Background Orbs matching the mockup */}
      <div className="absolute -top-[10%] -left-[10%] w-[800px] h-[800px] bg-accent-blue opacity-15 blur-[200px] -z-10 rounded-full" />
      <div className="absolute top-[20%] -right-[10%] w-[600px] h-[600px] bg-accent-orange opacity-15 blur-[200px] -z-10 rounded-full" />

      <div className="w-full relative z-10 flex flex-col items-center gap-10 sm:gap-20">
        <HeroSection />
        <HomeEventBrowser events={events} totalEvents={totalEvents} />
        <HowItWorks />
      </div>
    </div>
  );
}

/**
 * Closes the page off.
 *
 * Without it the last race card ran straight into the footer, which is what
 * made the page trail off rather than end. It sits deliberately quiet — one
 * column of muted rows — so it never competes with the cards above it.
 */
function HowItWorks() {
  const steps = [
    {
      title: 'Pick your race',
      body: 'Browse open events, compare distances or packages, and see exactly what each one includes before you commit.',
    },
    {
      title: 'Register your group',
      body: 'Add every runner in one transaction, choose kit pickup or delivery, and pay by card, e-wallet or bank transfer.',
    },
    {
      title: 'Run, then collect your time',
      body: 'Official results and your e-certificate are published here once the organizer uploads them.',
    },
  ];

  return (
    <section className="w-full max-w-4xl mx-auto pb-4">
      <div className="text-center mb-8 sm:mb-10">
        <span className="text-xs sm:text-sm font-bold tracking-widest uppercase text-accent-orange">
          How It Works
        </span>
        <h2 className="mt-2 text-2xl sm:text-3xl font-black uppercase tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
          From Sign-Up To Finish Line
        </h2>
      </div>

      <ol className="flex flex-col gap-3 list-none p-0 m-0">
        {steps.map((step, idx) => (
          <li
            key={step.title}
            className="flex items-start gap-4 rounded-[16px] border border-white/[0.05] bg-black/40 p-4 sm:p-5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
              {idx + 1}
            </span>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                {step.title}
              </h3>
              <p className="text-sm sm:text-base text-secondary leading-relaxed m-0">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
