/**
 * The drawing primitives pdf-lib lacks, for the e-certificate: letter-spaced
 * and fitted text, real gradients (shadings) and glows, rounded rectangles,
 * and the Run As One mark as vectors. `e-certificate-layout.ts` composes them.
 */
import {
  clip, endPath, LineCapStyle, PDFDict, PDFDocument, PDFFont, PDFName, PDFOperator, PDFOperatorNames, PDFPage,
  popGraphicsState, pushGraphicsState, rectangle, rgb, setGraphicsState, type RGB,
} from 'pdf-lib';
import { MARK_ARCS, MARK_DOT, MARK_VIEWBOX, type MarkInk } from '@/lib/brand-mark';

export const ORANGE = rgb(1, 0.42, 0); // --accent-orange #FF6B00
export const BLUE = rgb(0, 0.478, 1); // --accent-blue #007AFF

export type TextStyle = { font: PDFFont; size: number; tracking?: number; color: RGB };

/**
 * Text laid out by hand so it can be letter-spaced — pdf-lib has no tracking
 * option, and wide-set capitals are most of what makes a certificate read as
 * engraved rather than typed.
 */
export function trackedWidth(text: string, font: PDFFont, size: number, tracking = 0): number {
  return font.widthOfTextAtSize(text, size) + tracking * Math.max(text.length - 1, 0);
}

export function drawTracked(page: PDFPage, text: string, x: number, y: number, { font, size, tracking = 0, color }: TextStyle) {
  let cursor = x;
  for (const char of text) {
    page.drawText(char, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(char, size) + tracking;
  }
}

export function drawCentered(page: PDFPage, text: string, y: number, style: TextStyle) {
  const w = trackedWidth(text, style.font, style.size, style.tracking);
  drawTracked(page, text, (page.getWidth() - w) / 2, y, style);
}

/**
 * The largest size from `max` down to `min` at which `text` fits `maxWidth`,
 * with its tracking shrinking in proportion. Returns the style to draw it in.
 */
export function fitted(text: string, maxWidth: number, style: TextStyle, min: number): TextStyle {
  const max = style.size;
  const at = (size: number) => ({ ...style, size, tracking: (style.tracking ?? 0) * (size / max) });
  let size = max;
  while (size > min && trackedWidth(text, style.font, size, at(size).tracking) > maxWidth) size -= 0.5;
  return at(size);
}

const rgbArray = (c: RGB) => [c.red, c.green, c.blue];
const scaled = (c: RGB, k: number) => [c.red * k, c.green * k, c.blue * k];

/**
 * Paints a real PDF gradient (a shading), which pdf-lib has no drawing call
 * for. `clip` limits it to a rectangle; `screen` blends it with the Screen
 * mode, so a glow that fades to black adds light to whatever is under it and
 * two glows can overlap without either cutting a hard edge in the other.
 */
function paintShading(
  doc: PDFDocument, page: PDFPage,
  shading: { type: 2 | 3; coords: number[]; from: number[]; to: number[] },
  { clip: box, screen = false }: { clip?: [number, number, number, number]; screen?: boolean } = {},
) {
  const ctx = doc.context;
  const ref = ctx.register(ctx.obj({
    ShadingType: shading.type,
    ColorSpace: 'DeviceRGB',
    Coords: shading.coords,
    Function: { FunctionType: 2, Domain: [0, 1], C0: shading.from, C1: shading.to, N: 1 },
    Extend: [true, true],
  }));
  const { Resources } = page.node.normalizedEntries();
  let shadings = Resources.lookupMaybe(PDFName.of('Shading'), PDFDict);
  if (!shadings) {
    shadings = ctx.obj({});
    Resources.set(PDFName.of('Shading'), shadings);
  }
  const key = shadings.uniqueKey('Sh');
  shadings.set(key, ref);

  const ops = [pushGraphicsState()];
  if (screen) {
    ops.push(setGraphicsState(page.node.newExtGState('GS', ctx.register(ctx.obj({ Type: 'ExtGState', BM: 'Screen' })))));
  }
  if (box) ops.push(rectangle(...box), clip(), endPath());
  ops.push(PDFOperator.of(PDFOperatorNames.ShadingFill, [key]), popGraphicsState());
  page.pushOperators(...ops);
}

/** A soft round glow of `color`, brightest (`strength`) at its centre and gone by `radius`. */
export function glow(doc: PDFDocument, page: PDFPage, x: number, y: number, radius: number, color: RGB, strength: number) {
  paintShading(doc, page, {
    type: 3, coords: [x, y, 0, x, y, radius], from: scaled(color, strength), to: [0, 0, 0],
  }, { clip: [0, 0, page.getWidth(), page.getHeight()], screen: true });
}

/** A left-to-right gradient across a rectangle — the site's `--gradient-primary` by default. */
export function brandBar(
  doc: PDFDocument, page: PDFPage, x: number, y: number, width: number, height: number,
  from: RGB = ORANGE, to: RGB = BLUE,
) {
  paintShading(doc, page, {
    type: 2, coords: [x, y, x + width, y], from: rgbArray(from), to: rgbArray(to),
  }, { clip: [x, y, width, height] });
}

/** A rounded rectangle as an SVG path, origin at its top-left corner. */
export function roundedRectPath(w: number, h: number, r: number): string {
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} `
    + `H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

const [MARK_X, MARK_Y, MARK_W, MARK_H] = MARK_VIEWBOX.split(' ').map(Number);

/** The mark's width when drawn `height` points tall. */
export const markWidth = (height: number) => height * (MARK_W / MARK_H);

/**
 * The Run As One mark drawn as vectors from `lib/brand-mark.ts`, `height`
 * points tall with its top-left corner at (`left`, `top`). Vectors rather than
 * the email PNG so it stays sharp at any print size, and so a change to the
 * mark reaches the certificate along with everything else.
 */
export function drawMark(
  page: PDFPage, left: number, top: number, height: number, inks: Record<MarkInk, RGB>, opacity = 1,
) {
  const scale = height / MARK_H;
  const x = left - MARK_X * scale;
  const y = top + MARK_Y * scale;
  for (const arc of MARK_ARCS) {
    page.drawSvgPath(arc.d, {
      x, y, scale,
      borderColor: inks[arc.ink],
      borderWidth: arc.width,
      borderLineCap: LineCapStyle.Round,
      borderOpacity: opacity,
    });
  }
  page.drawCircle({
    x: x + MARK_DOT.cx * scale,
    y: y - MARK_DOT.cy * scale,
    size: MARK_DOT.r * scale,
    color: inks[MARK_DOT.ink],
    opacity,
  });
}
