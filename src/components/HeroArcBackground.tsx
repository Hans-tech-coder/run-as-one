"use client";

import { useEffect, useRef } from 'react';

/**
 * The glowing dot arc behind the home page hero.
 *
 * Ported from the "Predictive Arc" canvas background (designcode's threeui), and
 * only its core renderer — the package ships a dozen sibling variants behind
 * iframes and Three.js, none of which this page needs, so nothing of it is
 * installed and no library comes with it.
 *
 * The recolour is the point of the port. The original is a violet ramp with a
 * white core, which belongs to nobody's brand. Here the arch is read as the
 * logo's own track bend — and, standing over "Find Your Next Finish Line", as a
 * finish gantry — so it is drawn in the logo's two lanes: the **outer rim in
 * brand orange, the inside in brand blue**, meeting in a warm white core. Blue
 * on the inside is also what keeps the headline legible, since the copy sits
 * under the arch and blue is the darker of the two accents. The colours are
 * read from `--accent-orange` / `--accent-blue` at mount rather than typed, so
 * the arc cannot drift from the buttons in front of it.
 *
 * Kept deliberately quiet, because a decorative loop behind body copy is the
 * kind of motion that tires people: the wave runs at about half the original's
 * rate, the loop stops while the hero is off screen or the tab is hidden, and
 * with reduced motion requested it draws one still frame and never animates.
 * Time is measured in seconds rather than frames, so a 120Hz display does not
 * run it at double speed.
 */

type Rgb = [number, number, number];

const ARC = {
  /** Grid pitch in CSS pixels; every dot sits on it, so nothing jitters. */
  spacing: 5,
  /** Largest dot, in CSS pixels, reached at full intensity. */
  dotSize: 5.5,
  /**
   * How far above the hero's first line the apex sits, in CSS pixels at desktop
   * width (it shrinks with the band on narrower screens). Anchored
   * to the copy rather than to a fraction of the layer, because the layer's
   * height changes with every line the headline wraps to — and a fraction put
   * the white-hot core straight through the headline at some widths.
   */
  apexLift: 40,
  /** How far the arms fall by the edge of the span, as a fraction of height… */
  drop: 0.72,
  /** …but never more than this fraction of the width. See `draw`. */
  dropCap: 0.5,
  /** Span of the parabola relative to the layer's width; wider is flatter. */
  spread: 1.5,
  /** Wave phase per second. The original moved 0.9/s at 60fps. */
  waveRate: 0.5,
  /** Overall gain on the dot colours, under the scrim that follows. */
  gain: 0.9,
  /** Redraws per second. See the loop for why it is not the display's rate. */
  fps: 30,
} as const;

/** A warm white for the core, rather than a blue-white that fights the orange. */
const HOT: Rgb = [255, 240, 224];

const FALLBACK_ORANGE: Rgb = [255, 107, 0];
const FALLBACK_BLUE: Rgb = [0, 122, 255];

/** Colours are quantised into a small table so a frame never builds a string per dot. */
const SIDE_STEPS = 24;
const LEVEL_STEPS = 32;

