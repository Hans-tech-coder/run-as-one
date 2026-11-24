/**
 * The geometry of the Run As One mark, in one place.
 *
 * `components/RunAsOneLogo` renders them as JSX with CSS variables for colour,
 * and the e-certificate draws them with pdf-lib. The official artwork lives in
 * `brand/logos/` (brand/brand-guide.md §2); the tab icon, Apple icon, email
 * logo and Open Graph card are cut from those files by
 * `scripts/gen-brand-assets.mjs`, not from this module. **If these paths
 * change, the brand files change with them and the assets are re-cut.**
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
