"use client";

import React, { useState } from "react";
import { X, Info, Maximize2 } from "lucide-react";
import ZoomLightbox from "@/components/ui/ZoomLightbox";
import { formatPesos } from "@/lib/money";
import { SHIRT_SIZE_CHART, isUpchargeShirtSize } from "@/lib/shirt-size";

/**
 * The printed size chart, on screen.
 *
 * A 9-row table reads as a long, boring scroll on a phone. Sizes are short
 * labels a runner scans for their own, not data compared row over row, so a
 * grid of chips does the same job in roughly a third of the height — three
 * rows instead of nine, no header row of its own, no per-row borders.
 *
 * Measurements come from SHIRT_SIZE_CHART so the guide and the size field can
 * never quote different numbers. Singlets and shirts share one chart — that is
 * why the field asks for a single "Shirt Size" rather than one measurement per
 * garment.
 *
 * An event may upload its own chart (Event.sizeChartImageUrl). Then that image
 * replaces the chip grid, since the organizer's supplier sets the measurements;
 * tapping it opens ZoomLightbox so a runner can read the small print. The
 * lightbox renders inside .modal-content, whose click handler stops
 * propagation, so taps in it (a portal, but still a React child) never reach
 * the overlay's close handler.
 */
export default function SizeGuideModal({
  upcharge = 0,
  imageUrl,
  onClose,
}: {
  /** Centavos this event adds for 4XL and above. 0 hides the note. */
  upcharge?: number;
  /** The event's own size chart. Empty falls back to the default chart. */
  imageUrl?: string | null;
  onClose: () => void;
}) {
  const [zoomOpen, setZoomOpen] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-content glass-panel ${imageUrl ? "max-w-lg" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close-btn"
          onClick={onClose}
          aria-label="Close size chart"
        >
          <X size={22} />
        </button>

        <div className="flex items-baseline gap-2 mb-1">
          <Info size={18} className="text-accent-blue shrink-0" />
          <h3 className="text-lg font-bold text-white">Size Chart</h3>
        </div>
        <p className="text-secondary text-xs mb-4">
          {imageUrl
            ? "From the organizer · tap the chart to zoom in"
            : <>Singlet &amp; shirt, in inches &middot; &plusmn;0.5&ndash;1&Prime; tolerance</>}
        </p>

        {imageUrl ? (
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            className="relative block w-full mb-4 rounded-lg overflow-hidden border border-white/10 bg-white/5 cursor-zoom-in"
            aria-label="View size chart full screen"
          >
            <img
              src={imageUrl}
              alt="Size chart"
              className="w-full h-auto max-h-[60vh] object-contain"
            />
            <span className="pointer-events-none absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md shadow-lg">
              <Maximize2 size={12} /> Zoom
            </span>
          </button>
        ) : (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {SHIRT_SIZE_CHART.map((row) => {
            const costsMore = upcharge > 0 && isUpchargeShirtSize(row.size);
            return (
              <div
                key={row.size}
                className={`relative rounded-lg border p-2.5 text-center ${
                  costsMore
                    ? "border-accent-orange/50 bg-accent-orange/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                {costsMore && (
                  <span className="absolute -top-2 -right-1.5 text-[9px] leading-none font-bold text-white bg-accent-orange rounded-full px-1.5 py-1">
                    +&#8369;{formatPesos(upcharge)}
                  </span>
                )}
                <div className="font-bold text-white text-sm">{row.size}</div>
                <div className="text-secondary text-[11px] mt-0.5 whitespace-nowrap">
                  {row.width}&quot;&times;{row.length}&quot;
                </div>
              </div>
            );
          })}
        </div>
        )}

        <div className="bg-dark/50 border border-blue px-4 py-3 rounded-lg text-xs text-secondary leading-relaxed">
          <span className="text-accent-blue font-medium">Tip:</span>{" "}
          Between sizes? Size up{imageUrl ? "." : <> &mdash; one chart covers both the singlet
          and the shirt.</>}
          {upcharge > 0 && (
            <>
              {" "}
              4XL and above adds ₱{formatPesos(upcharge)} per runner.
            </>
          )}
        </div>

        <button className="btn-gradient w-full mt-4 py-2.5" onClick={onClose}>
          Got it
        </button>

        {imageUrl && zoomOpen && (
          <ZoomLightbox
            images={[{ url: imageUrl, caption: "Size Chart" }]}
            index={0}
            onIndexChange={() => {}}
            onClose={() => setZoomOpen(false)}
            label="Size chart"
          />
        )}
      </div>
    </div>
  );
}
