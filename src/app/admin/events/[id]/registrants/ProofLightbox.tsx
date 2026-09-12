"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCw, Undo2, ExternalLink, CheckCircle } from 'lucide-react';
import { formatPesos } from '@/lib/money';

/**
 * A deposit slip at the size a human can actually read it.
 *
 * The detail modal shows the proof as a 300px thumbnail, which is enough to
 * see that *something* was uploaded and not enough to do the one job it is
 * there for: read a reference number off a phone photo of a bank receipt and
 * check it against the order. This is that same image full-screen, with the
 * three things a receipt needs — zoom, pan and rotate (phone photos arrive
 * sideways) — and the numbers it has to be matched against printed under it,
 * so the organizer is not memorising a transaction number while they squint.
 *
 * A receipt is not always a photo. A bank transfer done in an app is often
 * confirmed by an emailed PDF, and a runner may upload that instead of
 * screenshotting it, so `isPdf` swaps the image for a frame holding the
 * document. The browser's own PDF viewer owns zoom and rotation there, so
 * those tools step aside rather than sitting dead in the toolbar — but the
 * footer, with the order it has to be checked against, stays exactly the same.
 *
 * Portalled to <body>: the detail modal it opens from is itself a fixed
 * overlay whose frame is `overflow-hidden`, so left inline this would be
 * clipped by the very panel it is meant to cover.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 8;
/** One press of a zoom button, one notch of the wheel, one key. */
const SCALE_STEP = 0.5;
/**
 * How far an arrow key slides the image. Dragging is a mouse gesture, and
 * WCAG 2.2 asks for a single-pointer / keyboard way to do anything a drag
 * does — so the arrows pan and the buttons zoom.
 */
