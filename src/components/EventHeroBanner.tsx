import React from 'react';
import { Calendar, MapPin, Clock, Globe } from 'lucide-react';
import { formatEventDay, formatEventRange, formatEventTime } from '@/lib/event-schedule';
import { VIRTUAL_RUN_WHERE, isVirtual } from '@/lib/event-format';
import '../app/events/[slug]/EventDetails.css'; // Reuse existing CSS for now, but will modify it to handle breakout

interface EventHeroBannerProps {
  event: {
    title: string;
    imageUrl: string | null;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    location: string;
    format?: string | null;
    virtualEndDate?: string | null;
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
          {/* A virtual run has no gun start or venue: its window takes the
              race day's calendar item and the globe takes the venue's place
              (lib/event-format.ts), so both kinds of event read alike. */}
          {isVirtual(event) ? (
            <>
              <div className="meta-item">
                <Calendar className="meta-icon" />
                <span className="whitespace-nowrap">{formatEventRange(event.date, event.virtualEndDate ?? null)}</span>
              </div>
              <div className="meta-item">
                <Globe className="meta-icon" />
                <span>{VIRTUAL_RUN_WHERE}</span>
              </div>
            </>
          ) : (
          <>
          <div className="meta-item">
            <Calendar className="meta-icon" />
            <span>{formatEventDay(event.date)}</span>
          </div>
          {(event.startTime || event.endTime) && (
            <div className="meta-item">
              <Clock className="meta-icon" />
              <span>
                {[event.startTime, event.endTime]
                  .filter((time): time is string => Boolean(time))
                  .map(formatEventTime)
                  .join(' - ')}
              </span>
            </div>
          )}
          <div className="meta-item">
            <MapPin className="meta-icon" />
            <span>{event.location}</span>
          </div>
          </>
          )}
        </div>
      </div>
    </section>
  );
}
