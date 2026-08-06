import React from 'react';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import EventGrid from '@/components/EventGrid';
import db from '@/lib/db';

export default async function Home() {
  const events = await db.event.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  return (
    <main style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Background Orbs matching the mockup */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '-10%',
        width: '800px',
        height: '800px',
        background: 'var(--accent-blue)',
        filter: 'blur(200px)',
        opacity: 0.15,
        zIndex: -1,
        borderRadius: '50%'
      }} />
      <div style={{
        position: 'absolute',
        top: '20%',
        right: '-10%',
        width: '600px',
        height: '600px',
        background: 'var(--accent-orange)',
        filter: 'blur(200px)',
        opacity: 0.15,
        zIndex: -1,
        borderRadius: '50%'
      }} />
      
      <Navbar />
      <div className="container" style={{ paddingTop: '160px' }}>
        <HeroSection />
        <EventGrid events={events} />
      </div>
    </main>
  );
}
