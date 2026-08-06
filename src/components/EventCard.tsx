import React from 'react';
import { MapPin, Calendar, Users, ChevronRight } from 'lucide-react';
import { RunningEvent } from '../data/mockEvents';
import './EventCard.css';

interface EventCardProps {
  event: RunningEvent;
}

export default function EventCard({ event }: EventCardProps) {
  return (
    <div className="event-card glass-panel">
      <div className="event-image-container">
        <img src={event.imageUrl} alt={event.title} className="event-image" />
      </div>
      
      <div className="event-content">
        <h3 className="event-title">{event.title}</h3>
        <p className="event-organizer">by Organizer</p>
        
        <div className="event-details">
          <div className="detail-item">
            <Calendar size={16} />
            <span>{event.date}</span>
          </div>
          <div className="detail-item">
            <MapPin size={16} />
            <span>{event.location}</span>
          </div>
        </div>

        <div className="event-distances">
          {event.categories.map((cat, index) => (
            <span key={index} className="distance-badge">{cat.distance}</span>
          ))}
        </div>

        <div className="event-footer">
          <div className="event-price">
            <span className="price-label">Starts at</span>
            <span className="price-amount">₱{event.categories[0]?.price || 0}</span>
          </div>
          <button className="btn-register">
            Register <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
