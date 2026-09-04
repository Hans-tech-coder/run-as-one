import React from 'react';
import { MapPin, Calendar, Users, ChevronRight } from 'lucide-react';
import { RunningEvent } from '../data/mockEvents';
import EventImage from './EventImage';

interface EventCardProps {
  event: RunningEvent;
}

export default function EventCard({ event }: EventCardProps) {
  return (
    <div className="flex flex-col overflow-hidden transition-all duration-300 h-full glass-panel rounded-xl hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_0_1px_rgba(249,115,22,0.3)] group">
      <div className="relative h-[200px] w-full overflow-hidden shrink-0">
        <EventImage src={event.imageUrl} alt={event.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" iconSize={40} />
      </div>
      
      <div className="p-6 flex flex-col flex-1">
        <h3 className="text-xl font-bold mb-1">{event.title}</h3>
        <p className="text-sm text-secondary font-medium mb-4">by Organizer</p>
        
        <div className="flex flex-col gap-2 mb-5">
          <div className="flex items-center gap-2 text-[0.9rem] text-secondary">
            <Calendar size={16} />
            <span>{event.date}</span>
          </div>
          <div className="flex items-center gap-2 text-[0.9rem] text-secondary">
            <MapPin size={16} />
            <span>{event.location}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6 mt-auto">
          {/* A fun run's categories are packages, which carry no distance —
              their name is the label a runner recognises. */}
          {event.categories.map((cat, index) => (
            <span key={index} className="bg-white/10 px-2 py-1 rounded text-xs font-semibold text-white">{cat.distance || cat.name}</span>
          ))}
        </div>

        <div className="flex justify-between items-end border-t border-white/10 pt-5">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500">Starts at</span>
            <span className="text-xl font-bold text-white">₱{event.categories[0]?.price || 0}</span>
          </div>
          <button className="inline-flex items-center gap-1 bg-transparent text-accent-orange border-none cursor-pointer font-semibold py-2 transition-all duration-200 group-hover:gap-2 p-0">
            Register <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
