"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import './ZoomLightbox.css';

export type LightboxImage = { url: string; caption?: string };

const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** Where a double tap / double click lands. */
const TAP_ZOOM = 2.5;
/** Each zoom button press multiplies or divides by this. */
const BUTTON_STEP = 1.6;
/** Horizontal travel, at 1x, that counts as a swipe to the next image. */
const SWIPE_PX = 60;
const DOUBLE_TAP_MS = 300;

type View = { s: number; x: number; y: number };
const RESET: View = { s: 1, x: 0, y: 0 };

/**
 * A full-screen image viewer that can zoom — for posters with small print a
 * runner wants to actually read.
 *
 * Zoom by pinch, mouse wheel, double tap / double click (toggles 2.5x at the
 * point tapped) or the + / − buttons; drag to pan once zoomed. At 1x a
 * horizontal swipe moves between images. Keyboard: Esc closes, ← / → move,
 * + / − zoom, 0 resets.
 *
 * One transform on the <img> carries the whole state: translate, then scale
 * around the image's centre. Zooming "at a point" keeps that point under the
 * finger by solving for the new translate. Panning is clamped so the image
 * edge never comes further in than the viewport edge.
 *
 * With several images, round thumbnails sit along the bottom, and moving to
 * another image reveals it as a circle growing out of that image's thumbnail
 * (the idea of 21st.dev's circular image gallery, drawn with a CSS clip-path
 * animation rather than GSAP from a CDN). Images are always shown whole.
 *
 * Portalled to <body> so no transformed or filtered ancestor can become the
 * containing block of the fixed overlay.
 */
