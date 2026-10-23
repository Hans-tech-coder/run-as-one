import React from 'react';
import { Camera, ExternalLink } from 'lucide-react';
import { albumNames, cleanPhotoAlbums, type PhotoAlbum } from '@/lib/photo-albums';

/**
 * A finished race's photo albums as buttons (PAST_EVENTS_PLAN.md D7), on its
 * event page (`RaceIsOver`) and on /results/[slug] — one component so the two
 * places a runner looks for photos always read the same.
 *
 * One album is the plain **View Race Photos**. Several sit under a *Race
 * Photos* heading, one button each, named by the organizer or by their site
 * (`albumNames`), because "View Race Photos" five times over would leave a
 * runner guessing which one holds the finish line.
 *
 * Each opens in a new tab with no window.opener: these are the organizer's
 * pages on sites this one does not control.
 */
export default function RacePhotoLinks({
  albums,
  align = 'stretch',
}: {
  /** The stored column as it comes; cleaned here (lib/photo-albums.ts). */
  albums: unknown;
  /** `stretch` fills a sidebar; `center` wraps them in a centred row on a page. */
  align?: 'stretch' | 'center';
}) {
  const list = cleanPhotoAlbums(albums);
  if (list.length === 0) return null;
  const width = align === 'stretch' ? 'w-full' : 'w-full sm:w-auto';

  const link = (album: PhotoAlbum, text: string, icon: boolean) => (
    <a key={album.url} href={album.url} target="_blank" rel="noopener noreferrer" className={`btn-secondary ${width}`}>
      {icon && <Camera size={18} className="shrink-0" aria-hidden="true" />}
      <span className="min-w-0 truncate">{text}</span>
      <ExternalLink size={16} className="shrink-0 opacity-70" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );

  if (list.length === 1) return link(list[0], 'View Race Photos', true);

  const names = albumNames(list);
  return (
    <div role="group" aria-labelledby="race-photos-heading" className="flex w-full flex-col gap-3">
      <p
        id="race-photos-heading"
        className={`m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-secondary ${align === 'center' ? 'justify-center' : ''}`}
      >
        <Camera size={14} aria-hidden="true" /> Race Photos
      </p>
      <div className={align === 'stretch' ? 'flex flex-col gap-3' : 'flex flex-wrap justify-center gap-3'}>
        {list.map((album, i) => link(album, names[i], false))}
      </div>
    </div>
  );
}
