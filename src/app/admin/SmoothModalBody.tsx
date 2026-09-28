"use client";

import React, { useLayoutEffect, useRef } from "react";
import { cssDurationMs } from "@/lib/css-duration";

/**
 * A `.admin-modal-body` whose height eases to its content instead of jumping,
 * inside a panel whose top edge stays where it opened.
 *
 * A form that shows different fields for different choices (the promo modal's
 * *Discount type* and *How runners get it*) changed the panel's height in one
 * frame, and because the panel is centred, both its edges jumped — the header
 * and the control just used moved under the cursor. Two things fix that:
 *
 * - **The height eases.** CSS cannot tween `height: auto`, so the content is
 *   measured (a ResizeObserver on an inner wrapper) and written back as an
 *   explicit height that `.t-resize` tweens (transitions-dev, card resize).
 * - **The top stays put.** The panel opens centred, then keeps that top edge:
 *   only its bottom moves as the form grows or shrinks. It rises only when the
 *   bottom would leave the screen, and past the viewport cap the body scrolls
 *   as before. A window resize centres it again.
 *
 * The first measurement is written without a transition, so opening the modal
 * is the modal's own animation and not a grow from zero. While a resize runs
 * the body hides its overflow (`data-resizing`), or a growing body would flash
 * a scrollbar for the length of the tween.
 */
export default function SmoothModalBody({
  className = "",
  children,
}: {
  /** Padding and the like, added beside `admin-modal-body`. */
  className?: string;
  children: React.ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const inner = innerRef.current;
    const panel = body?.parentElement;
    const overlay = panel?.parentElement;
    if (!body || !inner || !panel || !overlay) return;

    let first = true;
    let timer: number | undefined;
    // The panel's offset from the top of the overlay's padding box, fixed at
    // open (centred) and on a window resize.
    let anchor: number | null = null;
    let bodyHeight = 0;

    const px = (value: string) => parseFloat(value) || 0;

    // Where the panel's top belongs for a body of the given height: at the
    // anchor, or higher if its bottom would otherwise pass the screen's edge.
    const place = (nextBody: number, instant: boolean) => {
      const o = getComputedStyle(overlay);
      const room = overlay.clientHeight - px(o.paddingTop) - px(o.paddingBottom);
      const chrome = panel.offsetHeight - body.offsetHeight;
      const height = Math.min(chrome + nextBody, room);
      if (anchor === null) anchor = Math.max(0, (room - height) / 2);
      const top = Math.max(0, Math.min(anchor, room - height));
      if (instant) panel.style.transition = "none";
      panel.style.alignSelf = "flex-start";
      panel.style.marginTop = `${top}px`;
      if (instant) {
        void panel.offsetHeight;
        panel.style.transition = "";
      }
    };

    const fit = () => {
      const style = getComputedStyle(body);
      const next =
        inner.offsetHeight + px(style.paddingTop) + px(style.paddingBottom);
      if (first) {
        first = false;
        bodyHeight = next;
        body.style.transition = "none";
        body.style.height = `${next}px`;
        void body.offsetHeight;
        body.style.transition = "";
        place(next, true);
        return;
      }
      if (next === bodyHeight) return;
      bodyHeight = next;
      body.dataset.resizing = "true";
      body.style.height = `${next}px`;
      place(next, false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        delete body.dataset.resizing;
      }, cssDurationMs("--resize-dur", 300));
    };

    const recentre = () => {
      anchor = null;
      place(bodyHeight, true);
    };

    const observer = new ResizeObserver(fit);
    observer.observe(inner);
    fit();
    window.addEventListener("resize", recentre);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recentre);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div ref={bodyRef} className={`admin-modal-body t-resize ${className}`}>
      {/* flow-root, so a first or last child's margin is measured rather than
          collapsing through the wrapper's edge. */}
      <div ref={innerRef} className="flow-root">
        {children}
      </div>
    </div>
  );
}
