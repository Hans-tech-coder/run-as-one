"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import RunnerLoader from "./RunnerLoader";

/**
 * A blocking "hold on" panel for a submission that is about to leave the page.
 *
 * Both registration wizards end in a wait a runner cannot see the end of:
 * creating the PayMongo checkout and then loading PayMongo itself, or uploading
 * a deposit slip over mobile data. A button that only changes its label is
 * easy to miss at the bottom of a long form, and the thing a runner does when
 * nothing seems to happen — press again, press back, close the tab — is the
 * thing that leaves a half-made order behind. So the whole screen answers:
 * the running figure, a line naming what is happening, and a line asking them
 * to keep the page open.
 *
 * Portalled to `<body>` because the wizard's panels carry the stagger reveal's
 * transforms, and a transformed ancestor turns `position: fixed` into
 * "fixed to that panel". It has no close: the submission either leaves the
 * page or fails, and a failure is answered by the wizard's own alert once
 * `open` drops. `open` only ever turns true after a click, so there is nothing
 * to render on the server and no mounted-flag dance for the portal.
 */
export default function RunnerOverlay({
  open,
  title,
  slowTitle,
  hint,
}: {
  open: boolean;
  /** What is happening, shown shimmering under the figure. */
  title: string;
  /** Replaces `title` after five seconds, so a slow wait is explained. */
  slowTitle?: string;
  /** What the runner should (not) do meanwhile. */
  hint?: string;
}) {
  if (!open) return null;
  return createPortal(
    <OverlayPanel title={title} slowTitle={slowTitle} hint={hint} />,
    document.body,
  );
}

/**
 * Mounted fresh on every open, so the reveal always starts from the resting
 * pre-open state. Opens on transitions.dev's modal tokens (`.t-modal`), with
 * the two-frame wait that snippet needs so the scale has somewhere to start.
 */
function OverlayPanel({
  title,
  slowTitle,
  hint,
}: {
  title: string;
  slowTitle?: string;
  hint?: string;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  return (
    <div className={`runner-overlay ${shown ? "is-open" : ""}`} aria-busy="true">
      <div className={`runner-overlay__panel t-modal ${shown ? "is-open" : ""}`}>
        <RunnerLoader size="lg" caption={title} slowCaption={slowTitle} />
        {hint && <p className="runner-overlay__hint">{hint}</p>}
      </div>
    </div>
  );
}
