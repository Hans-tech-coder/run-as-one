"use client";

import { useEffect, useRef } from "react";

/**
 * What the page does when the wizard changes step.
 *
 * Step 1 is the long one — a card per runner — so a runner reaches its Next
 * button far down the page, and every step after it is short. Swapping the
 * content without touching the scroll left the window where it was, which on
 * the new, shorter step is past the end of the form: the runner was shown an
 * empty band and the footer, and had to scroll back up to find out whether the
 * click had done anything at all.
 *
 * A multi-page form's rule is that a new page starts at its top, so this puts
 * the top of the form column — the new step's heading — back under the navbar.
 *
 * - **The form column, not the top of the page.** Below 1024px the order
 *   summary is stacked above the form, and sending a phone to y=0 would land on
 *   the summary with the new step's first question a screen further down.
 * - **Only ever upwards.** A column whose top is already on screen (Back from a
 *   short step, a tall monitor) is left where it is: moving a page nobody needed
 *   moved is a small jolt of its own.
 * - **Focus follows the scroll.** The button that was pressed no longer exists
 *   once the step changes, so focus would otherwise fall back to <body> and a
 *   screen reader would announce nothing. The heading is the new step's name,
 *   which is what should be read out. It carries tabIndex={-1} so it can take
 *   focus without joining the tab order, and `preventScroll` stops the browser
 *   making its own jump on top of the smooth one.
 *
 * The stopping point is the column's `scroll-margin-top` (RegistrationWizard.css),
 * read back here rather than restated, so the "is it already in view" test and
 * the place the scroll lands can never disagree.
 */
export function useStepReveal(step: number) {
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The step the runner arrived on is where the page already starts — only a
  // *change* of step is a new page. Tracked by value rather than with a
  // "first render" flag, because Strict Mode runs a mount effect twice and a
  // flag would already be spent on the second run.
  const shownStep = useRef(step);

  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;

    const panel = panelRef.current;
    if (!panel) return;

    const stopAt = parseFloat(getComputedStyle(panel).scrollMarginTop) || 0;
    if (panel.getBoundingClientRect().top < stopAt) {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      panel.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    }

    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  return { panelRef, headingRef };
}
