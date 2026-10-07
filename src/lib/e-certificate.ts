/**
 * A runner's e-certificate as a PDF: the organizer's template when there is
 * one — in the designed layout or the legacy three lines, per
 * `certificate-settings.ts` — otherwise Run As One's own design.
 */
import { PDFDocument, rgb, StandardFonts, type PDFPage } from 'pdf-lib';
import { parseCertificateSettings, type DesignedCertificateSettings, type LegacyCertificateSettings } from '@/lib/certificate-settings';
import { drawDefaultCertificate } from '@/lib/e-certificate-default';
import {
  drawByline, drawContentBlock, embedCertificateFonts, hexColor, inkTheme, type CertificateContent,
} from '@/lib/e-certificate-layout';
import { formatEventDay } from '@/lib/event-schedule';
import { toWholeSeconds } from '@/lib/race-time';
import { SITE_NAME } from '@/lib/site-contact';

/** What the certificate prints about the runner. */
export interface CertificateResult {
  name: string;
  chipTime: string;
  bibNumber?: string | null;
  categoryRank?: number | null;
  genderRank?: number | null;
  gender?: string | null;
  category: { name: string };
}

/** What the certificate takes from the event: its details and the organizer's template. */
export interface CertificateEvent {
  title?: string | null;
  date?: string | null;
  location?: string | null;
  certificateTemplate?: string | null;
  certificateCoordinates?: string | null;
}

/** The long side of an image template's page, in points — A4's, so type sizes match the default. */
const PAGE_LONG_SIDE = 842;

function contentFor(result: CertificateResult, event: CertificateEvent): CertificateContent {
  return {
    name: result.name,
    finishTime: toWholeSeconds(result.chipTime),
    category: result.category.name,
    bib: result.bibNumber ?? '',
    overallRank: result.categoryRank ?? 0,
    genderRank: result.genderRank ?? 0,
    gender: result.gender ?? '',
    eventTitle: event.title?.trim() || 'Running Event',
    eventDetails: [event.date ? formatEventDay(event.date) : '', event.location?.trim() ?? ''],
  };
}

interface Template {
  doc: PDFDocument;
  /** The image's bytes and type, kept so its tone can be sampled; null for a PDF. */
  image: { bytes: ArrayBuffer; type: string } | null;
}

const isPng = (bytes: ArrayBuffer) => {
  const b = new Uint8Array(bytes, 0, 4);
  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
};

/**
 * Fetches the organizer's template. A PDF is used as it is; a PNG or JPG
 * becomes a page of **its own proportions** (842pt on the long side), so a
 * Letter-size or square design is never stretched to A4. Null when there is
 * no template or it cannot be read.
 */
async function loadTemplate(url: string | null | undefined): Promise<Template | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    try {
      return { doc: await PDFDocument.load(bytes), image: null };
    } catch {
      const doc = await PDFDocument.create();
      const png = isPng(bytes);
      const image = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const landscape = image.width >= image.height;
      const width = landscape ? PAGE_LONG_SIDE : PAGE_LONG_SIDE * (image.width / image.height);
      const height = landscape ? PAGE_LONG_SIDE * (image.height / image.width) : PAGE_LONG_SIDE;
      doc.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
      return { doc, image: { bytes, type: png ? 'image/png' : 'image/jpeg' } };
    }
  } catch (e) {
    console.warn('Could not load the certificate template', e);
    return null;
  }
}

/**
 * How light each region of an image is, 0 (black) to 1 (white), as the mean
 * luminance of a small downscaled copy. Regions are percentages of the image:
 * `[top, bottom, left, right]`. Null where it cannot be measured — a PDF
 * template, or a runtime with no canvas.
 */
