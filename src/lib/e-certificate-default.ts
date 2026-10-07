/**
 * Run As One's own e-certificate, drawn when an event has no organizer
 * template: the site's dark look, the orange→blue gradient, and the small
 * "e-certificate by Run As One" byline that marks where it came from.
 */
import { PDFDocument, rgb } from 'pdf-lib';
import { DEFAULT_FIELDS } from '@/lib/certificate-settings';
import {
  drawByline, drawContentBlock, embedCertificateFonts, inkTheme, type CertificateContent,
} from '@/lib/e-certificate-layout';
import { BLUE, brandBar, drawMark, glow, markWidth, ORANGE, roundedRectPath } from '@/lib/e-certificate-draw';
import { SITE_NAME } from '@/lib/site-contact';

const GROUND = rgb(0.0196, 0.0196, 0.0196); // --bg-dark #050505
const A4_LANDSCAPE: [number, number] = [842, 595];

/**
 * What our own certificate shows: the template defaults plus the rank tile,
 * which a runner is proud of and the default has the width for. A runner with
 * no rank simply gets no rank tile.
 */
const DEFAULT_CERTIFICATE_FIELDS = { ...DEFAULT_FIELDS, rank: true };

/**
 * A4 landscape in the site's look: the near-black ground with an orange glow
 * in one corner and a blue one in the other, the mark as a large faint
 * watermark running off the right edge, a hairline rounded frame and the
 * orange→blue band along the foot. The content block (`e-certificate-layout`)
 * sits on top at full size, with the byline under it.
 */
export async function drawDefaultCertificate(content: CertificateContent): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Certificate of Completion — ${content.name}`);
  pdfDoc.setAuthor(SITE_NAME);
  pdfDoc.setCreator(SITE_NAME);
  const page = pdfDoc.addPage(A4_LANDSCAPE);
  const [width, height] = A4_LANDSCAPE;
  const fonts = await embedCertificateFonts(pdfDoc);
  const theme = inkTheme('light');

  // Ground, light, watermark, frame.
  page.drawRectangle({ x: 0, y: 0, width, height, color: GROUND });
  glow(pdfDoc, page, 60, height + 40, 520, ORANGE, 0.34);
  glow(pdfDoc, page, width - 40, -60, 560, BLUE, 0.38);
  const watermarkH = 380;
  drawMark(page, width - markWidth(watermarkH) * 0.6, height - 90, watermarkH, theme.mark, 0.04);
  const frame = 20;
  page.drawSvgPath(roundedRectPath(width - frame * 2, height - frame * 2, 18), {
    x: frame, y: height - frame, borderColor: theme.ink, borderWidth: 0.8, borderOpacity: 0.14,
  });
  brandBar(pdfDoc, page, 0, 0, width, 5);

  drawContentBlock(pdfDoc, page, { fonts, theme, content, fields: DEFAULT_CERTIFICATE_FIELDS, top: 488, bottom: 112 });
  drawByline(page, fonts, theme, { position: 'center', baseline: 52, margin: 0 });

  return pdfDoc.save();
}
