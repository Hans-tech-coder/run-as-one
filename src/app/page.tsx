import React from 'react';
import HeroSection from '@/components/HeroSection';
import EventGrid from '@/components/EventGrid';
import db from '@/lib/db';

export default async function Home() {
  const events = await db.event.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  return (
    <div className="relative overflow-hidden w-full flex flex-col items-center">
      {/* Background Orbs matching the mockup */}
      <div className="absolute -top-[10%] -left-[10%] w-[800px] h-[800px] bg-accent-blue opacity-15 blur-[200px] -z-10 rounded-full" />
      <div className="absolute top-[20%] -right-[10%] w-[600px] h-[600px] bg-accent-orange opacity-15 blur-[200px] -z-10 rounded-full" />
      
      <div className="w-full relative z-10 flex flex-col items-center gap-16">
        <HeroSection />
        <EventGrid events={events} />
      </div>
    </div>
  );
}
