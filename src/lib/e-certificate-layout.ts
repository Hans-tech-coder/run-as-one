/**
 * The e-certificate's content block — one design for Run As One's default
 * certificate and for an organizer's template in the designed layout, so a
 * certificate on a client's artwork carries the same typography as ours.
 *
 * `drawContentBlock` stacks Certificate of Completion, the runner's name, the
 * event and the figure tiles into a box, scaled down to fit it; rows the
 * organizer switched off close up rather than leaving a gap. `drawByline` is the
 * small "e-certificate by [mark] Run As One" at the foot. Colours come from an
 * `InkTheme`: light ink for a dark ground, dark ink for a light one.
 */
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts, type RGB } from 'pdf-lib';
import type { MarkInk } from '@/lib/brand-mark';
import type { CertificateFields } from '@/lib/certificate-settings';
import { genderDivision } from '@/lib/gender-division';
import {
  BLUE, brandBar, drawCentered, drawMark, drawTracked, fitted, markWidth, ORANGE, roundedRectPath, trackedWidth,
  type TextStyle,
} from '@/lib/e-certificate-draw';
import { SITE_NAME } from '@/lib/site-contact';

/** The page every size here is designed against; a wider page scales up. */
export const DESIGN_WIDTH = 842;

const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

export interface InkTheme {
  ink: RGB;
  secondary: RGB;
  muted: RGB;
  accent: RGB;
  /** The far end of the rule under the title: brand blue, or the accent again. */
  accentEnd: RGB;
  /** What hairlines and tile surfaces are made of, and how strongly. */
  line: RGB;
  lineOpacity: number;
  /** The tiles' surface: a faint white lift on a dark ground, frosted white on a light one. */
  tile: RGB;
  tileFill: number;
  tileBorder: number;
  mark: Record<MarkInk, RGB>;
}

/**
 * The two ink sets. `light` is the site's own dark-UI palette (text greys from
 * `globals.css`, `MARK_INKS_FOR_DARK_UI`); `dark` is the light theme's, with
 * both accents deepened because brand orange on white is 2.8:1. An organizer's
 * accent replaces orange and turns the title rule into a solid bar of it.
 */
export function inkTheme(ink: 'light' | 'dark', accent?: RGB): InkTheme {
  if (ink === 'light') {
    return {
      ink: WHITE,
      secondary: rgb(0.631, 0.631, 0.667), // --text-secondary #a1a1aa
      muted: rgb(0.541, 0.541, 0.576), // --text-muted #8a8a93
      accent: accent ?? ORANGE,
      accentEnd: accent ?? BLUE,
      line: WHITE,
      lineOpacity: 0.18,
      tile: WHITE,
      tileFill: 0.04,
      tileBorder: 0.12,
      mark: { ink: WHITE, mid: BLUE, accent: ORANGE },
    };
  }
  const deepOrange = rgb(0.851, 0.373, 0);
  const deepBlue = rgb(0, 0.384, 0.839);
  return {
    ink: rgb(0.039, 0.039, 0.043),
    secondary: rgb(0.322, 0.322, 0.357), // zinc-600
    muted: rgb(0.443, 0.443, 0.478), // zinc-500
    accent: accent ?? deepOrange,
    accentEnd: accent ?? deepBlue,
    line: BLACK,
    lineOpacity: 0.2,
    tile: WHITE,
    tileFill: 0.6,
    tileBorder: 0.14,
    mark: { ink: rgb(0.039, 0.039, 0.043), mid: deepBlue, accent: deepOrange },
  };
}

/** `#rrggbb` as a pdf-lib colour, or undefined for anything else. */
export function hexColor(hex: string): RGB | undefined {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : undefined;
}

export interface CertificateFonts { sans: PDFFont; sansBold: PDFFont }

export async function embedCertificateFonts(doc: PDFDocument): Promise<CertificateFonts> {
  const [sans, sansBold] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);
  return { sans, sansBold };
}


/** What the content block says. Ranks of 0 mean "no rank" and are left out. */
export interface CertificateContent {
  name: string;
  finishTime: string;
  category: string;
  bib: string;
  /** The rank within the runner's category: what the result page calls Overall Rank. */
  overallRank: number;
  /** The rank within their gender in that category. */
  genderRank: number;
  /** The gender as the timing sheet gave it ("M", "Female", …). */
  gender: string;
  eventTitle: string;
  /** Day and place, each already formatted; empty ones are dropped. */
  eventDetails: string[];
}

