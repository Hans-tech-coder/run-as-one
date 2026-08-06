"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Calendar, MapPin } from 'lucide-react';
import './EventGrid.css';

// Using a type that matches the Prisma Event model payload
type DBEvent = {
  id: string;
  title: string;
  date: string;
  location: string;
  imageUrl: string;
}

function EventCard({ event }: { event: DBEvent }) {
  return (
    <div className="event-card glass-panel">
      <div className="card-bg-image">
        <img src={event.imageUrl} alt={event.title} />
        <div className="card-overlay"></div>
      </div>
      <div className="card-content">
        <h2 className="card-title">
          {event.title.split(' ').map((word, i) => (
            <React.Fragment key={i}>
              {word}
              <br />
            </React.Fragment>
          ))}
        </h2>
        <div className="card-details">
          <div className="detail-item"><Calendar size={18} className="lucide-icon"/> <span>{event.date}</span></div>
          <div className="detail-item"><MapPin size={18} className="lucide-icon"/> <span>{event.location}</span></div>
        </div>
        <Link href={`/events/${event.id}`} className="btn-gradient" style={{ display: 'block', textDecoration: 'none' }}>
          Register
        </Link>
      </div>
    </div>
  );
}

export default function EventGrid({ events }: { events: DBEvent[] }) {
  return (
    <section className="event-grid-section">
      <div className="event-grid">
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
