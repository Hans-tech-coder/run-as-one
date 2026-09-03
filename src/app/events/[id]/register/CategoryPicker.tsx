"use client";

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { formatPesos } from '@/lib/money';
import { sellsPackages } from '@/lib/event-type';

/**
 * What a runner picks at sign-up, in whichever shape the event sells.
 *
 * A race sells distances, so the options are short and comparable at a glance
 * and fit a grid of cards. A fun run sells inclusion packages, where the price
 * difference is the only thing distinguishing them until you see what is in the
 * kit — so those stack full width with the organizer's poster underneath, which
 * is the part runners actually read before choosing.
 *
 * Shared by both wizards. The two had identical copies of the distance grid,
 * and a package picker that existed in only one of them would mean fun runs
 * silently work under PayMongo but not bank transfer.
 */
export default function CategoryPicker({
  event,
  selectedId,
  onSelect,
}: {
  event: { eventType?: unknown; categories: any[] };
  selectedId: string;
  onSelect: (categoryId: string) => void;
}) {
  const packages = sellsPackages(event);

  return (
    <>
      <h4 className="mb-3 text-secondary text-sm font-bold uppercase tracking-wider">
        {packages ? 'Select Package' : 'Select Category'}
      </h4>

      {packages ? (
        <div className="flex flex-col gap-4 mb-8">
          {event.categories.map((cat: any) => (
            <div
              key={cat.id}
              role="radio"
              aria-checked={selectedId === cat.id}
              tabIndex={0}
              className={`group relative overflow-hidden border rounded-[16px] cursor-pointer transition-all ${
                selectedId === cat.id
                  ? 'border-accent-orange bg-accent-orange/10 shadow-[0_0_20px_rgba(255,107,43,0.15)]'
                  : 'border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/5'
              }`}
              onClick={() => onSelect(cat.id)}
              onKeyDown={e => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  onSelect(cat.id);
                }
              }}
            >
              <div className="flex items-center gap-3 p-5">
                {/* A drawn circle, not an <input type="radio">, so the whole
                    card stays the click target without a nested label. */}
                <span
                  className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selectedId === cat.id ? 'border-accent-orange' : 'border-white/30'
                  }`}
                >
                  {selectedId === cat.id && (
                    <span className="w-2.5 h-2.5 rounded-full bg-accent-orange" />
                  )}
                </span>
                <span className="font-bold text-lg text-white uppercase tracking-wide">
                  {cat.name}
                </span>
                <span className="ml-auto text-xl font-bold text-accent-orange">
                  ₱{formatPesos(cat.price)}
                </span>
                {selectedId === cat.id && (
                  <CheckCircle2 size={20} className="text-accent-orange shrink-0" />
                )}
              </div>

              {cat.imageUrl && (
                <img
                  src={cat.imageUrl}
                  alt={`${cat.name} inclusions`}
                  className="w-full border-t border-white/10"
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {event.categories.map((cat: any) => (
            <div
              key={cat.id}
              className={`group relative overflow-hidden border rounded-[16px] p-5 cursor-pointer transition-all ${
                selectedId === cat.id
                  ? 'border-accent-orange bg-accent-orange/10 shadow-[0_0_20px_rgba(255,107,43,0.15)]'
                  : 'border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/5'
              }`}
              onClick={() => onSelect(cat.id)}
            >
              <div
                className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 transition-colors ${selectedId === cat.id ? 'bg-accent-orange/20' : 'bg-white/5 group-hover:bg-white/10'}`}
              ></div>
              <div className="relative z-10 flex justify-between items-start mb-2">
                <div className="font-bold text-lg text-white">{cat.name}</div>
                {selectedId === cat.id && (
                  <CheckCircle2 size={20} className="text-accent-orange" />
                )}
              </div>
              <div className="relative z-10 text-sm text-secondary bg-white/10 inline-block px-3 py-1 rounded-full mb-4">
                {cat.distance}
              </div>
              <div className="relative z-10 text-xl font-bold text-accent-orange">
                ₱{formatPesos(cat.price)}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
