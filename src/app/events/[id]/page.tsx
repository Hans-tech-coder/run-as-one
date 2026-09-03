import React from 'react';
import { notFound } from 'next/navigation';
import { Calendar, MapPin, CheckCircle2, ChevronRight, Clock } from 'lucide-react';
import Link from 'next/link';
import db from '@/lib/db';
import { formatPesos } from '@/lib/money';
import { sellsPackages } from '@/lib/event-type';
import './EventDetails.css';

import EventHeroBanner from '@/components/EventHeroBanner';

export default async function EventDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const event = await db.event.findUnique({
    where: { id },
    include: { categories: true }
  });

  const resultsCount = await db.raceResult.count({
    where: { eventId: id }
  });

  if (!event) {
    notFound();
  }

  // Default inclusions since they aren't dynamic yet
  const defaultInclusions = [
    'Race Singlet',
    'Finisher Medal',
    'Race Bib with Timing Chip',
    'Sponsor Lootbag'
  ];

  return (
    <div className="event-details-page">
      <EventHeroBanner event={event as any} />

      {/* Main Content */}
      <section className="container mt-12 mb-20 t-stagger is-shown">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: About & Inclusions */}
          <div className="lg:col-span-2 space-y-8">
            <div className="info-block glass-panel p-8 rounded-3xl border border-white/10 hover:border-accent-blue/30 transition-colors t-stagger-line t-stagger-line--3">
              <h2 className="text-3xl font-bold mb-6 text-white tracking-tight">About The Event</h2>
              <p className="text-lg text-secondary leading-relaxed">{event.description || 'Join us for this exciting running event! More details to be announced.'}</p>
            </div>

            <div className="info-block glass-panel p-8 rounded-3xl border border-white/10 hover:border-accent-blue/30 transition-colors t-stagger-line t-stagger-line--4">
              <h2 className="text-3xl font-bold mb-6 text-white tracking-tight">What's Included</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {defaultInclusions.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-accent-blue/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="text-accent-blue" size={24} />
                    </div>
                    <span className="font-medium text-white/90">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {event.raceKitImageUrl && (
               <div className="info-block glass-panel p-8 rounded-3xl border border-white/10 hover:border-accent-blue/30 transition-colors t-stagger-line t-stagger-line--5">
                 <h2 className="text-3xl font-bold mb-6 text-white tracking-tight">Race Kit Reveal</h2>
                 <img src={event.raceKitImageUrl} alt="Race Kit Poster" className="w-full rounded-2xl border border-white/10 shadow-2xl" />
               </div>
            )}
          </div>

          {/* Right Column: Sidebar (Sticky) */}
          <div className="lg:col-span-1 t-stagger-line t-stagger-line--3">
            <div className="sticky top-32 space-y-6">
              
              {/* Categories Bento */}
              <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent">
                <h2 className="text-2xl font-bold mb-6 text-white">{sellsPackages(event) ? 'Packages' : 'Categories'}</h2>
                <div className="flex flex-col gap-4">
                  {event.categories.map((cat: any) => (
                    <div key={cat.id} className="group relative overflow-hidden bg-black/40 border border-white/5 rounded-2xl p-5 hover:border-accent-orange/50 transition-colors flex items-center justify-between">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-accent-orange/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-accent-orange/20 transition-all"></div>
                      <div className="relative z-10">
                        <div className="font-bold text-lg text-white mb-1">{cat.name}</div>
                        {/* Packages have no distance; an empty pill is worse
                            than no pill. */}
                        {cat.distance && <div className="text-sm text-secondary bg-white/10 inline-block px-3 py-1 rounded-full">{cat.distance}</div>}
                      </div>
                      <div className="relative z-10 text-xl font-bold text-accent-orange">
                        ₱{formatPesos(cat.price)}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 pt-6 border-t border-white/10 text-sm text-secondary flex flex-col gap-2">
                  {event.logisticsPickup && <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-accent-blue" /> On-site Pickup Available</div>}
                  {event.logisticsDeliveryFeeInside > 0 && <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-accent-blue" /> Delivery, inside province (+₱{formatPesos(event.logisticsDeliveryFeeInside)})</div>}
                  {event.logisticsDeliveryFeeOutside > 0 && <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-accent-blue" /> Delivery, outside province (+₱{formatPesos(event.logisticsDeliveryFeeOutside)})</div>}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-4">
                <Link href={`/events/${event.id}/register`} className="btn-gradient w-full text-center justify-center py-4 text-lg font-bold flex items-center gap-2 group shadow-xl shadow-accent-orange/20">
                  Register Now <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform inline-block ml-1" />
                </Link>
                
                {resultsCount > 0 && (
                  <Link href={`/events/${event.id}/results`} className="w-full bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/30 transition-all py-4 px-6 rounded-[16px] font-bold text-center uppercase tracking-wider flex items-center justify-center gap-2">
                    View Results
                  </Link>
                )}
              </div>

            </div>
          </div>
          
        </div>
      </section>
    </div>
  );
}
