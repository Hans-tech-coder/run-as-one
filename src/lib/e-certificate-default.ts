/**
 * Run As One's own e-certificate, drawn when an event has no organizer
 * template: the site's dark look, the orange→blue gradient, and the small
 * "e-certificate by Run As One" byline that marks where it came from.
 */
import {
  clip, endPath, LineCapStyle, PDFDict, PDFDocument, PDFFont, PDFName, PDFOperator, PDFOperatorNames, PDFPage,
  popGraphicsState, pushGraphicsState, rectangle, rgb, setGraphicsState, StandardFonts, type RGB,
} from 'pdf-lib';
import { MARK_ARCS, MARK_DOT, MARK_VIEWBOX, type MarkInk } from '@/lib/brand-mark';
import type { CertificateEvent, CertificateResult } from '@/lib/e-certificate';
import { formatEventDay } from '@/lib/event-schedule';
import { toWholeSeconds } from '@/lib/race-time';
import { SITE_NAME } from '@/lib/site-contact';

// The default certificate is drawn in the site's own dark palette — the page
// ground, the two accents and the text greys from `globals.css` — so a runner
// who downloads one is holding the same brand they registered on.
const GROUND = rgb(0.0196, 0.0196, 0.0196); // --bg-dark #050505
const WHITE = rgb(1, 1, 1); // --text-primary
const SECONDARY = rgb(0.631, 0.631, 0.667); // --text-secondary #a1a1aa
const MUTED = rgb(0.541, 0.541, 0.576); // --text-muted #8a8a93
const ORANGE = rgb(1, 0.42, 0); // --accent-orange #FF6B00
const BLUE = rgb(0, 0.478, 1); // --accent-blue #007AFF
const MARK_COLORS: Record<MarkInk, RGB> = { ink: WHITE, mid: BLUE, accent: ORANGE }; // MARK_INKS_FOR_DARK_UI

const A4_LANDSCAPE: [number, number] = [842, 595];

type TextStyle = { font: PDFFont; size: number; tracking?: number; color: RGB };

/**
 * Text laid out by hand so it can be letter-spaced — pdf-lib has no tracking
 * option, and wide-set capitals are most of what makes a certificate read as
 * engraved rather than typed.
 */
function trackedWidth(text: string, font: PDFFont, size: number, tracking = 0): number {
  return font.widthOfTextAtSize(text, size) + tracking * Math.max(text.length - 1, 0);
}