const ordinal = (n: number) => {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}ST`;
  if (j === 2 && k !== 12) return `${n}ND`;
  if (j === 3 && k !== 13) return `${n}RD`;
  return `${n}TH`;
};

/**
 * The one rank tile: the runner's place in their gender division as the
 * figure, with their overall place (in the category) under it. Falls back to
 * the overall place alone when there is no gender rank, and to no tile at all
 * when the runner has neither.
 */
function rankFigure(content: CertificateContent) {
  const division = genderDivision(content.gender);
  const known = division === 'Male' || division === 'Female';
  if (content.genderRank > 0) {
    return {
      label: known ? `${division.toUpperCase()} RANK` : 'GENDER RANK',
      value: ordinal(content.genderRank),
      sub: content.overallRank > 0 ? `${ordinal(content.overallRank)} OVERALL` : undefined,
      accent: false,
    };
  }
  if (content.overallRank > 0) return { label: 'OVERALL RANK', value: ordinal(content.overallRank), accent: false };
  return null;
}

/** Text lines are this wide at full size: the default page less 90pt a side. */
const TEXT_WIDTH = 662;

interface Row {
  /** Height at full size, including the space down to the next row. */
  h: number;
  draw: (top: number, s: number) => void;
}

/**
 * Stacks the certificate's content between `top` and `bottom` (PDF y, so `top`
 * is the larger), centred on the page. At full size the stack is exactly the
 * default certificate's; it scales down to fit a smaller box, and up with a
 * page wider than the 842pt it was designed on, never past that.
 */
export function drawContentBlock(
  doc: PDFDocument, page: PDFPage,
  { fonts, theme, content, fields, top, bottom }: {
    fonts: CertificateFonts; theme: InkTheme; content: CertificateContent; fields: CertificateFields;
    top: number; bottom: number;
  },
) {
  const { sans, sansBold } = fonts;
  const cx = page.getWidth() / 2;
  const details = fields.eventDetails ? content.eventDetails.filter(Boolean) : [];
  const eventTitle = fields.eventTitle ? content.eventTitle.trim() : '';
  const rows: Row[] = [];

  if (fields.title) {
    rows.push({
      h: 111.5,
      draw: (t, s) => {
        drawCentered(page, 'CERTIFICATE', t - 36 * s, { font: sansBold, size: 50 * s, tracking: 10 * s, color: theme.ink });
        drawCentered(page, 'OF COMPLETION', t - 64 * s, { font: sansBold, size: 11 * s, tracking: 7 * s, color: theme.accent });
        brandBar(doc, page, cx - 60 * s, t - 86 * s, 120 * s, 2.5 * s, theme.accent, theme.accentEnd);
      },
    });
  }

  rows.push({
    h: 26.8,
    draw: (t, s) => drawCentered(page, 'THIS CERTIFIES THAT', t - 6.5 * s, {
      font: sans, size: 9 * s, tracking: 3.5 * s, color: theme.secondary,
    }),
  });

  rows.push({
    h: 69.2,
    draw: (t, s) => {
      const name = content.name.trim().toUpperCase();
      const style = fitted(name, TEXT_WIDTH * s, { font: sansBold, size: 44 * s, tracking: 1.5 * s, color: theme.ink }, 18 * s);
      drawCentered(page, name, t - 31.7 * s, style);
      const half = Math.max(460 * s, trackedWidth(name, sansBold, style.size, style.tracking) + 40 * s) / 2;
      page.drawLine({
        start: { x: cx - half, y: t - 49.7 * s }, end: { x: cx + half, y: t - 49.7 * s },
        thickness: 0.6 * s, color: theme.line, opacity: theme.lineOpacity,
      });
    },
  });

  rows.push({
    // With no event lines under it, it keeps the gap the tiles would have had.
    h: eventTitle || details.length ? 19.4 : 53,
    draw: (t, s) => drawCentered(page, 'HAS SUCCESSFULLY FINISHED', t - 6.5 * s, {
      font: sans, size: 9 * s, tracking: 3.5 * s, color: theme.secondary,
    }),
  });

  if (eventTitle) {
    rows.push({
      h: details.length ? 27.5 : 61,
      draw: (t, s) => {
        const title = eventTitle.toUpperCase();
        drawCentered(page, title, t - 15.1 * s, fitted(title, TEXT_WIDTH * s, { font: sansBold, size: 21 * s, tracking: 2 * s, color: theme.ink }, 11 * s));
      },
    });
  }

  if (details.length) {
    rows.push({
      h: 53.6,
      draw: (t, s) => {
        // Day and place, split by an accent dot the way the event hero pairs them.
        const y = t - 7.6 * s;
        const style = fitted(details.join('      '), TEXT_WIDTH * s, { font: sans, size: 10.5 * s, color: theme.muted }, 7 * s);
        const gap = 26 * (style.size / 10.5);
        const widths = details.map((d) => sans.widthOfTextAtSize(d, style.size));
        let x = cx - (widths.reduce((a, b) => a + b, 0) + gap * (details.length - 1)) / 2;
        details.forEach((d, i) => {
          if (i > 0) {
            page.drawCircle({ x: x + gap / 2, y: y + style.size * 0.35, size: 1.6 * (style.size / 10.5), color: theme.accent });
            x += gap;
          }
          drawTracked(page, d, x, y, style);
          x += widths[i];
        });
      },
    });
  }

  // The figures as tiles: finish time always, the rest as the fields allow.
  const bib = content.bib.trim();
  const figures: { label: string; value: string; sub?: string; accent: boolean }[] = [
    { label: 'FINISH TIME', value: content.finishTime, accent: true },
    ...(fields.category && content.category ? [{ label: 'CATEGORY', value: content.category.toUpperCase(), accent: false }] : []),
    ...(fields.bib && bib ? [{ label: 'BIB', value: bib, accent: false }] : []),
  ];
  const rank = fields.rank ? rankFigure(content) : null;
  if (rank) figures.push(rank);
  // A tile with a sub-line makes the whole row taller, so every tile keeps
  // the same label and value lines.
  const hasSub = figures.some((f) => f.sub);
  const tileHeight = hasSub ? 80 : 68;
  const valueLine = hasSub ? 27 : 17;
  rows.push({
    h: tileHeight,
    draw: (t, s) => {
      // Each tile is as wide as its value needs, so a long category like
      // "21KM HALF MARATHON" widens its own tile rather than shrinking below
      // the finish time beside it; all of them squeeze to fit the line.
      const valueSize = 22 * s;
      const padding = 44 * s;
      const tileGap = 14 * s;
      const minTile = (figures.length > 3 ? 118 : 150) * s;
      const natural = figures.map((f) => Math.max(minTile, sansBold.widthOfTextAtSize(f.value, valueSize) + padding));
      const room = TEXT_WIDTH * s - tileGap * (figures.length - 1);
      const squeeze = Math.min(1, room / natural.reduce((a, b) => a + b, 0));
      const tiles = natural.map((w) => w * squeeze);
      const tileH = tileHeight * s;
      const tileY = t - tileH;
      let x = cx - (tiles.reduce((a, b) => a + b, 0) + tileGap * (figures.length - 1)) / 2;
      figures.forEach((fig, i) => {
        const w = tiles[i];
        // Every tile gets the surface; the finish time's is then tinted with the accent.
        const tile = roundedRectPath(w, tileH, 12 * s);
        page.drawSvgPath(tile, { x, y: t, color: theme.tile, opacity: theme.tileFill });
        page.drawSvgPath(tile, {
          x, y: t,
          color: fig.accent ? theme.accent : undefined, opacity: 0.08,
          borderColor: fig.accent ? theme.accent : theme.line, borderWidth: 0.8 * s,
          borderOpacity: fig.accent ? 0.45 : theme.tileBorder,
        });
        const mid = x + w / 2;
        const label: TextStyle = { font: sansBold, size: 7.5 * s, tracking: 2.5 * s, color: fig.accent ? theme.accent : theme.secondary };
        drawTracked(page, fig.label, mid - trackedWidth(fig.label, label.font, label.size, label.tracking) / 2, tileY + (tileHeight - 22) * s, label);
        const value = fitted(fig.value, w - padding, { font: sansBold, size: valueSize, color: fig.accent ? theme.accent : theme.ink }, 10 * s);
        // A value that had to shrink is raised so its capitals share the row's centre line.
        const lift = (valueSize - value.size) * 0.36;
        drawTracked(page, fig.value, mid - trackedWidth(fig.value, sansBold, value.size) / 2, tileY + valueLine * s + lift, value);
        if (fig.sub) {
          const sub = fitted(fig.sub, w - padding / 2, { font: sans, size: 7.5 * s, tracking: 1.5 * s, color: theme.secondary }, 5 * s);
          drawTracked(page, fig.sub, mid - trackedWidth(fig.sub, sans, sub.size, sub.tracking) / 2, tileY + 12 * s, sub);
        }
        x += w + tileGap;
      });
    },
  });

  const total = rows.reduce((sum, r) => sum + r.h, 0);
  const s = Math.min(page.getWidth() / DESIGN_WIDTH, (top - bottom) / total);
  let y = (top + bottom) / 2 + (total * s) / 2;
  for (const row of rows) {
    row.draw(y, s);
    y -= row.h * s;
  }
}

/**
 * "E-CERTIFICATE BY [mark] RUN AS ONE", small, with its baseline at
 * `baseline` and, off-centre, `margin` in from the side it sits on.
 */
export function drawByline(
  page: PDFPage, fonts: CertificateFonts, theme: InkTheme,
  { position, baseline, margin }: { position: 'center' | 'left' | 'right'; baseline: number; margin: number },
) {
  const s = page.getWidth() / DESIGN_WIDTH;
  const by = 'E-CERTIFICATE BY';
  const brand = SITE_NAME.toUpperCase();
  const byStyle: TextStyle = { font: fonts.sans, size: 7.5 * s, tracking: 2 * s, color: theme.muted };
  const brandStyle: TextStyle = { font: fonts.sansBold, size: 8.5 * s, tracking: 2 * s, color: theme.ink };
  const markH = 13 * s;
  const gap = 6 * s;
  const byW = trackedWidth(by, byStyle.font, byStyle.size, byStyle.tracking);
  const brandW = trackedWidth(brand, brandStyle.font, brandStyle.size, brandStyle.tracking);
  const total = byW + gap + markWidth(markH) + gap + brandW;
  let x = position === 'left' ? margin
    : position === 'right' ? page.getWidth() - margin - total
      : (page.getWidth() - total) / 2;
  drawTracked(page, by, x, baseline, byStyle);
  x += byW + gap;
  drawMark(page, x, baseline + markH / 2 + 3 * s, markH, theme.mark);
  x += markWidth(markH) + gap;
  drawTracked(page, brand, x, baseline - 0.5 * s, brandStyle);
}
