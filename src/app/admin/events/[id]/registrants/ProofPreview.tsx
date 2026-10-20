/**
 * A runner's screenshot from a change's link, shown at once as the detail
 * modal shows a registrant's deposit slip: the thumbnail and *View fullscreen*
 * both open the viewer (`ProofLightbox`). A PDF gets a card, since an <img>
 * cannot draw one. Shared by a delivery switch's *Delivery Payment* modal and
 * a runner's *Category Changes*, so the two proofs read alike.
 */

import React from 'react';
import { FileText, Maximize2 } from 'lucide-react';

export default function ProofPreview({ src, isPdf, onOpen }: { src: string; isPdf: boolean; onOpen: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-2">
        <p className="text-[var(--text-muted)] text-sm m-0">Proof of Payment</p>
        <button
          type="button"
          onClick={onOpen}
          className="text-xs font-medium text-accent-blue-ink hover:underline bg-transparent border-none cursor-pointer p-0"
        >
          View fullscreen
        </button>
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open the proof of payment full screen"
        className="group relative w-full rounded-lg overflow-hidden border border-[var(--dash-border)] max-h-[300px] max-sm:max-h-none flex items-center justify-center bg-[var(--dash-sunken)] cursor-zoom-in p-0 hover:border-[var(--ink-30)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        {isPdf ? (
          <span className="flex flex-col items-center gap-2 py-10 text-secondary">
            <FileText size={32} className="text-accent-blue-ink" aria-hidden="true" />
            <span className="text-sm font-medium text-primary">PDF receipt</span>
            <span className="text-xs">Click to read it full screen</span>
          </span>
        ) : (
          <img
            src={src}
            alt="Proof of Payment"
            className="max-w-full max-h-[300px] object-contain max-sm:w-full max-sm:max-h-[70dvh]"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-sm font-medium text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
          <Maximize2 size={16} aria-hidden="true" /> Click to enlarge
        </span>
      </button>
    </div>
  );
}
