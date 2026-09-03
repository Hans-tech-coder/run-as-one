"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { formatPesos } from '@/lib/money';

/**
 * Full view of one option's inclusions poster.
 *
 * The picker shows posters as fixed-size thumbnails so every option stays
 * comparable at a glance; this is where a runner actually reads one. Selecting
 * is offered here too, because someone who opened the poster to decide should
 * not have to close it and hunt for the row again.
 *
 * Portalled to <body> because position: fixed is not enough here. The picker
 * renders inside .glass-panel (backdrop-filter, and overflow-hidden) and
 * .animate-fade-in (an animated transform) — each of which makes itself the
 * containing block for fixed descendants, so left inline the overlay is
 * positioned against the form panel and then clipped by it.
 */
export default function PosterLightbox({
  category,
  isSelected,
  onSelect,
  onClose,
}: {
  category: { name: string; price: number; imageUrl?: string | null };
  isSelected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Escape closes, because a full-screen image with no visible page behind it
    // is exactly where people reach for it first.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="poster-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={`${category.name} inclusions`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-white/10">
          <div className="min-w-0">
            <div className="font-bold text-white uppercase tracking-wide truncate">
              {category.name}
            </div>
            <div className="text-sm text-secondary">What&apos;s included</div>
          </div>
          <div className="ml-auto text-lg font-bold text-accent-orange shrink-0">
            ₱{formatPesos(category.price)}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close poster"
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-secondary hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        <div className="poster-lightbox-body">
          <img src={category.imageUrl || ''} alt={`${category.name} inclusions`} />
        </div>

        <div className="p-4 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              onSelect();
              onClose();
            }}
            className={`w-full min-h-11 rounded-xl font-bold uppercase tracking-wide transition-colors ${
              isSelected
                ? 'bg-accent-orange/15 text-accent-orange border border-accent-orange'
                : 'bg-accent-orange text-black hover:bg-accent-orange/90'
            }`}
          >
            {isSelected ? (
              <span className="flex items-center justify-center gap-2">
                <Check size={18} aria-hidden="true" /> Selected
              </span>
            ) : (
              `Choose ${category.name}`
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
