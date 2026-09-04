"use client";

import React, { useState } from 'react';
import { Footprints } from 'lucide-react';

interface EventImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  iconSize?: number;
}

/**
 * An event's cover photo, and what stands in its place when there isn't one.
 *
 * Two ways to end up without a picture: the admin form stores an empty string
 * when an organizer uploads nothing, and a stored URL can stop resolving once
 * the file behind it is gone. The second used to fall through to the browser's
 * own broken-image glyph — a grey torn page in the middle of an otherwise
 * finished card, which reads as a bug in the site rather than a missing poster.
 * Both cases now land on the same branded placeholder.
 *
 * Rendering <img src=""> makes the browser re-request the page, so the empty
 * case must never reach the <img> at all.
 */
export default function EventImage({ src, alt, className = '', iconSize = 32 }: EventImageProps) {
  // Which URL failed, rather than a bare "it failed" flag: a card can be
  // re-pointed at another event while it stays mounted — the home page filter
  // does exactly that — and the previous poster's failure must not carry over
  // to the new one.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div
        className={`${className} relative flex items-center justify-center overflow-hidden bg-[#0f0f14]`}
        role="img"
        aria-label={alt}
      >
        {/* The same two accent orbs the rest of the app paints its panels with,
            so a poster-less card still looks like it belongs here. */}
        <div className="pointer-events-none absolute -left-1/4 -top-1/4 h-[70%] w-[70%] rounded-full bg-accent-blue/20 blur-[60px]" />
        <div className="pointer-events-none absolute -bottom-1/4 -right-1/4 h-[70%] w-[70%] rounded-full bg-accent-orange/20 blur-[60px]" />
        <Footprints
          size={iconSize}
          className="relative z-10 text-white/30"
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
