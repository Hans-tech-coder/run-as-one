/**
 * The geometry of the Run As One by: CRC mark, in one place.
 *
 * Three surfaces draw these same four shapes and none of them can reach the
 * others' copy: `components/RunAsOneLogo` renders them as JSX with CSS
 * variables for colour, `components/ThemedFavicon` serialises them to an SVG
 * data URI with literal colours because a favicon is a standalone document that
 * never sees the page's stylesheet, and `scripts` rasterises them for the
 * `.ico` and the Apple touch icon. Holding the path data here is what keeps a
 * tweak to the arcs from landing on the navbar and missing the browser tab.
 *
 * `app/icon.svg` is the fourth copy and the one exception: it is a static file
 * Next serves before any JavaScript runs, so it cannot import anything. **If
 * these paths change, change that file in the same edit.**
 */

/**
 * The shape's bounding box — strokes and round caps included — plus five units
 * on every side, so the mark carries its own even optical padding and can be
 * dropped into a square favicon or a circular avatar without being re-cropped.
 */
export const MARK_VIEWBOX = '40 44 96 76';

/** Which of the four logo inks a shape is drawn in. */
export type MarkInk = 'ink' | 'mid' | 'accent';

export const MARK_ARCS: { d: string; ink: MarkInk; width: number }[] = [
  { d: 'M52.5 110.4 A42 42 0 0 1 109.8 57.9', ink: 'ink', width: 9 },
  { d: 'M65.6 101.6 A27 27 0 0 1 101.2 70.6', ink: 'mid', width: 7 },
  { d: 'M79.4 99.4 A13 13 0 0 1 95.4 83.4', ink: 'accent', width: 5.5 },
];

/** The lead runner, already clear of the arcs. */
export const MARK_DOT = { cx: 124.7, cy: 66.6, r: 6.5, ink: 'accent' as MarkInk };

/**
 * The mark as a standalone SVG document, with colours written out literally.
 *
 * For the favicon: a browser fetches that icon as its own document, so it can
 * neither inherit `currentColor` nor resolve the `--logo-*` variables the
 * component draws with. The caller passes the three inks for the surface the
 * icon will sit on.
 */
export function markSvgMarkup(inks: Record<MarkInk, string>): string {
  const arcs = MARK_ARCS.map(
    (a) => `<path d="${a.d}" stroke="${inks[a.ink]}" stroke-width="${a.width}"/>`,
  ).join('');
  const dot = `<circle cx="${MARK_DOT.cx}" cy="${MARK_DOT.cy}" r="${MARK_DOT.r}" fill="${inks[MARK_DOT.ink]}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">` +
    `<g fill="none" stroke-linecap="round">${arcs}${dot}</g></svg>`
  );
}

/**
 * The two ink sets the favicon switches between, matching `--logo-*` in
 * `globals.css`. The light set deepens both accents for the same reason the
 * light theme does: brand orange on white is 2.8:1, and a thin stroke at that
 * contrast reads as a smudge — worse at 16px than anywhere else.
 */
export const MARK_INKS_FOR_DARK_UI: Record<MarkInk, string> = {
  ink: '#ffffff',
  mid: '#007AFF',
  accent: '#FF6B00',
};

export const MARK_INKS_FOR_LIGHT_UI: Record<MarkInk, string> = {
  ink: '#0a0a0b',
  mid: '#0062d6',
  accent: '#d95f00',
};