function readTokenColour(name: string, fallback: Rgb): Rgb {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : '';
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return fallback;
  const value = parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Every colour a dot can take, indexed by which side of the arc's centre line
 * it sits on and how bright it is. The hand-over between the lanes is kept
 * narrow, because orange and blue mixed evenly make a grey — and the only place
 * that mix happens is on the centre line, where the core's white covers it.
 */
function buildPalette(orange: Rgb, blue: Rgb) {
  const table: string[] = [];
  for (let side = 0; side < SIDE_STEPS; side += 1) {
    const s = (side / (SIDE_STEPS - 1)) * 2 - 1;
    const t = smoothstep(-0.28, 0.28, s);
    const base: Rgb = [
      orange[0] + (blue[0] - orange[0]) * t,
      orange[1] + (blue[1] - orange[1]) * t,
      orange[2] + (blue[2] - orange[2]) * t,
    ];
    for (let level = 0; level < LEVEL_STEPS; level += 1) {
      const intensity = (level + 0.5) / LEVEL_STEPS;
      const body = Math.pow(intensity, 1.35);
      const core = intensity > 0.7 ? Math.pow((intensity - 0.7) / 0.3, 2) * 0.55 : 0;
      const channel = (i: number) =>
        Math.min(255, Math.round((base[i] * body + HOT[i] * core) * ARC.gain));
      table.push(`rgb(${channel(0)},${channel(1)},${channel(2)})`);
    }
  }
  return table;
}

function createArcRenderer(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return null;

  const palette = buildPalette(
    readTokenColour('--accent-orange', FALLBACK_ORANGE),
    readTokenColour('--accent-blue', FALLBACK_BLUE),
  );
  // Each colour's dots for the frame being drawn, as flat [left, top, size]
  // runs, emptied again as they are flushed.
  const buckets: number[][] = palette.map(() => []);
  let width = 1;
  let height = 1;
  let leadY = 0;

  /** `contentTop` is where the hero's first line sits, in the layer's own pixels. */
  const resize = (nextWidth: number, nextHeight: number, contentTop: number) => {
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    leadY = contentTop;
    // 1.5 rather than the screen's own 2 or 3: the dots are soft squares a few
    // pixels across, and the extra resolution bought nothing visible for the
    // fill cost it added.
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const draw = (time: number) => {
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = 'lighter';

    const { spacing, dotSize } = ARC;
    const centreX = width / 2;
    const halfSpan = (width * ARC.spread) / 2;
    // The band was sized for a desktop frame; on a phone the same 440px would
    // bury the whole hero, so it narrows with the viewport — and the apex's
    // lift with it, or a phone's arch would crown the navbar instead of the copy.
    const bandScale = Math.min(1, Math.max(0.35, width / 1440));
    const apexY = leadY - ARC.apexLift * bandScale;
    // A phone's hero is tall and narrow, and a fall tied to height alone
    // dropped the arms almost vertically — straight through the paragraph,
    // which is where the copy most needs a quiet ground. Capping it by the
    // width keeps the arch an arch at every size.
    const drop = Math.min(height * ARC.drop, width * ARC.dropCap);

    for (let x = 0; x < width; x += spacing) {
      const nx = (x - centreX) / halfSpan;
      const edgeFade = 1 - Math.pow(Math.abs(nx), 2.5);
      if (edgeFade <= 0) continue;
      const curveY = apexY + nx * nx * drop;
      const band = (140 + (1 - Math.abs(nx)) * 80) * bandScale;
      const waveX = Math.sin(x * 0.015 + time);

      // Only the rows the band can reach, snapped to the grid.
      const firstY = Math.max(0, Math.ceil((curveY - band) / spacing) * spacing);
      const lastY = Math.min(height, curveY + band);
      for (let y = firstY; y < lastY; y += spacing) {
        const offset = y - curveY;
        let intensity = 1 - Math.abs(offset) / band;
        const waveY = Math.cos(y * 0.02 + time);
        intensity = (intensity * 0.7 + waveX * waveY * 0.3 * intensity) * edgeFade;
        if (intensity <= 0.02) continue;

        const side = Math.round(((offset / band + 1) / 2) * (SIDE_STEPS - 1));
        const level = Math.min(LEVEL_STEPS - 1, Math.floor(intensity * LEVEL_STEPS));
        const size = dotSize * intensity;
        buckets[side * LEVEL_STEPS + level].push(x - size / 2, y - size / 2, size);
      }
    }

    // One path per colour rather than a fillStyle and a fillRect per dot, since
    // every fillStyle assignment re-parses its colour. Measured, it took about a
    // fifth off a full-width frame.
    for (let colour = 0; colour < buckets.length; colour += 1) {
      const runs = buckets[colour];
      if (runs.length === 0) continue;
      context.fillStyle = palette[colour];
      context.beginPath();
      for (let i = 0; i < runs.length; i += 3) {
        context.rect(runs[i], runs[i + 1], runs[i + 2], runs[i + 2]);
      }
      context.fill();
      runs.length = 0;
    }
  };

  return { resize, draw };
}

export default function HeroArcBackground() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    const renderer = createArcRenderer(canvas);
    if (!renderer) return undefined;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // The still frame reduced motion gets: a phase where the wave has lifted
    // both arms, so the arch reads whole rather than caught mid-trough.
    const STILL_PHASE = 1.2;
    let time = STILL_PHASE;
    let frame = 0;
    let last = 0;
    let onScreen = true;

    const reveal = () => {
      host.dataset.ready = 'true';
    };

    const frameInterval = 1000 / ARC.fps;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Thirty frames a second is plenty for a wave this slow, and it halves
      // the work: a full-width frame is some 20,000 dots, and this runs behind
      // the page a runner is trying to read and scroll.
      if (last && now - last < frameInterval - 2) return;
      // Clamped, so a tab returning from the background resumes where it left
      // off instead of leaping several seconds of wave at once.
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      time += dt * ARC.waveRate;
      renderer.draw(time);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    };

    const sync = () => {
      const shouldRun = onScreen && !document.hidden && !motion.matches;
      if (shouldRun && !frame) frame = requestAnimationFrame(tick);
      if (!shouldRun) {
        stop();
        if (motion.matches) {
          time = STILL_PHASE;
          renderer.draw(time);
        }
      }
    };

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      // The layer starts --nav-offset above the hero section, and the section
      // pads its own top on wider screens, so the copy begins at the sum.
      const section = host.parentElement;
      const contentTop =
        -parseFloat(getComputedStyle(host).top) +
        (section ? parseFloat(getComputedStyle(section).paddingTop) : 0);
      renderer.resize(bounds.width, bounds.height, Number.isFinite(contentTop) ? contentTop : 0);
      // A resize clears the canvas, so paint straight away rather than leave a
      // blank frame until the next tick (or for ever, when the loop is off).
      renderer.draw(time);
    };

    const sizeObserver = new ResizeObserver(resize);
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      sync();
    });

    sizeObserver.observe(host);
    visibility.observe(host);
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);

    resize();
    reveal();
    sync();

    return () => {
      stop();
      sizeObserver.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
    };
  }, []);

  return (
    <div ref={hostRef} className="hero-arc" aria-hidden="true">
      <canvas ref={canvasRef} className="hero-arc__canvas" />
      <div className="hero-arc__scrim" />
    </div>
  );
}
