import React from 'react';
import { Calendar, MapPin, Clock } from 'lucide-react';
import '../app/events/[slug]/EventDetails.css'; // Reuse existing CSS for now, but will modify it to handle breakout

interface EventHeroBannerProps {
  event: {
    title: string;
    imageUrl: string | null;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    location: string;
  };
}

export default function EventHeroBanner({ event }: EventHeroBannerProps) {
  return (
    <section className="event-hero">
      <div className="event-hero-bg">
        {event.imageUrl && <img src={event.imageUrl} alt={event.title} />}
        <div className="event-hero-overlay"></div>
      </div>
      <div className="container event-hero-content t-stagger is-shown">
        <h1 className="event-hero-title t-stagger-line t-stagger-line--1">{event.title}</h1>
        <div className="event-hero-meta flex flex-wrap gap-6 t-stagger-line t-stagger-line--2">
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
  );
}
