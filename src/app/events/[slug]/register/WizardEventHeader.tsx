"use client";

import React from "react";
import { Calendar, Globe } from "lucide-react";
import EventImage from "@/components/EventImage";
import { formatEventDayShort, formatEventRange } from "@/lib/event-schedule";
import { VIRTUAL_RUN_WHERE, isVirtual } from "@/lib/event-format";

/**
 * The event's picture, title and day at the top of both registration
 * wizards' sidebars.
 *
 * One component so the PayMongo and bank-transfer wizards cannot disagree
 * about when the runner is signing up to run. A virtual run has no race day
 * and no venue, so it shows its window on the same line the public card does
 * (lib/event-format.ts).
 */
export default function WizardEventHeader({
  event,
}: {
  event: {
    imageUrl: string | null;
    title: string;
    date: string;
    format?: string | null;
    virtualEndDate?: string | null;
  };
}) {
  return (
    <div className="event-mini-info border-b border-white/10 pb-6 mb-6">
      <EventImage
        src={event.imageUrl}
        alt={event.title}
        className="mini-image w-20 h-20 rounded-[16px] object-cover shadow-lg"
        iconSize={24}
      />
      <div>
        <h3 className="text-lg sm:text-2xl font-bold text-white mb-1">
          {event.title}
        </h3>
        {/* The same date row as an on-site race, with the window in it, and
            the place on its own row with its own icon. */}
        {isVirtual(event) ? (
          <div className="flex flex-col gap-1">
            <div className="text-sm text-secondary flex items-center gap-1">
              <Calendar size={14} className="shrink-0" />
              <span className="whitespace-nowrap">
                {formatEventRange(event.date, event.virtualEndDate ?? null)}
              </span>
            </div>
            <div className="text-sm text-secondary flex items-center gap-1">
              <Globe size={14} className="shrink-0" /> {VIRTUAL_RUN_WHERE}
            </div>
          </div>
        ) : (
          <div className="text-sm text-secondary flex items-center gap-1">
            <Calendar size={14} /> {formatEventDayShort(event.date)}
          </div>
        )}
      </div>
    </div>
  );
}
