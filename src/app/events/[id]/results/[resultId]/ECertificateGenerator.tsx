'use client';

import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface Props {
  result: any;
  event: any;
}

export default function ECertificateGenerator({ result, event }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateCertificate = async () => {
    setIsGenerating(true);
    try {
      let pdfDoc;
      const certUrl = event.certificateTemplate;
      
      if (certUrl) {
        try {
          const res = await fetch(certUrl);
          if (res.ok) {
            const bytes = await res.arrayBuffer();
            try {
              pdfDoc = await PDFDocument.load(bytes);
            } catch (e) {
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
        } catch (e) {}
      }

      // Draw Name (Centered)
      const nameText = result.name.toUpperCase();
      const nameSize = 36;
      const nameWidth = font.widthOfTextAtSize(nameText, nameSize);
      firstPage.drawText(nameText, {
        x: (width - nameWidth) / 2,
        y: nameY,
        size: nameSize,
        font: font,
        color: rgb(0, 0, 0),
      });

      // Draw Time
      const timeText = `FINISH TIME: ${result.chipTime}`;
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

      // Serialize the PDFDocument to bytes (a Uint8Array)
      const pdfBytes = await pdfDoc.save();

      // Trigger the browser to download the PDF document
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${result.name.replace(/\s+/g, '_')}_Certificate.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error generating certificate:', error);
      alert('Could not generate the certificate. The organizer might not have uploaded a valid template yet.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button 
      onClick={generateCertificate}
      disabled={isGenerating}
      className="btn-gradient w-full py-4 text-lg flex items-center justify-center gap-3 mt-8 shadow-lg shadow-accent-blue/20"
    >
      {isGenerating ? (
        <>
          <Loader2 className="animate-spin" size={24} />
          Generating...
        </>
      ) : (
        <>
          <Download size={24} />
          Download E-Certificate
        </>
      )}
    </button>
  );
}