async function sampleLightness(
  image: Template['image'], regions: [number, number, number, number][],
): Promise<(number | null)[]> {
  const none = regions.map(() => null);
  if (!image || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') return none;
  try {
    const bitmap = await createImageBitmap(new Blob([image.bytes], { type: image.type }));
    const w = 96;
    const h = Math.max(1, Math.round((w * bitmap.height) / bitmap.width));
    const ctx = new OffscreenCanvas(w, h).getContext('2d');
    if (!ctx) return none;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return regions.map(([top, bottom, left, right]) => {
      let sum = 0;
      let count = 0;
      for (let y = Math.floor((top / 100) * h); y < Math.ceil((bottom / 100) * h); y++) {
        for (let x = Math.floor((left / 100) * w); x < Math.ceil((right / 100) * w); x++) {
          const i = (y * w + x) * 4;
          sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
          count++;
        }
      }
      return count ? sum / count : null;
    });
  } catch {
    return none;
  }
}

/** Dark ink on a light ground, light ink on a dark one; dark when unknown. */
const inkFor = (lightness: number | null) => (lightness === null || lightness > 0.5 ? 'dark' : 'light');

/**
 * The designed layout: the default certificate's content block inside the
 * organizer's content area, in their accent, and the byline at the foot. With
 * `ink: 'auto'` the block and the byline each take the ink that reads on the
 * part of the artwork under them.
 */
async function drawDesigned(template: Template, settings: DesignedCertificateSettings, content: CertificateContent) {
  const { doc } = template;
  const page = doc.getPages()[0];
  const { width, height } = page.getSize();
  const fonts = await embedCertificateFonts(doc);

  const bylineCols: Record<DesignedCertificateSettings['byline'], [number, number]> = {
    center: [30, 70], left: [3, 35], right: [65, 97],
  };
  const [blockLight, bylineLight] = settings.ink === 'auto'
    ? await sampleLightness(template.image, [
      [settings.top, settings.bottom, 15, 85],
      [Math.max(0, 97 - settings.bylineBottom), Math.min(100, 101 - settings.bylineBottom), ...bylineCols[settings.byline]],
    ])
    : [null, null];
  const accent = hexColor(settings.accent);
  const blockInk = settings.ink === 'auto' ? inkFor(blockLight) : settings.ink;
  const bylineInk = settings.ink === 'auto' ? inkFor(bylineLight) : settings.ink;

  drawContentBlock(doc, page, {
    fonts, theme: inkTheme(blockInk, accent), content, fields: settings.fields,
    top: height * (1 - settings.top / 100), bottom: height * (1 - settings.bottom / 100),
  });
  drawByline(page, fonts, inkTheme(bylineInk, accent), {
    position: settings.byline, baseline: height * (settings.bylineBottom / 100), margin: width * 0.045,
  });
}

/**
 * The original layout, kept for every event saved before the designed one:
 * the name, time and category as three centred lines at the heights the
 * organizer set, in fixed black and greys.
 */
async function drawLegacy(page: PDFPage, doc: PDFDocument, settings: LegacyCertificateSettings, content: CertificateContent, category: string) {
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const { width, height } = page.getSize();
  const getY = (percentage: number) => height * (1 - percentage / 100);

  // Shrink the name until it fits the certificate rather than drawing every
  // name at 36pt: a long one centred at a fixed size runs off both edges of
  // the page, and the runner has no way to fix it.
  const nameText = content.name.toUpperCase();
  let nameSize = 36;
  while (nameSize > 16 && font.widthOfTextAtSize(nameText, nameSize) > width * 0.8) nameSize -= 1;

  const lines = [
    { text: nameText, size: nameSize, font, color: rgb(0, 0, 0), y: getY(settings.nameY) },
    { text: `FINISH TIME: ${content.finishTime}`, size: 18, font: fontRegular, color: rgb(0.2, 0.2, 0.2), y: getY(settings.timeY) },
    { text: `CATEGORY: ${category}`, size: 14, font: fontRegular, color: rgb(0.3, 0.3, 0.3), y: getY(settings.catY) },
  ];
  for (const line of lines) {
    page.drawText(line.text, {
      x: (width - line.font.widthOfTextAtSize(line.text, line.size)) / 2,
      y: line.y, size: line.size, font: line.font, color: line.color,
    });
  }
}

/**
 * Draws one runner's e-certificate and returns the PDF's bytes: on the
 * organizer's template when there is a readable one, otherwise Run As One's
 * own certificate (`e-certificate-default.ts`).
 *
 * Browser-only: it fetches the template. Callers load it with `import()` so a
 * page does not carry pdf-lib until someone actually asks for a certificate.
 */
export async function buildCertificatePdf(result: CertificateResult, event: CertificateEvent): Promise<Uint8Array> {
  const content = contentFor(result, event);
  const template = await loadTemplate(event.certificateTemplate);
  if (!template) return drawDefaultCertificate(content);

  const settings = parseCertificateSettings(event.certificateCoordinates);
  if (settings.v === 2) {
    await drawDesigned(template, settings, content);
  } else {
    await drawLegacy(template.doc.getPages()[0], template.doc, settings, content, result.category.name);
  }
  template.doc.setTitle(`Certificate of Completion — ${result.name}`);
  template.doc.setCreator(SITE_NAME);
  return template.doc.save();
}
