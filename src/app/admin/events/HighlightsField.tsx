"use client";

import React, { useCallback, useState } from 'react';
import { Images } from 'lucide-react';
import { MAX_EVENT_HIGHLIGHTS, type EventHighlight } from '@/lib/event-highlights';
import HighlightsModal from './HighlightsModal';

/** How many posters the form's stack shows before it says "+N". */
const STACK_SIZE = 3;

/**
 * The event form's Event Highlights field: one fixed-size tile, so a dozen
 * posters never stretch the form. Empty, it reads like the other upload tiles;
 * filled, it shows the first few posters as a fanned stack of cards. Either
 * way a click opens HighlightsModal, where the list is actually managed.
 */
export default function HighlightsField({
  value,
  onChange,
  onError,
  onBusyChange,
}: {
  value: EventHighlight[];
  onChange: (update: (prev: EventHighlight[]) => EventHighlight[]) => void;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsClosing(true);
    setTimeout(() => setIsClosing(false), 150);
  }, []);

  // Front card first in the list, so it is drawn last and sits on top.
  const stack = value.slice(0, STACK_SIZE).reverse();
  const extra = value.length - STACK_SIZE;

  return (
    <div className="form-group">
      <label className="form-label">
        Event Highlights <span className="text-xs opacity-70">- optional, up to {MAX_EVENT_HIGHLIGHTS} images</span>
      </label>

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="file-upload-wrapper highlight-trigger media-tile"
        aria-haspopup="dialog"
      >
        {value.length === 0 ? (
          <div className="file-upload-content">
            <div className="file-upload-icon">
              <Images size={32} />
            </div>
            <div className="file-upload-title">Add event highlights</div>
            <div className="file-upload-desc">Race kit, trophies, venue, after party — several images</div>
          </div>
        ) : (
          <div className="file-upload-content">
            <div className={`highlight-stack highlight-stack--${stack.length}`} aria-hidden="true">
              {stack.map((h, i) => (
                <span key={`${h.url}-${i}`} className="highlight-stack-card">
                  <img src={h.url} alt="" />
                </span>
              ))}
              {extra > 0 && <span className="highlight-stack-more">+{extra}</span>}
            </div>
            <div className="file-upload-title">
              {value.length} {value.length === 1 ? 'image' : 'images'}
            </div>
            <div className="file-upload-desc">Click to add, caption or reorder</div>
          </div>
        )}
      </button>

      <HighlightsModal
        isOpen={isOpen}
        isClosing={isClosing}
        value={value}
        onChange={onChange}
        onError={onError}
        onBusyChange={onBusyChange}
        onClose={close}
      />
    </div>
  );
}
