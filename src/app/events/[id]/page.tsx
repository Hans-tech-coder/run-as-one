import React from 'react';
import { notFound } from 'next/navigation';
import { Calendar, MapPin, CheckCircle2, ChevronRight, Clock } from 'lucide-react';
import Link from 'next/link';
import db from '@/lib/db';
import './EventDetails.css';
import Navbar from '@/components/Navbar';

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
    <main className="event-details-page">
      <Navbar />
      
      {/* Hero Section */}
      <section className="event-hero">
        <div className="event-hero-bg">
          <img src={event.imageUrl} alt={event.title} />
          <div className="event-hero-overlay"></div>
        </div>
        <div className="container event-hero-content">
          <h1 className="event-hero-title">{event.title}</h1>
          <div className="event-hero-meta flex flex-wrap gap-6">
            <div className="meta-item">
              <Calendar className="meta-icon" />
              <span>{event.date}</span>
            </div>
            {(event.startTime || event.endTime) && (
              <div className="meta-item">
                <Clock className="meta-icon" />
                <span>
                  {event.startTime ? event.startTime : ''} 
                  {event.startTime && event.endTime ? ' - ' : ''} 
                  {event.endTime ? event.endTime : ''}
                </span>
              </div>
            )}
            <div className="meta-item">
              <MapPin className="meta-icon" />
              <span>{event.location}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="container event-main-content">
        <div className="event-info-col">
          <div className="info-block glass-panel">
            <h2>About The Event</h2>
            <p>{event.description || 'Join us for this exciting running event! More details to be announced.'}</p>
          </div>

          <div className="info-block glass-panel mt-8">
            <h2>What's Included</h2>
            <ul className="inclusions-list">
              {defaultInclusions.map((item, idx) => (
                <li key={idx}>
                  <CheckCircle2 className="text-accent-blue" size={20} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {event.raceKitImageUrl && (
             <div className="info-block glass-panel mt-8">
               <h2>Race Kit Reveal</h2>
               <img src={event.raceKitImageUrl} alt="Race Kit Poster" className="w-full rounded-xl border border-white/10" />
             </div>
          )}
        </div>

        <div className="event-sidebar-col">
          <div className="sticky-sidebar glass-panel">
            <h2>Categories</h2>
            <div className="categories-list">
              {event.categories.map((cat) => (
                <div key={cat.id} className="category-item">
                  <div>
                    <div className="category-name">{cat.name}</div>
                    <div className="category-distance">{cat.distance}</div>
                  </div>
                  <div className="category-price">₱{cat.price.toLocaleString()}</div>
                </div>
              ))}
            </div>
            
            <div className="logistics-info">
              {event.logisticsPickup && <span>• On-site Pickup Available</span>}
              {event.logisticsDeliveryFee > 0 && <span>• Delivery (+₱{event.logisticsDeliveryFee})</span>}
            </div>

            <div className="flex flex-col gap-3 mt-6">
              <Link href={`/events/${event.id}/register`} className="btn-gradient w-full register-btn text-center justify-center">
                Register Now <ChevronRight size={20} />
              </Link>
              
              {resultsCount > 0 && (
                <Link href={`/events/${event.id}/results`} className="bg-dark border border-accent-blue text-accent-blue hover:bg-accent-blue hover:text-white transition-colors py-3 px-6 rounded-lg font-bold text-center uppercase tracking-wider flex items-center justify-center gap-2">
                  View Results
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
