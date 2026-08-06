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
      // 1. Fetch the blank certificate PDF
      // If the organizer hasn't uploaded one, we could use a fallback, but for now we expect a URL
      const certUrl = event.certificateTemplate || '/default-certificate.pdf'; 
      
      const existingPdfBytes = await fetch(certUrl).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();
      
      // We assume some default coordinates for the text if the organizer didn't specify
      // In a full implementation, we'd parse event.certificateCoordinates
      let nameY = height / 2;
      let timeY = height / 2 - 60;
      let catY = height / 2 - 100;
      
      if (event.certificateCoordinates) {
        try {
          const coords = JSON.parse(event.certificateCoordinates);
          if (coords.nameY) nameY = coords.nameY;
          if (coords.timeY) timeY = coords.timeY;
          if (coords.catY) catY = coords.catY;
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
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
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
