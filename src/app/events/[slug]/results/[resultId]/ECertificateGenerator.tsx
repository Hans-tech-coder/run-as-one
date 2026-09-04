'use client';

import React, { useState, useEffect } from 'react';
import { Download, Loader2, Share2, FileText } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { useSearchParams } from 'next/navigation';

interface Props {
  result: any;
  event: any;
}

export default function ECertificateGenerator({ result, event }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const searchParams = useSearchParams();

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

      // Create blob URL for preview
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setPdfUrl(url);
      
    } catch (error) {
      console.error('Error generating certificate:', error);
      alert('Could not generate the certificate. The organizer might not have uploaded a valid template yet.');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('cert') === '1' && !pdfUrl && !isGenerating) {
      generateCertificate();
    }
  }, [searchParams]);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `${result.name.replace(/\s+/g, '_')}_Certificate.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    if (!pdfUrl) return;
    try {
      // In a real app we might generate a public image URL or use Web Share API with files
      // Here we will just use basic navigator.share if available with the current URL
      if (navigator.share) {
        await navigator.share({
          title: `${result.name} - Certificate of Completion`,
          text: `Check out my race result for ${event.title}!`,
          url: window.location.href,
        });
      } else {
        alert("Sharing is not supported on this browser. Try copying the URL.");
      }
    } catch (error) {
      console.log('Error sharing', error);
    }
  };

  return (
    <>
      <button 
        onClick={generateCertificate}
        disabled={isGenerating}
        className="btn-gradient w-full py-4 text-lg flex items-center justify-center gap-3 mt-8 shadow-lg shadow-accent-blue/20 rounded-[16px] group"
      >
        {isGenerating ? (
          <>
            <Loader2 className="animate-spin" size={24} />
            Generating E-Certificate...
          </>
        ) : (
          <>
            <FileText size={24} className="group-hover:scale-110 transition-transform" />
            View E-Certificate
          </>
        )}
      </button>

      {/* Modal Overlay */}
      {pdfUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={() => setPdfUrl(null)}
          ></div>
          
          {/* Modal Content */}
          <div className="relative w-full max-w-4xl rounded-[24px] bg-dark border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/[0.05] bg-black/40">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="text-accent-blue" size={20} /> Official E-Certificate
              </h3>
              <button 
                onClick={() => setPdfUrl(null)}
                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-secondary hover:text-white hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
            
            {/* Modal Body (Iframe) */}
            <div className="flex-1 p-4 md:p-6 bg-black/60 overflow-hidden relative flex flex-col justify-center items-center min-h-0">
              <iframe 
                src={`${pdfUrl}#toolbar=0`} 
                className="w-full aspect-[1.414] max-h-full rounded-lg shadow-xl bg-white relative z-10"
                style={{ maxHeight: 'calc(85vh - 180px)' }}
                title="E-Certificate Preview"
              />
            </div>
            
            {/* Modal Footer (Actions) */}
            <div className="p-5 border-t border-white/[0.05] bg-black/40 flex flex-col sm:flex-row gap-3">
              <button 
                onClick={handleDownload}
                className="btn-gradient flex-1 py-3.5 rounded-[16px] text-white font-bold flex items-center justify-center gap-2"
              >
                <Download size={20} /> Download PDF
              </button>
              <button 
                onClick={handleShare}
                className="flex-1 py-3.5 rounded-[16px] bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold flex items-center justify-center gap-2 transition-all duration-300"
              >
                <Share2 size={20} /> Share Result
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
