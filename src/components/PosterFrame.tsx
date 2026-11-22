"use client";

import React, { useState } from 'react';
import EventImage from './EventImage';

/**
 * An event poster in a fixed frame, whole and with no empty bands around it.
 *
 * The rule it owns: a poster on a Paper page is shown whole (`object-fit:
 * contain`, never cropped, nothing printed over it), and whatever room the
 * frame has left around it is filled with a blurred, cover-fit copy of the
 * same poster instead of a flat tint. Organizers upload every shape there is
 * — 2.8:1 banners, square posts, portrait flyers — so any frame of one ratio
 * leaves bands on most of them.
 *
 * Every public surface that shows a poster in a frame of fixed shape uses this
 * one component (docs/conventions.md §9); the frame's ratio and corners come
 * from the surface's own class (`className`, e.g. `.site-card__poster`).
 *
 * Why the backdrop costs nothing: it is the same URL as the poster, so the
 * browser fetches the file once and paints it twice. A separate small
 * variant would need the image optimizer (next/image), which these Blob
 * posters do not go through. The backdrop is decorative (`alt=""`,
 * aria-hidden), never eager or preloaded on its own, and is blurred with CSS
 * only (site.css `.poster-frame`). When the poster fails to load, the backdrop
 * goes with it and EventImage's placeholder stands alone.
 */
export default function PosterFrame({
  src,
  alt,
  className = '',
  iconSize,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  iconSize?: number;
}) {
  // Which URL failed, as in EventImage: a mounted card can be re-pointed at
  // another event, and the old poster's failure must not hide the new one.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showFill = Boolean(src) && failedSrc !== src;

  return (
    <div className={`poster-frame ${className}`}>
      {showFill && (
        // eslint-disable-next-line @next/next/no-img-element -- the same Blob URL as the poster on top, so it is one download; see the header
        <img
          src={src as string}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="poster-frame__fill"
          onError={() => setFailedSrc(src ?? null)}
        />
      )}
      <EventImage src={src} alt={alt} className="poster-frame__img" iconSize={iconSize} />
    </div>
  );
}
