import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { toWholeSeconds } from '@/lib/race-time';

/** What the certificate prints about the runner. */
export interface CertificateResult {
  name: string;
  chipTime: string;
  category: { name: string };
}

/** What the certificate takes from the event: its title and the organizer's template. */
export interface CertificateEvent {
  title?: string | null;
  certificateTemplate?: string | null;
  certificateCoordinates?: string | null;
}

/**
 * Draws one runner's e-certificate and returns the PDF's bytes. The organizer's
 * uploaded template is the page when there is one (a PDF, or a PNG/JPG laid on
 * an A4 landscape page); without one — or when it cannot be read — a plain
 * bordered certificate is drawn instead. The name, time and category go at the
 * heights the organizer set in the event form.
 *
 * Browser-only: it fetches the template. Callers load it with `import()` so a
 * page does not carry pdf-lib until someone actually asks for a certificate.
 */
export async function buildCertificatePdf(result: CertificateResult, event: CertificateEvent): Promise<Uint8Array> {
  let pdfDoc;
  const certUrl = event.certificateTemplate;

  if (certUrl) {
    try {
      const res = await fetch(certUrl);
      if (res.ok) {
        const bytes = await res.arrayBuffer();
        try {
          pdfDoc = await PDFDocument.load(bytes);
        } catch {
          // Try loading as image if PDF parsing fails
          pdfDoc = await PDFDocument.create();
          try {
            let image;
            if (certUrl.includes('.png') || certUrl.includes('image/png')) {
              image = await pdfDoc.embedPng(bytes);
            } else {
              image = await pdfDoc.embedJpg(bytes);
            }
            const page = pdfDoc.addPage([842, 595]); // Standard A4 Landscape
            page.drawImage(image, { x: 0, y: 0, width: 842, height: 595 });
          } catch (imageErr) {
            console.warn("Could not load template as PDF or Image", imageErr);
            pdfDoc = undefined;
          }
        }
      }
    } catch (e) {
      console.warn("Could not fetch template", e);
    }
  }

  let isFallback = false;
  if (!pdfDoc) {
    isFallback = true;
    pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([842, 595]); // A4 Landscape

    page.drawRectangle({
      x: 20, y: 20, width: 802, height: 555,
      borderColor: rgb(1, 0.42, 0), // accent-orange
      borderWidth: 4,
    });

    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const title = "CERTIFICATE OF COMPLETION";
    page.drawText(title, {
      x: (842 - titleFont.widthOfTextAtSize(title, 42)) / 2,
      y: 450,
      size: 42,
      font: titleFont,
      color: rgb(0, 0, 0),
    });

    const evTitle = event.title?.toUpperCase() || "RUNNING EVENT";
    page.drawText(evTitle, {
      x: (842 - titleFont.widthOfTextAtSize(evTitle, 24)) / 2,
      y: 390,
      size: 24,
      font: titleFont,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();

  const getY = (percentage: number) => height * (1 - (percentage / 100));

  let nameY = isFallback ? 280 : getY(50);
  let timeY = isFallback ? 220 : getY(60);
  let catY = isFallback ? 180 : getY(70);

  if (event.certificateCoordinates && !isFallback) {
    try {
      const coords = JSON.parse(event.certificateCoordinates);
      if (coords.nameY !== undefined) nameY = getY(Number(coords.nameY));
      if (coords.timeY !== undefined) timeY = getY(Number(coords.timeY));
      if (coords.catY !== undefined) catY = getY(Number(coords.catY));
    } catch {}
  }

  // Draw Name (Centered)
  const nameText = result.name.toUpperCase();
  // Shrink the name until it fits the certificate rather than drawing every
  // name at 36pt: a long one centred at a fixed size runs off both edges of
  // the page, and the runner has no way to fix it.
  const maxNameWidth = width * 0.8;
  let nameSize = 36;
  while (nameSize > 16 && font.widthOfTextAtSize(nameText, nameSize) > maxNameWidth) {
    nameSize -= 1;
  }
  const nameWidth = font.widthOfTextAtSize(nameText, nameSize);
  firstPage.drawText(nameText, {
    x: (width - nameWidth) / 2,
    y: nameY,
    size: nameSize,
    font: font,
    color: rgb(0, 0, 0),
  });

  // Draw Time
  const timeText = `FINISH TIME: ${toWholeSeconds(result.chipTime)}`;
  const timeSize = 18;
  const timeWidth = fontRegular.widthOfTextAtSize(timeText, timeSize);
  firstPage.drawText(timeText, {
    x: (width - timeWidth) / 2,
    y: timeY,
    size: timeSize,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Draw Category
  const catText = `CATEGORY: ${result.category.name}`;
  const catSize = 14;
  const catWidth = fontRegular.widthOfTextAtSize(catText, catSize);
  firstPage.drawText(catText, {
    x: (width - catWidth) / 2,
    y: catY,
    size: catSize,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  return pdfDoc.save();
}
