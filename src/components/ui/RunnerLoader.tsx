import React from "react";

/**
 * The runner side's "working on it" mark: a sprinter mid-stride, arms and legs
 * cycling, with brand-orange speed lines streaming off behind.
 *
 * It exists for the same reason `LoadingDots` does — a click that is answered
 * by nothing moving reads as a button that is broken, and a runner who thinks
 * Register did nothing presses it again — but the public site is a race
 * registration product, and its loader should look like it belongs to one. The
 * organizer dashboard keeps the dots.
 *
 * The figure is drawn here, not imported: every limb is two segments on nested
 * groups — the thigh turns at the hip and the shin, inside it, at the knee (the
 * arms likewise at shoulder and elbow) — so the CSS can run a real stride
 * rather than bobbing a still pose. The far-side limbs are painted first and a
 * shade deeper, which is all the depth a flat pictogram needs.
 *
 * All the motion is CSS (`.t-runner` in globals.css) and this file takes no
 * hooks, for the reason `LoadingDots` gives: it renders inside `loading.tsx`
 * fallbacks, which stay server components only as long as nothing in them
 * needs the client.
 *
 * Sizes: `sm` is 1.3em, so it sits in a button or a table cell at the size of
 * the text beside it; `md` 64px; `lg` 104px, filling a page on its way.
 * `tone="current"` draws it in the surrounding text colour — brand blue would
 * vanish into the blue end of the gradient buttons.
 */
export default function RunnerLoader({
  size = "md",
  tone = "brand",
  label = "Loading",
  caption,
  slowCaption,
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  tone?: "brand" | "current";
  /**
   * Read out by screen readers when there is no caption. Pass `""` where the
   * figure is decoration beside words that already say it (a busy button).
   */
  label?: string;
  /** Shown under the figure, shimmering, and read out in place of `label`. */
  caption?: string;
  /**
   * Replaces `caption` once the wait passes `--runner-slow-after` (5s), so a
   * long wait is explained rather than left looking stuck. Needs `caption`.
   */
  slowCaption?: string;
  className?: string;
}) {
  const classes = [
    "t-runner",
    `t-runner--${size}`,
    tone === "current" ? "t-runner--current" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const announces = Boolean(caption || label);

  return (
    <span
      className={classes}
      role={announces ? "status" : undefined}
      aria-live={announces ? "polite" : undefined}
    >
      <svg
        className="t-runner__svg"
        viewBox="0 0 100 100"
        aria-hidden="true"
        focusable="false"
      >
        <g className="t-runner__streaks">
          <line className="t-runner__streak" x1="6" y1="36" x2="24" y2="36" />
          <line className="t-runner__streak" x1="2" y1="48" x2="16" y2="48" />
          <line className="t-runner__streak" x1="8" y1="60" x2="22" y2="60" />
        </g>
        <ellipse className="t-runner__shadow" cx="48" cy="96" rx="17" ry="2.5" />
        <g className="t-runner__body">
          <Arm side="far" />
          <Leg side="far" />
          <line className="t-runner__torso" x1="58" y1="31" x2="47" y2="55" />
          <circle className="t-runner__head" cx="65" cy="15.5" r="8" />
          <Leg side="near" />
          <Arm side="near" />
        </g>
      </svg>

      {caption && slowCaption ? (
        // Both lines are in the DOM from the start and CSS times the swap
        // (`.t-runner__captions`), so this stays hook-free. The slow line is
        // hidden from screen readers: the status has already been announced,
        // and a live region re-reading at five seconds would only interrupt.
        <span className="t-runner__captions">
          <span className="t-runner__caption t-shimmer" data-text={caption}>
            {caption}
          </span>
          <span
            className="t-runner__caption t-runner__caption--slow t-shimmer"
            data-text={slowCaption}
            aria-hidden="true"
          >
            {slowCaption}
          </span>
        </span>
      ) : caption ? (
        <span className="t-runner__caption t-shimmer" data-text={caption}>
          {caption}
        </span>
      ) : (
        label && <span className="sr-only">{label}</span>
      )}
    </span>
  );
}

/** Hip at (47, 55), knee at (47, 74) — the origins `.t-runner__thigh` and
    `.t-runner__shin` turn about. Drawn hanging straight down; the keyframes
    swing it. */
function Leg({ side }: { side: "near" | "far" }) {
  return (
    <g className={`t-runner__limb t-runner__limb--${side} t-runner__thigh`}>
      <line x1="47" y1="55" x2="47" y2="74" />
      <g className="t-runner__shin">
        <line x1="47" y1="74" x2="47" y2="92" />
      </g>
    </g>
  );
}

/** Shoulder at (58, 31), elbow at (58, 45). */
function Arm({ side }: { side: "near" | "far" }) {
  return (
    <g className={`t-runner__limb t-runner__limb--${side} t-runner__upper`}>
      <line x1="58" y1="31" x2="58" y2="45" />
      <g className="t-runner__fore">
        <line x1="58" y1="45" x2="58" y2="57" />
      </g>
    </g>
  );
}