const PAN_STEP = 64;
/** Matches --modal-close-dur in globals.css. */
const CLOSE_MS = 150;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export default function ProofLightbox({
  registrationId,
  orderRef,
  transactionNumber,
  totalAmount,
  status,
  isPdf = false,
  canValidate = false,
  isValidating = false,
  onValidate,
  onClose,
}: {
  registrationId: string;
  orderRef: string;
  transactionNumber?: string | null;
  totalAmount: number;
  status: string;
  /** A PDF receipt rather than a picture of one — see the note above. */
  isPdf?: boolean;
  /** Whether this order is still waiting on a human — a PENDING bank transfer. */
  canValidate?: boolean;
  isValidating?: boolean;
  onValidate?: () => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The handlers below are attached once (the wheel one has to be, to be
  // non-passive) and read the live values from here rather than from a
  // closure that would go stale on the first zoom. Written after the commit,
  // never during a render.
  const stateRef = useRef({ scale: 1, rotation: 0, offset: { x: 0, y: 0 } });
  useEffect(() => {
    stateRef.current = { scale, rotation, offset };
  }, [scale, rotation, offset]);

  /** Live pointers on the image — one is a drag, two are a pinch. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragFromRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchFromRef = useRef<{ dist: number; scale: number } | null>(null);

  const src = `/api/admin/proof/${registrationId}`;

  // One frame after mount, so the scale-in has a state to travel from.
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    closeRef.current?.focus();
    return () => cancelAnimationFrame(id);
  }, []);

  const requestClose = useCallback(() => {
    setOpen(false);
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  /**
   * Keeps the image from being dragged off the screen. At fit size there is
   * nowhere to go; every step of zoom adds half the overflow on each side. A
   * quarter turn swaps which side is which.
   */
  const clampOffset = useCallback((next: { x: number; y: number }, s: number, deg: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return next;
    const turned = Math.abs(deg % 180) === 90;
    const w = turned ? rect.height : rect.width;
    const h = turned ? rect.width : rect.height;
    const maxX = Math.max(0, (w * (s - 1)) / 2);
    const maxY = Math.max(0, (h * (s - 1)) / 2);
    return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }, []);

  /**
   * Zooms to `next`, keeping whatever is under `anchor` (a client point)
   * under it — so the wheel and a double-click magnify the line being read
   * rather than the middle of the picture.
   */
  const zoomTo = useCallback((next: number, anchor?: { x: number; y: number }) => {
    const { scale: prev, offset: o, rotation: deg } = stateRef.current;
    const s = clamp(next, MIN_SCALE, MAX_SCALE);
    if (s === prev) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    let moved: { x: number; y: number };
    if (rect && anchor) {
      const ax = anchor.x - (rect.left + rect.width / 2);
      const ay = anchor.y - (rect.top + rect.height / 2);
      moved = { x: ax - (ax - o.x) * (s / prev), y: ay - (ay - o.y) * (s / prev) };
    } else {
      moved = { x: (o.x * s) / prev, y: (o.y * s) / prev };
    }
    setScale(s);
    setOffset(clampOffset(moved, s, deg));
  }, [clampOffset]);

  const reset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  const rotate = useCallback(() => {
    const { scale: s, offset: o, rotation: was } = stateRef.current;
    const deg = (was + 90) % 360;
    setRotation(deg);
    setOffset(clampOffset(o, s, deg));
  }, [clampOffset]);

  const pan = useCallback((dx: number, dy: number) => {
    const { scale: s, offset: o, rotation: deg } = stateRef.current;
    setOffset(clampOffset({ x: o.x + dx, y: o.y + dy }, s, deg));
  }, [clampOffset]);

  // Escape closes, and the rest is the shortcut set every image viewer has —
  // reached for before any of the buttons are found.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { requestClose(); return; }
      // A PDF is the embedded viewer's to zoom and scroll; taking its keys
      // away would leave the reader unable to page through the document.
      if (isPdf) return;
      if (e.key === '+' || e.key === '=') { zoomTo(stateRef.current.scale + SCALE_STEP); return; }
      if (e.key === '-' || e.key === '_') { zoomTo(stateRef.current.scale - SCALE_STEP); return; }
      if (e.key === '0') { reset(); return; }
      if (e.key === 'r' || e.key === 'R') { rotate(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); pan(PAN_STEP, 0); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); pan(-PAN_STEP, 0); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); pan(0, PAN_STEP); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); pan(0, -PAN_STEP); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isPdf, requestClose, zoomTo, reset, rotate, pan]);

  // Non-passive, because the point is to zoom instead of scrolling whatever is
  // underneath. React's onWheel is passive and cannot preventDefault.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || isPdf) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
      zoomTo(stateRef.current.scale + step, { x: e.clientX, y: e.clientY });
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [isPdf, zoomTo]);

  // Nothing behind a full-screen viewer should scroll while it is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const pointerDown = (e: React.PointerEvent) => {
    const pts = pointersRef.current;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinchFromRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: stateRef.current.scale };
      dragFromRef.current = null;
      setDragging(false);
      return;
    }
    if (stateRef.current.scale > 1) {
      const { offset: o } = stateRef.current;
      dragFromRef.current = { x: e.clientX, y: e.clientY, ox: o.x, oy: o.y };
      setDragging(true);
    }
  };

  const pointerMove = (e: React.PointerEvent) => {
    const pts = pointersRef.current;
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pinch = pinchFromRef.current;
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.dist > 0) {
        zoomTo(pinch.scale * (dist / pinch.dist), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
      return;
    }

    const from = dragFromRef.current;
    if (!from) return;
    const { scale: s, rotation: deg } = stateRef.current;
    setOffset(clampOffset({ x: from.ox + (e.clientX - from.x), y: from.oy + (e.clientY - from.y) }, s, deg));
  };

  const pointerUp = (e: React.PointerEvent) => {
    const pts = pointersRef.current;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinchFromRef.current = null;
    if (pts.size === 0) {
      dragFromRef.current = null;
      setDragging(false);
    }
  };

  // Only ever rendered from a click, so there is no server pass to guard
  // against — but a portal needs a document either way.
  if (typeof document === 'undefined') return null;

  const zoomed = scale > 1;
  const frameState = `${open ? 'is-open' : ''} ${closing ? 'is-closing' : ''}`;
  const toolBtn =
    'flex items-center justify-center w-10 h-10 rounded-lg border border-white/10 bg-white/5 text-gray-300 ' +
    'hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div
        className={`t-modal w-full h-full max-w-6xl flex flex-col rounded-2xl border border-white/10 bg-[#0b0b0b] shadow-2xl overflow-hidden ${frameState}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Proof of payment for order ${orderRef}`}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white m-0 truncate">Proof of Payment</p>
            <p className="text-xs text-gray-500 m-0 truncate">
              {orderRef}
              {isPdf && ' · PDF'}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {!isPdf && (
              <>
                <button
                  type="button"
                  onClick={() => zoomTo(scale - SCALE_STEP)}
                  disabled={scale <= MIN_SCALE}
                  className={toolBtn}
                  aria-label="Zoom out"
                  title="Zoom out (−)"
                >
                  <ZoomOut size={18} />
                </button>
                {/* The number is a button too: the quickest way back to a whole
                    receipt after chasing one digit across it. */}
                <button
                  type="button"
                  onClick={reset}
                  className="hidden sm:flex items-center justify-center min-w-[4rem] h-10 px-2 rounded-lg border border-white/10 bg-white/5 text-xs font-medium text-gray-300 tabular-nums hover:bg-white/10 hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  title="Reset the view (0)"
                >
                  {Math.round(scale * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => zoomTo(scale + SCALE_STEP)}
                  disabled={scale >= MAX_SCALE}
                  className={toolBtn}
                  aria-label="Zoom in"
                  title="Zoom in (+)"
                >
                  <ZoomIn size={18} />
                </button>
                <button type="button" onClick={rotate} className={toolBtn} aria-label="Rotate by 90 degrees" title="Rotate (R)">
                  <RotateCw size={18} />
                </button>
                <button type="button" onClick={reset} className={`${toolBtn} sm:hidden`} aria-label="Reset the view" title="Reset the view (0)">
                  <Undo2 size={18} />
                </button>
              </>
            )}
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className={toolBtn}
              aria-label="Open the receipt in a new tab"
              title="Open in a new tab"
            >
              <ExternalLink size={18} />
            </a>
            <button ref={closeRef} type="button" onClick={requestClose} className={toolBtn} aria-label="Close" title="Close (Esc)">
              <X size={18} />
            </button>
          </div>
        </div>

        <div
          ref={viewportRef}
          className={`relative flex-1 min-h-0 overflow-hidden flex items-center justify-center bg-black/60 ${isPdf ? '' : 'touch-none'}`}
          onPointerDown={isPdf ? undefined : pointerDown}
          onPointerMove={isPdf ? undefined : pointerMove}
          onPointerUp={isPdf ? undefined : pointerUp}
          onPointerCancel={isPdf ? undefined : pointerUp}
          onDoubleClick={
            isPdf ? undefined : e => (zoomed ? reset() : zoomTo(2.5, { x: e.clientX, y: e.clientY }))
          }
          style={isPdf ? undefined : { cursor: dragging ? 'grabbing' : zoomed ? 'grab' : 'zoom-in' }}
        >
          {!loaded && !failed && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" aria-hidden="true" />
              <span className="sr-only">Loading the proof of payment</span>
            </div>
          )}

          {failed ? (
            <div className="px-6 text-center">
              <p className="text-sm text-gray-300 m-0">This receipt could not be loaded.</p>
              <p className="text-xs text-gray-500 mt-1 m-0">
                Its link is signed and short-lived — close this and open it again, or{' '}
                <a href={src} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">
                  try it in a new tab
                </a>
                .
              </p>
            </div>
          ) : isPdf ? (
            /*
              The browser's own PDF viewer, on the same signed-redirect route
              the image uses. An <iframe> cannot tell us it was refused —
              onLoad fires either way — so the loading spinner is cleared on
              load and the toolbar's *Open in a new tab* is repeated in words
              underneath, for the browser that will not show a PDF inline.
            */
            <iframe
              src={src}
              title={`Proof of payment for order ${orderRef}`}
              onLoad={() => setLoaded(true)}
              className="w-full h-full border-0 bg-white"
            />
          ) : (
            <img
              src={src}
              alt={`Proof of payment for order ${orderRef}`}
              draggable={false}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className="max-w-full max-h-full object-contain select-none"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
                transition: dragging ? 'none' : 'transform var(--modal-open-dur) var(--modal-ease)',
                opacity: loaded ? 1 : 0,
                willChange: 'transform',
              }}
            />
          )}
        </div>

        {/* What the receipt has to agree with. Reading a number off the image
            and checking it against the order is the whole job, and it was
            being done across two screens. */}
        <div className="shrink-0 border-t border-white/10 bg-black/40 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <p className="flex flex-col m-0 text-sm">
            <span className="text-xs text-gray-500">Order Total</span>
            <span className="text-white font-medium">&#8369;{formatPesos(totalAmount)}</span>
          </p>
          <p className="flex flex-col m-0 text-sm">
            <span className="text-xs text-gray-500">Transaction No.</span>
            <span className={`font-medium ${transactionNumber ? 'text-white' : 'text-gray-500 italic'}`}>
              {transactionNumber || 'Not given'}
            </span>
          </p>
          <p className="hidden sm:flex flex-col m-0 text-sm">
            <span className="text-xs text-gray-500">Status</span>
            <span className="text-white font-medium">{status}</span>
          </p>

          <div className="ml-auto flex items-center gap-4">
            {isPdf ? (
              <p className="hidden lg:block text-xs text-gray-600 m-0">
                Will not display?{' '}
                <a href={src} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">
                  Open it in a new tab
                </a>{' '}
                &middot; Esc closes
              </p>
            ) : (
              <p className="hidden xl:block text-xs text-gray-600 m-0">
                Scroll or pinch to zoom &middot; drag or arrow keys to pan &middot; R rotates &middot; Esc closes
              </p>
            )}
            {canValidate && onValidate && (
              <button type="button" onClick={onValidate} disabled={isValidating} className="btn-light">
                <CheckCircle className="w-4 h-4" />
                {isValidating ? 'Validating...' : 'Validate Payment'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
