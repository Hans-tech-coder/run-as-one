"use client";

import React, { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import type { EventHighlight } from '@/lib/event-highlights';
import ZoomLightbox from '@/components/ui/ZoomLightbox';
import './EventHighlightsGallery.css';

/**
 * The event page's highlight posters: race kit, trophies, the venue, an after
 * party.
 *
 * Several posters sit in the same 4:5 tile (one per row on a phone, two from
 * sm up), covered rather than contained so the rows stay even whatever shape
 * each poster is — the whole poster is one tap away. A lone poster has nothing
 * to line up with, so it fills the section's width at its own shape, uncropped. Each carries its
 * caption as a tag in the top-right corner. Hovering dims the poster and says
 * it opens full screen; on touch screens, which cannot hover, a small expand
 * badge says the same thing permanently. Tapping one opens
 * ZoomLightbox at that poster, where the rest are a thumbnail away (revealed
 * with the circular transition) and small print can be zoomed.
 */
export default function EventHighlightsGallery({
  highlights,
  title,
}: {
  highlights: EventHighlight[];
  title: string;
}) {
  const [open, setOpen] = useState<number | null>(null);

  if (highlights.length === 0) return null;
  const single = highlights.length === 1;

  return (
    <>
      <div className={single ? '' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>
        {highlights.map((h, idx) => (
          <figure key={`${h.url}-${idx}`} className="relative m-0">
            <button
              type="button"
              onClick={() => setOpen(idx)}
              className={`hl-tile relative block w-full ${single ? '' : 'aspect-[4/5] '}overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue`}
              aria-label={`View ${h.caption || `highlight ${idx + 1}`} full screen`}
            >
              <img
                src={h.url}
                alt={h.caption || `${title} highlight ${idx + 1}`}
                loading="lazy"
                className={single ? 'hl-tile-img block w-full h-auto' : 'hl-tile-img absolute inset-0 h-full w-full object-cover'}
              />
              {/* Hover notice; see EventHighlightsGallery.css for why not hover:. */}
              <span className="hl-tile-notice pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md shadow-lg">
                  <Maximize2 size={14} /> Click to view full screen
                </span>
              </span>
              {/* Touch screens cannot hover: a standing badge says it opens. */}
              <span className="hl-tile-badge pointer-events-none absolute bottom-2.5 right-2.5 h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white backdrop-blur-md shadow-lg">
                <Maximize2 size={14} />
              </span>
            </button>
            {h.caption && (
              <figcaption className="pointer-events-none absolute top-2.5 right-2.5 max-w-[calc(100%-1.25rem)] truncate rounded-full border border-white/15 bg-black/65 backdrop-blur-md px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-white shadow-lg">
                {h.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {open !== null && (
        <ZoomLightbox
          images={highlights}
          index={open}
          onIndexChange={setOpen}
          onClose={() => setOpen(null)}
          label={`${title} highlight`}
        />
      )}
    </>
  );
}
