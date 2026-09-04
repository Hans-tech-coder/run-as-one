"use client";

import React, { useId, useState } from 'react';
import { CheckCircle2, Maximize2 } from 'lucide-react';
import { formatPesos } from '@/lib/money';
import { sellsPackages } from '@/lib/event-type';
import PosterLightbox from './PosterLightbox';
import FieldError from './FieldError';

/**
 * What a runner picks at sign-up, in whichever shape the event sells.
 *
 * A race sells distances, so the options are short and comparable at a glance
 * and fit a grid of cards. A fun run sells inclusion packages, which differ only
 * in what comes in the kit, so those stack full width.
 *
 * Posters are thumbnails here, not full-size images. Rendered at their natural
 * size a poster runs several hundred pixels tall, which pushes the next option
 * off screen and turns a comparison into a scroll — the one thing this step
 * exists to make easy. The full poster is a tap away in PosterLightbox instead.
 *
 * Shared by both wizards. The two had identical copies of the distance grid,
 * and a package picker that existed in only one of them would mean fun runs
 * silently work under PayMongo but not bank transfer.
 */
export default function CategoryPicker({
  event,
  selectedId,
  onSelect,
  id,
  error,
}: {
  event: { eventType?: unknown; categories: any[] };
  selectedId: string;
  onSelect: (categoryId: string) => void;
  /** Marks the group as the caret's destination when nothing is picked. */
  id?: string;
  /** Set when the runner tried to move on without choosing. */
  error?: string;
}) {
  const packages = sellsPackages(event);
  const [posterFor, setPosterFor] = useState<any | null>(null);
  // The wizards render one picker per runner. Without a unique group name every
  // runner's radios would be one native group, so picking for the second runner
  // would clear the first one's.
  const groupName = useId();

  const groupLabel = packages ? 'Select Package' : 'Select Category';
  const errorId = id ? `${id}-error` : `${groupName}-error`;

  return (
    <>
      {/* tabIndex -1 so the summary dialog can send the caret to the group as a
          whole. The distance cards are not focusable and the package radios are
          many; the heading is the one place that means "start here". */}
      <div
        id={id}
        tabIndex={-1}
        aria-describedby={error ? errorId : undefined}
        className="focus:outline-none scroll-mt-32"
      >
        <h4 className="mb-3 text-secondary text-sm font-bold uppercase tracking-wider">
          {groupLabel}
        </h4>

        {error && (
          <div className="mb-3">
            <FieldError id={errorId} message={error} />
          </div>
        )}
      </div>

      {packages ? (
        <div
          role="radiogroup"
          aria-label={groupLabel}
          aria-invalid={error ? true : undefined}
          className="flex flex-col gap-3 mb-8"
        >
          {event.categories.map((cat: any) => {
            const isSelected = selectedId === cat.id;
            return (
              <div
                key={cat.id}
                className={`relative flex items-stretch gap-3 border rounded-[16px] p-3 transition-all ${
                  isSelected
                    ? 'border-accent-orange bg-accent-orange/10 shadow-[0_0_20px_rgba(255,107,43,0.15)]'
                    : 'border-white/10 bg-black/40 hover:border-white/30'
                }`}
              >
                {cat.imageUrl && (
                  <PosterThumb
                    cat={cat}
                    onOpen={() => setPosterFor(cat)}
                    className="relative z-10"
                  />
                )}

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  {/* A real radio input, visually hidden. The row used to be a
                      div with role="radio", which cannot legally contain the
                      poster button — a radio must have no focusable children.
                      The "View inclusions" button is a sibling of the label,
                      not a child, for the same reason. */}
                  {/* after:inset-0 stretches the label's hit area over the whole
                      card, so the padding and the space beside the poster select
                      the package too. Without it only the text row was clickable
                      and the top and bottom of the card did nothing. -inset-px
                      rather than inset-0 because inset-0 stops at the padding
                      box and would leave the 1px border ring dead. The two
                      buttons below sit above the overlay on z-10. */}
                  <label className="flex flex-wrap items-center gap-x-3 gap-y-1 cursor-pointer py-1 after:absolute after:-inset-px after:rounded-[16px]">
                    <input
                      type="radio"
                      name={groupName}
                      className="sr-only peer"
                      checked={isSelected}
                      onChange={() => onSelect(cat.id)}
                    />
                    <span
                      aria-hidden="true"
                      className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent-orange peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black ${
                        isSelected ? 'border-accent-orange' : 'border-white/30'
                      }`}
                    >
                      {isSelected && (
                        <span className="w-2.5 h-2.5 rounded-full bg-accent-orange" />
                      )}
                    </span>
                    <span className="min-w-[7rem] flex-1 font-bold text-base sm:text-lg text-white uppercase tracking-wide break-words sm:truncate">
                      {cat.name}
                    </span>
                    <span className="ml-auto text-lg sm:text-xl font-bold text-accent-orange shrink-0">
                      ₱{formatPesos(cat.price)}
                    </span>
                    {isSelected && (
                      <CheckCircle2
                        size={20}
                        aria-hidden="true"
                        className="text-accent-orange shrink-0"
                      />
                    )}
                  </label>

                  {hasInclusions(cat) && (
                    <ViewInclusionsButton
                      name={cat.name}
                      onOpen={() => setPosterFor(cat)}
                      className="ml-8 relative z-10"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {event.categories.map((cat: any) => {
            const isSelected = selectedId === cat.id;
            return (
              <div
                key={cat.id}
                className={`group relative overflow-hidden border rounded-[16px] p-5 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-accent-orange bg-accent-orange/10 shadow-[0_0_20px_rgba(255,107,43,0.15)]'
                    : 'border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/5'
                }`}
                onClick={() => onSelect(cat.id)}
              >
                <div
                  className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 transition-colors ${isSelected ? 'bg-accent-orange/20' : 'bg-white/5 group-hover:bg-white/10'}`}
                ></div>
                <div className="relative z-10 flex justify-between items-start mb-2">
                  <div className="font-bold text-lg text-white">{cat.name}</div>
                  {isSelected && (
                    <CheckCircle2
                      size={20}
                      aria-hidden="true"
                      className="text-accent-orange"
                    />
                  )}
                </div>
                <div className="relative z-10 text-sm text-secondary bg-white/10 inline-block px-3 py-1 rounded-full mb-4">
                  {cat.distance}
                </div>
                <div className="relative z-10 text-xl font-bold text-accent-orange">
                  ₱{formatPesos(cat.price)}
                </div>

                {/* Optional on a race, so the card has to read correctly with
                    and without it — hence a strip appended below the price
                    rather than a hero image the layout depends on. */}
                {hasInclusions(cat) && (
                  <div className="relative z-10 mt-4 flex items-center gap-3">
                    {cat.imageUrl && (
                      <PosterThumb
                        cat={cat}
                        size="sm"
                        onOpen={() => setPosterFor(cat)}
                      />
                    )}
                    <ViewInclusionsButton
                      name={cat.name}
                      onOpen={() => setPosterFor(cat)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {posterFor && (
        <PosterLightbox
          category={posterFor}
          isSelected={selectedId === posterFor.id}
          onSelect={() => onSelect(posterFor.id)}
          onClose={() => setPosterFor(null)}
        />
      )}
    </>
  );
}

/**
 * Whether this option has anything to show in the lightbox. Poster and list are
 * each optional and independent — an organizer may type the inclusions without
 * making a poster, and that has to be just as visible at sign-up.
 */
function hasInclusions(cat: any) {
  return Boolean(cat.imageUrl) || (cat.inclusions?.length ?? 0) > 0;
}

/**
 * A square crop of the poster. Square regardless of the file's own proportions,
 * so a portrait poster and a landscape one produce rows of the same height and
 * the list stays scannable.
 */
function PosterThumb({
  cat,
  size = 'md',
  onOpen,
  className = '',
}: {
  cat: any;
  size?: 'sm' | 'md';
  onOpen: () => void;
  className?: string;
}) {
  const box = size === 'sm' ? 'w-12 h-12' : 'w-16 h-16 sm:w-24 sm:h-24';

  return (
    <button
      type="button"
      onClick={e => {
        // Inside a clickable card on the race grid, where a bare click would
        // also select the category.
        e.stopPropagation();
        onOpen();
      }}
      aria-label={`View ${cat.name} inclusions`}
      className={`${box} relative shrink-0 rounded-xl overflow-hidden border border-white/10 bg-black/40 group/thumb ${className}`}
    >
      <img
        src={cat.imageUrl}
        alt=""
        loading="lazy"
        className="w-full h-full object-cover"
      />
      {/* Always visible, not hover-only: touch has no hover, and this is the
          only cue that the thumbnail opens something. */}
      <span className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded-md bg-black/70 flex items-center justify-center text-white group-hover/thumb:bg-accent-orange transition-colors">
        <Maximize2 size={11} aria-hidden="true" />
      </span>
    </button>
  );
}

function ViewInclusionsButton({
  name,
  onOpen,
  className = '',
}: {
  name: string;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
      aria-label={`View ${name} inclusions`}
      className={`self-start text-xs font-medium text-accent-blue hover:text-white underline underline-offset-2 py-2 pr-2 transition-colors ${className}`}
    >
      View inclusions
    </button>
  );
}