function drawTracked(page: PDFPage, text: string, x: number, y: number, { font, size, tracking = 0, color }: TextStyle) {
  let cursor = x;
  for (const char of text) {
    page.drawText(char, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(char, size) + tracking;
  }
}

function drawCentered(page: PDFPage, text: string, y: number, style: TextStyle) {
  const w = trackedWidth(text, style.font, style.size, style.tracking);
  drawTracked(page, text, (page.getWidth() - w) / 2, y, style);
}

/**
 * The largest size from `max` down to `min` at which `text` fits `maxWidth`,
 * with its tracking shrinking in proportion. Returns the style to draw it in.
 */
function fitted(text: string, maxWidth: number, style: TextStyle, min: number): TextStyle {
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
function glow(doc: PDFDocument, page: PDFPage, x: number, y: number, radius: number, color: RGB, strength: number) {
  const [w, h] = A4_LANDSCAPE;
  paintShading(doc, page, {
    type: 3, coords: [x, y, 0, x, y, radius], from: scaled(color, strength), to: [0, 0, 0],
  }, { clip: [0, 0, w, h], screen: true });
}

/** The site's orange→blue (`--gradient-primary`) across a rectangle. */
function brandBar(doc: PDFDocument, page: PDFPage, x: number, y: number, width: number, height: number) {
  paintShading(doc, page, {
    type: 2, coords: [x, y, x + width, y], from: rgbArray(ORANGE), to: rgbArray(BLUE),
  }, { clip: [x, y, width, height] });
}

/** A rounded rectangle as an SVG path, origin at its top-left corner. */
function roundedRectPath(w: number, h: number, r: number): string {
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} `
    + `H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

const [MARK_X, MARK_Y, MARK_W, MARK_H] = MARK_VIEWBOX.split(' ').map(Number);

/** The mark's width when drawn `height` points tall. */
const markWidth = (height: number) => height * (MARK_W / MARK_H);

/**
 * The Run As One mark drawn as vectors from `lib/brand-mark.ts`, `height`
 * points tall with its top-left corner at (`left`, `top`). Vectors rather than
 * the email PNG so it stays sharp at any print size, and so a change to the
 * mark reaches the certificate along with everything else.
 */
function drawMark(page: PDFPage, left: number, top: number, height: number, opacity = 1) {
  const scale = height / MARK_H;
  const x = left - MARK_X * scale;
  const y = top + MARK_Y * scale;
  for (const arc of MARK_ARCS) {
    page.drawSvgPath(arc.d, {
      x, y, scale,
      borderColor: MARK_COLORS[arc.ink],
      borderWidth: arc.width,
      borderLineCap: LineCapStyle.Round,
      borderOpacity: opacity,
    });
  }
  page.drawCircle({
    x: x + MARK_DOT.cx * scale,
    y: y - MARK_DOT.cy * scale,
    size: MARK_DOT.r * scale,
    color: MARK_COLORS[MARK_DOT.ink],
    opacity,
  });
}

/**
 * Run As One's own certificate, for an event whose organizer uploaded none.
 *
 * A4 landscape in the site's look: the near-black ground with an orange glow
 * in one corner and a blue one in the other, the mark as a large faint
 * watermark running off the right edge, a hairline rounded frame, and the
 * orange→blue gradient as the rule under the title and the band along the
 * foot. Then the runner's name, the event with its day and location, and the
 * finish time, category and bib as tiles like the result page's. The small
 * "e-certificate by Run As One" lockup at the foot says where it came from —
 * drawn only here, never over an organizer's own artwork. Every line is fitted
 * to the page, so a long name or event title shrinks instead of running off.
 */
export async function drawDefaultCertificate(result: CertificateResult, event: CertificateEvent): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Certificate of Completion — ${result.name}`);
  pdfDoc.setAuthor(SITE_NAME);
  pdfDoc.setCreator(SITE_NAME);
  const page = pdfDoc.addPage(A4_LANDSCAPE);
  const [width, height] = A4_LANDSCAPE;
  const cx = width / 2;
  const textWidth = width - 180;

  const [sans, sansBold] = await Promise.all([
    pdfDoc.embedFont(StandardFonts.Helvetica),
    pdfDoc.embedFont(StandardFonts.HelveticaBold),
  ]);

  // Ground, light, watermark, frame.
  page.drawRectangle({ x: 0, y: 0, width, height, color: GROUND });
  glow(pdfDoc, page, 60, height + 40, 520, ORANGE, 0.34);
  glow(pdfDoc, page, width - 40, -60, 560, BLUE, 0.38);
  const watermarkH = 380;
  drawMark(page, width - markWidth(watermarkH) * 0.6, height - 90, watermarkH, 0.04);
  const frame = 20;
  page.drawSvgPath(roundedRectPath(width - frame * 2, height - frame * 2, 18), {
    x: frame, y: height - frame, borderColor: WHITE, borderWidth: 0.8, borderOpacity: 0.14,
  });
  brandBar(pdfDoc, page, 0, 0, width, 5);

  // Title.
  drawCentered(page, 'CERTIFICATE', 452, { font: sansBold, size: 50, tracking: 10, color: WHITE });
  drawCentered(page, 'OF COMPLETION', 424, { font: sansBold, size: 11, tracking: 7, color: ORANGE });
  brandBar(pdfDoc, page, cx - 60, 402, 120, 2.5);

  drawCentered(page, 'THIS CERTIFIES THAT', 370, { font: sans, size: 9, tracking: 3.5, color: SECONDARY });

  // The runner.
  const name = result.name.trim().toUpperCase();
  const nameStyle = fitted(name, textWidth, { font: sansBold, size: 44, tracking: 1.5, color: WHITE }, 18);
  drawCentered(page, name, 318, nameStyle);
  const underline = Math.max(460, trackedWidth(name, sansBold, nameStyle.size, nameStyle.tracking) + 40) / 2;
  page.drawLine({
    start: { x: cx - underline, y: 300 }, end: { x: cx + underline, y: 300 },
    thickness: 0.6, color: WHITE, opacity: 0.18,
  });

  // The race.
  drawCentered(page, 'HAS SUCCESSFULLY FINISHED', 274, { font: sans, size: 9, tracking: 3.5, color: SECONDARY });
  const title = (event.title?.trim() || 'Running Event').toUpperCase();
  drawCentered(page, title, 246, fitted(title, textWidth, { font: sansBold, size: 21, tracking: 2, color: WHITE }, 11));
  // Day and place, split by an orange dot the way the event hero pairs them.
  const meta = [event.date ? formatEventDay(event.date) : '', event.location?.trim() ?? ''].filter(Boolean);
  if (meta.length) {
    const metaStyle = fitted(meta.join('      '), textWidth, { font: sans, size: 10.5, color: MUTED }, 7);
    const gap = 26 * (metaStyle.size / 10.5);
    const widths = meta.map((m) => sans.widthOfTextAtSize(m, metaStyle.size));
    let mx = cx - (widths.reduce((a, b) => a + b, 0) + gap * (meta.length - 1)) / 2;
    meta.forEach((m, i) => {
      if (i > 0) {
        page.drawCircle({ x: mx + gap / 2, y: 226 + metaStyle.size * 0.35, size: 1.6, color: ORANGE });
        mx += gap;
      }
      drawTracked(page, m, mx, 226, metaStyle);
      mx += widths[i];
    });
  }

  // The figures as tiles: finish time, category and — when the runner has one —
  // bib. Each tile is as wide as its value needs (never under 150pt), so a long
  // category like "21KM HALF MARATHON" widens its own tile rather than
  // shrinking below the finish time beside it.
  const bib = result.bibNumber?.trim();
  const figures = [
    { label: 'FINISH TIME', value: toWholeSeconds(result.chipTime), accent: true },
    { label: 'CATEGORY', value: result.category.name.toUpperCase(), accent: false },
    ...(bib ? [{ label: 'BIB', value: bib, accent: false }] : []),
  ];
  const valueSize = 22;
  const padding = 44;
  const tileGap = 14;
  const natural = figures.map((fig) => Math.max(150, sansBold.widthOfTextAtSize(fig.value, valueSize) + padding));
  const room = textWidth - tileGap * (figures.length - 1);
  const squeeze = Math.min(1, room / natural.reduce((a, b) => a + b, 0));
  const tiles = natural.map((w) => w * squeeze);
  const tileH = 68;
  const tileY = 112;
  const labelStyle: TextStyle = { font: sansBold, size: 7.5, tracking: 2.5, color: SECONDARY };
  let tx = cx - (tiles.reduce((a, b) => a + b, 0) + tileGap * (figures.length - 1)) / 2;
  figures.forEach((fig, i) => {
    const w = tiles[i];
    page.drawSvgPath(roundedRectPath(w, tileH, 12), {
      x: tx, y: tileY + tileH,
      color: fig.accent ? ORANGE : WHITE, opacity: fig.accent ? 0.08 : 0.04,
      borderColor: fig.accent ? ORANGE : WHITE, borderWidth: 0.8, borderOpacity: fig.accent ? 0.45 : 0.12,
    });
    const mid = tx + w / 2;
    const labelW = trackedWidth(fig.label, labelStyle.font, labelStyle.size, labelStyle.tracking);
    drawTracked(page, fig.label, mid - labelW / 2, tileY + 46, {
      ...labelStyle, color: fig.accent ? ORANGE : SECONDARY,
    });
    const valueStyle = fitted(fig.value, w - padding, { font: sansBold, size: valueSize, color: fig.accent ? ORANGE : WHITE }, 10);
    // A value that had to shrink is raised so its capitals share the row's centre line.
    const lift = (valueSize - valueStyle.size) * 0.36;
    drawTracked(page, fig.value, mid - trackedWidth(fig.value, sansBold, valueStyle.size) / 2, tileY + 17 + lift, valueStyle);
    tx += w + tileGap;
  });

  // The byline at the foot: "E-CERTIFICATE BY [mark] RUN AS ONE", small.
  const by = 'E-CERTIFICATE BY';
  const brand = SITE_NAME.toUpperCase();
  const byStyle: TextStyle = { font: sans, size: 7.5, tracking: 2, color: MUTED };
  const brandStyle: TextStyle = { font: sansBold, size: 8.5, tracking: 2, color: WHITE };
  const footMarkH = 13;
  const gap = 6;
  const byW = trackedWidth(by, byStyle.font, byStyle.size, byStyle.tracking);
  const brandW = trackedWidth(brand, brandStyle.font, brandStyle.size, brandStyle.tracking);
  const footBase = 52;
  let fx = cx - (byW + gap + markWidth(footMarkH) + gap + brandW) / 2;
  drawTracked(page, by, fx, footBase, byStyle);
  fx += byW + gap;
  drawMark(page, fx, footBase + footMarkH / 2 + 3, footMarkH);
  fx += markWidth(footMarkH) + gap;
  drawTracked(page, brand, fx, footBase - 0.5, brandStyle);

  return pdfDoc.save();
}
