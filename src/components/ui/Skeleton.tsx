"use client";

import React, { useEffect, useState } from "react";

/** Kept in step with --skel-reveal-dur in globals.css. */
const REVEAL_MS = 400;

/**
 * One grey bar in a placeholder.
 *
 * A skeleton is only worth more than the word "Loading…" if it is the shape of
 * what is coming, so callers build the row out of these at the widths the real
 * row has. It must be a direct child of the skeleton layer: the pulse in
 * globals.css animates `.t-skel-skeleton.is-pulsing > *`, so a bar buried two
 * levels down sits still.
 */
export function SkeletonBar({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`t-skel-bar ${className}`} style={style} />;
}

/**
 * A placeholder that pulses, then hands over to the real thing.
 *
 * Swapping "Looking up the orders…" for the rows themselves is a hard cut: the
 * panel is one height with a sentence in it and another with a list in it, and
 * the eye reads the jump rather than the answer. This holds both layers in one
 * grid cell and cross-fades them with a matching blur, so the placeholder
 * becomes the content in place.
 *
 *     <SkeletonSwap loading={isLoading} skeleton={<RowsPlaceholder />}>
 *       {rows}
 *     </SkeletonSwap>
 *
 * The skeleton stays mounted for one reveal after the data lands — it is the
 * half that fades out — and is dropped afterwards so the wrap settles to the
 * height of the content alone. Mounting with `loading` already false is the
 * cached case and paints the content directly, with nothing to animate.
 */
export default function SkeletonSwap({
  loading,
  skeleton,
  children,
  className = "",
}: {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [showSkeleton, setShowSkeleton] = useState(loading);

  // Adjusted during render rather than in an effect: a second load has to put
  // the placeholder back in the same commit that hides the content, or there
  // is one paint showing neither.
  if (loading && !showSkeleton) setShowSkeleton(true);

  // Dropped a whole reveal after the data lands — the skeleton is the half
  // that fades out, and unmounting it any earlier cuts the cross-fade in two.
  useEffect(() => {
    if (loading || !showSkeleton) return;
    const timer = window.setTimeout(() => setShowSkeleton(false), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [loading, showSkeleton]);

  return (
    <div
      className={`t-skel ${loading ? "" : "is-revealed"} ${className}`}
      aria-busy={loading}
    >
      {showSkeleton && (
        <div
          className="t-skel-skeleton is-pulsing pointer-events-none"
          aria-hidden="true"
        >
          {skeleton}
        </div>
      )}
      <div
        className={`t-skel-content ${loading ? "pointer-events-none" : ""}`}
        aria-hidden={loading}
      >
        {children}
      </div>
    </div>
  );
}
