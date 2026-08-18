"use client";

import { useEffect } from 'react';

export default function ResultsClientOrchestrator() {
  useEffect(() => {
    // Orchestrate 18-texts-reveal
    const block = document.querySelector(".t-stagger");
    if (block) {
      // Trigger entrance
      block.classList.remove("is-hiding");
      block.classList.remove("is-shown");
      void (block as HTMLElement).offsetHeight; // reflow
      block.classList.add("is-shown");
    }

    // Orchestrate 19-card-tilt for all cards
    const tilts = document.querySelectorAll(".t-tilt");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const MAX = 14;

    const cleanupFns: (() => void)[] = [];

    tilts.forEach(tilt => {
      const card = tilt.querySelector(".t-tilt-card") as HTMLElement;
      if (!card) return;

      const reset = () => {
        tilt.classList.remove("is-hover");
        card.classList.remove("is-tilting");
        card.style.setProperty("--tilt-rx", "0deg");
        card.style.setProperty("--tilt-ry", "0deg");
      };

      const track = (e: Event) => {
        if (reduce.matches) return;
        const pointerEvent = e as PointerEvent;
        const r = tilt.getBoundingClientRect();
        const px = Math.min(1, Math.max(0, (pointerEvent.clientX - r.left) / r.width));
        const py = Math.min(1, Math.max(0, (pointerEvent.clientY - r.top) / r.height));
        tilt.classList.add("is-hover");
        card.classList.add("is-tilting");
        card.style.setProperty("--tilt-ry", ((px - 0.5) * MAX).toFixed(2) + "deg");
        card.style.setProperty("--tilt-rx", ((0.5 - py) * MAX).toFixed(2) + "deg");
        card.style.setProperty("--tilt-gx", (px * 100).toFixed(1) + "%");
        card.style.setProperty("--tilt-gy", (py * 100).toFixed(1) + "%");
      };

      const onPointerDown = (e: Event) => {
        const pointerEvent = e as PointerEvent;
        if (pointerEvent.pointerType !== "mouse") {
          try { (tilt as HTMLElement).setPointerCapture(pointerEvent.pointerId); } catch (_) {}
        }
      };

      const onPointerLeave = (e: Event) => {
        const pointerEvent = e as PointerEvent;
        if (pointerEvent.pointerType === "mouse") reset();
      };

      tilt.addEventListener("pointerdown", onPointerDown);
      tilt.addEventListener("pointermove", track);
      tilt.addEventListener("pointerup", reset);
      tilt.addEventListener("pointercancel", reset);
      tilt.addEventListener("pointerleave", onPointerLeave);

      cleanupFns.push(() => {
        tilt.removeEventListener("pointerdown", onPointerDown);
        tilt.removeEventListener("pointermove", track);
        tilt.removeEventListener("pointerup", reset);
        tilt.removeEventListener("pointercancel", reset);
        tilt.removeEventListener("pointerleave", onPointerLeave);
      });
    });

    return () => {
      cleanupFns.forEach(fn => fn());
    };
  }, []);

  return null;
}