export default function ZoomLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  label = 'Image',
}: {
  images: LightboxImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Alt text stem for images without a caption ("Pink Run highlight"). */
  label?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [view, setViewState] = useState<View>(RESET);
  // Ease button and double-tap zooms; follow the finger exactly otherwise.
  const [smooth, setSmooth] = useState(false);
  const viewRef = useRef<View>(RESET);
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({
    downX: 0, downY: 0, lastX: 0, lastY: 0, moved: false, pinched: false,
    startDist: 0, startMidX: 0, startMidY: 0, start: RESET as View,
  });
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The image being revealed over, and where the circle grows from. Null
  // reveal: the lightbox just opened, show the image without one.
  const [previous, setPrevious] = useState<number | null>(null);
  const [reveal, setReveal] = useState<{ key: number; x: string; y: string } | null>(null);

  const count = images.length;
  const current = images[index];

  useEffect(() => setMounted(true), []);

  // Body scroll stays put behind the viewer.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /** Pan limits for a scale: how far the scaled image overhangs the frame. */
  const clampView = useCallback((v: View): View => {
    const frame = frameRef.current;
    const img = imgRef.current;
    if (!frame || !img || v.s <= MIN_SCALE) return RESET;
    const maxX = Math.max(0, (img.offsetWidth * v.s - frame.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * v.s - frame.clientHeight) / 2);
    return {
      s: v.s,
      x: Math.min(maxX, Math.max(-maxX, v.x)),
      y: Math.min(maxY, Math.max(-maxY, v.y)),
    };
  }, []);

  const setView = useCallback(
    (v: View, ease = false) => {
      const next = clampView(v);
      viewRef.current = next;
      setSmooth(ease);
      setViewState(next);
    },
    [clampView]
  );

  /** Point (client coords) relative to the frame's centre. */
  const fromCentre = (clientX: number, clientY: number) => {
    const r = frameRef.current!.getBoundingClientRect();
    return { px: clientX - r.left - r.width / 2, py: clientY - r.top - r.height / 2 };
  };

  /** Scale to `s` keeping the frame point (px, py) fixed, from view `from`. */
  const zoomAt = useCallback(
    (s: number, px: number, py: number, from: View = viewRef.current, ease = false) => {
      const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
      const ratio = target / from.s;
      setView({ s: target, x: px - (px - from.x) * ratio, y: py - (py - from.y) * ratio }, ease);
    },
    [setView]
  );

  /** Show image `to`, revealed from its thumbnail. */
  const goTo = useCallback(
    (to: number) => {
      if (count < 2) return;
      const next = ((to % count) + count) % count;
      if (next === index) return;

      let x = '50%';
      let y = '100%';
      const frame = frameRef.current?.getBoundingClientRect();
      const dot = dotRefs.current[next]?.getBoundingClientRect();
      if (frame && dot) {
        x = `${((dot.left + dot.width / 2 - frame.left) / frame.width) * 100}%`;
        y = `${((dot.top + dot.height / 2 - frame.top) / frame.height) * 100}%`;
      }
      setPrevious(index);
      setReveal(r => ({ key: (r?.key ?? 0) + 1, x, y }));
      onIndexChange(next);
    },
    [count, index, onIndexChange]
  );

  const go = useCallback((by: 1 | -1) => goTo(index + by), [goTo, index]);

  // A new image always starts whole.
  useEffect(() => {
    viewRef.current = RESET;
    setViewState(RESET);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === '+' || e.key === '=') zoomAt(viewRef.current.s * BUTTON_STEP, 0, 0, undefined, true);
      else if (e.key === '-') zoomAt(viewRef.current.s / BUTTON_STEP, 0, 0, undefined, true);
      else if (e.key === '0') setView(RESET, true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, onClose, setView, zoomAt]);

  const onWheel = (e: React.WheelEvent) => {
    const { px, py } = fromCentre(e.clientX, e.clientY);
    zoomAt(viewRef.current.s * Math.exp(-e.deltaY * 0.0015), px, py);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 1) {
      Object.assign(g, { downX: e.clientX, downY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, pinched: false });
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      Object.assign(g, {
        pinched: true,
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startMidX: mid.px,
        startMidY: mid.py,
        start: viewRef.current,
      });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.start.s * (Math.hypot(a.x - b.x, a.y - b.y) / g.startDist)));
      const ratio = s / g.start.s;
      // Zoom about where the pinch started, then follow the fingers' midpoint.
      setView({
        s,
        x: g.startMidX - (g.startMidX - g.start.x) * ratio + (mid.px - g.startMidX),
        y: g.startMidY - (g.startMidY - g.start.y) * ratio + (mid.py - g.startMidY),
      });
      return;
    }

    if (Math.hypot(e.clientX - g.downX, e.clientY - g.downY) > 6) g.moved = true;
    if (viewRef.current.s > MIN_SCALE) {
      const v = viewRef.current;
      setView({ s: v.s, x: v.x + (e.clientX - g.lastX), y: v.y + (e.clientY - g.lastY) });
    }
    g.lastX = e.clientX;
    g.lastY = e.clientY;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0 || g.pinched) {
      // The finger left behind after a pinch should not pan from a stale spot.
      const rest = [...pointers.current.values()][0];
      if (rest) Object.assign(g, { lastX: rest.x, lastY: rest.y });
      if (pointers.current.size === 0) g.pinched = false;
      return;
    }

    const dx = e.clientX - g.downX;
    const dy = e.clientY - g.downY;
    if (viewRef.current.s === MIN_SCALE && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? 1 : -1);
      return;
    }
    if (g.moved) return;

    const now = Date.now();
    const t = lastTap.current;
    if (now - t.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 30) {
      lastTap.current = { t: 0, x: 0, y: 0 };
      if (viewRef.current.s > MIN_SCALE) setView(RESET, true);
      else {
        const { px, py } = fromCentre(e.clientX, e.clientY);
        zoomAt(TAP_ZOOM, px, py, undefined, true);
      }
    } else {
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };

  if (!mounted || !current) return null;

  const zoomed = view.s > MIN_SCALE;

  return createPortal(
    <div className="zoom-lightbox" role="dialog" aria-modal="true" aria-label={current.caption || label}>
      <div className="zoom-lightbox-bar">
        <div className="zoom-lightbox-title">
          {count > 1 && (
            <span className="zoom-lightbox-count">
              {index + 1} / {count}
            </span>
          )}
          {current.caption && <span className="zoom-lightbox-caption">{current.caption}</span>}
        </div>
        <div className="zoom-lightbox-tools">
          <button
            type="button"
            className="zoom-lightbox-btn"
            onClick={() => zoomAt(view.s / BUTTON_STEP, 0, 0, undefined, true)}
            disabled={!zoomed}
            aria-label="Zoom out"
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            className="zoom-lightbox-level"
            onClick={() => setView(RESET, true)}
            disabled={!zoomed}
            aria-label="Reset zoom"
            title="Reset zoom"
          >
            {Math.round(view.s * 100)}%
          </button>
          <button
            type="button"
            className="zoom-lightbox-btn"
            onClick={() => zoomAt(view.s * BUTTON_STEP, 0, 0, undefined, true)}
            disabled={view.s >= MAX_SCALE}
            aria-label="Zoom in"
          >
            <Plus size={18} />
          </button>
          <button type="button" className="zoom-lightbox-btn zoom-lightbox-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
      </div>

      <div
        ref={frameRef}
        className={`zoom-lightbox-frame${zoomed ? ' is-zoomed' : ''}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {previous !== null && images[previous] && (
          <div className="zoom-lightbox-layer" aria-hidden="true">
            <img src={images[previous].url} alt="" draggable={false} className="zoom-lightbox-img" />
          </div>
        )}
        <div
          key={reveal?.key ?? 0}
          className={`zoom-lightbox-layer${reveal ? ' is-revealing' : ''}`}
          style={reveal ? ({ '--ox': reveal.x, '--oy': reveal.y } as React.CSSProperties) : undefined}
          onAnimationEnd={e => {
            if (e.target === e.currentTarget) setPrevious(null);
          }}
        >
          <img
            ref={imgRef}
            src={current.url}
            alt={current.caption || `${label} ${index + 1}`}
            draggable={false}
            className={`zoom-lightbox-img${smooth ? ' is-smooth' : ''}`}
            style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})` }}
          />
        </div>
      </div>

      {count > 1 && (
        <>
          <button type="button" className="zoom-lightbox-btn zoom-lightbox-nav is-prev" onClick={() => go(-1)} aria-label="Previous image">
            <ChevronLeft size={24} />
          </button>
          <button type="button" className="zoom-lightbox-btn zoom-lightbox-nav is-next" onClick={() => go(1)} aria-label="Next image">
            <ChevronRight size={24} />
          </button>
        </>
      )}

      <div className="zoom-lightbox-foot">
        <p className="zoom-lightbox-hint" aria-hidden="true">
          {zoomed ? 'Drag to move · double-tap to reset' : 'Pinch, scroll or double-tap to zoom'}
        </p>
        {count > 1 && (
          <div className="zoom-lightbox-dots">
            {images.map((img, i) => (
              <button
                key={`${img.url}-${i}`}
                ref={el => {
                  dotRefs.current[i] = el;
                }}
                type="button"
                className={`zoom-lightbox-dot${i === index ? ' is-active' : ''}`}
                onClick={() => goTo(i)}
                aria-label={img.caption ? `Show ${img.caption}` : `Show image ${i + 1}`}
                aria-current={i === index}
              >
                <img src={img.url} alt="" draggable={false} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
