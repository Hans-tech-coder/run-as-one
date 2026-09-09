import React from "react";

/**
 * The app's "working on it" mark: three brand dots swelling in sequence.
 *
 * It exists because a click in the admin used to look like nothing happened.
 * The dashboard's pages are all database reads behind an auth cookie, so a
 * navigation can sit for a second with the old screen still on show, and an
 * organizer who has no way to tell a slow page from an ignored click will
 * click again.
 *
 * All the motion is CSS (`.t-dots` in globals.css), which is deliberate: this
 * renders inside `loading.tsx` route fallbacks, and those stay server
 * components only as long as nothing in them needs a hook. A framer-motion
 * version of the same three dots would drag every fallback in the app across
 * the client boundary for an animation that a keyframe already does.
 *
 * Sizes: `sm` is the hint that sits beside a word in a link, `md` the default,
 * `lg` the one that fills the content area of a page still on its way.
 */
export default function LoadingDots({
  size = "md",
  label = "Loading",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  /** Read out by screen readers in place of the dots themselves. */
  label?: string;
  className?: string;
}) {
  const sizeClass = size === "md" ? "" : `t-dots--${size}`;

  return (
    <span
      className={`t-dots ${sizeClass} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <span className="t-dots-dot" />
      <span className="t-dots-dot" />
      <span className="t-dots-dot" />
      {/* Absolutely positioned by `sr-only`, so it is out of the flex flow and
          costs the row neither a gap step nor a pixel of width. */}
      <span className="sr-only">{label}</span>
    </span>
  );
}
