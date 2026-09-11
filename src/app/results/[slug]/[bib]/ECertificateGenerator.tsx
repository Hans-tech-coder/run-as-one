'use client';

import React, { useState, useEffect } from 'react';
import { Download, Share2, FileText, X, CheckCircle2 } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { useSearchParams } from 'next/navigation';
import { useAlert } from '@/components/ui/AlertProvider';
import { toWholeSeconds } from '@/lib/race-time';
import RunnerLoader from '@/components/ui/RunnerLoader';

interface Props {
  result: any;
  event: any;
}

export default function ECertificateGenerator({ result, event }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const searchParams = useSearchParams();
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert, toast } = useAlert();

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

      // Serialize the PDFDocument to bytes (a Uint8Array)
      const pdfBytes = await pdfDoc.save();

      // Create blob URL for preview
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setPdfUrl(url);
      
    } catch (error) {
      console.error('Error generating certificate:', error);
      alert({
        title: 'Certificate Unavailable',
        message: 'Could not generate the certificate. The organizer might not have uploaded a valid template yet.',
      });
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
    const url = window.location.href.split('?')[0];
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${result.name} - Certificate of Completion`,
          text: `Check out my race result for ${event.title}!`,
          url,
        });
        return;
      }
      // No share sheet (most desktop browsers): copying the link is the same
      // outcome in one step, where the old dialog told the runner to go and
      // copy it themselves.
      await navigator.clipboard.writeText(url);
      toast({ variant: 'success', title: 'Link copied', message: 'Your result link is ready to paste.' });
    } catch (error) {
      // A dismissed share sheet rejects too; that is the runner changing
      // their mind, not a failure worth a dialog.
      if ((error as DOMException)?.name === 'AbortError') return;
      alert({
        variant: 'info',
        title: 'Sharing Unavailable',
        message: `Sharing is not supported on this browser. Copy this link instead: ${url}`,
      });
    }
  };

  const closeModal = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
  };

  // A PDF in an iframe renders only where the browser has a built-in viewer
  // *and* the page can drive it. Chrome on Android has none and paints an
  // empty grey box; Safari on an iPhone shows the page at its print size,
  // cropped to the corner. So the inline preview is kept for a mouse-driven
  // browser that reports a viewer, and a phone gets a summary of what the
  // certificate says with the download — which opens the phone's own viewer —
  // as the way to see it.
  // Read when the modal opens rather than on mount — it is only ever needed
  // then, and the modal cannot open before the page is in the browser.
  const canPreviewInline = () =>
    navigator.pdfViewerEnabled === true &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  useEffect(() => {
    if (!pdfUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [pdfUrl]);

  return (
    <>
      <button
        onClick={generateCertificate}
        disabled={isGenerating}
        className="btn-gradient w-full sm:w-fit sm:min-w-[20rem] sm:px-10 mx-auto py-4 text-base sm:text-lg flex items-center justify-center gap-3 mt-6 sm:mt-8 shadow-lg shadow-accent-blue/20 rounded-[16px] group"
      >
        {isGenerating ? (
          <>
            <RunnerLoader size="sm" tone="current" label="" />
            Generating E-Certificate...
          </>
        ) : (
          <>
            <FileText size={22} className="group-hover:scale-110 transition-transform" />
            View E-Certificate
          </>
        )}
      </button>

      {/* Modal Overlay. A bottom sheet on a phone, where the thumb already
          is; a centred dialog from sm up. */}
      {pdfUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ecert-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={closeModal}
          ></div>

          {/* Modal Content */}
          <div className="relative w-full max-w-4xl rounded-t-[24px] sm:rounded-[24px] bg-dark border border-white/10 border-b-0 sm:border-b shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[85dvh] animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 sm:p-5 border-b border-white/[0.05] bg-black/40">
              <h3 id="ecert-title" className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 min-w-0">
                <FileText className="text-accent-blue shrink-0" size={20} /> <span className="truncate">Official E-Certificate</span>
              </h3>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close certificate"
                className="w-10 h-10 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-secondary hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-4 md:p-6 bg-black/60 overflow-y-auto relative flex flex-col justify-center items-center min-h-0">
              {canPreviewInline() ? (
                <iframe
                  src={`${pdfUrl}#toolbar=0&navpanes=0&view=Fit`}
                  className="w-full aspect-[1.414] max-h-full rounded-lg shadow-xl bg-white relative z-10"
                  style={{ maxHeight: 'calc(85dvh - 180px)' }}
                  title="E-Certificate Preview"
                />
              ) : (
                <div className="w-full rounded-[18px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] px-5 py-7 text-center">
                  <div className="mx-auto mb-4 w-12 h-12 rounded-[14px] bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-accent-blue">
                    <CheckCircle2 size={24} />
                  </div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-secondary font-bold mb-2">Certificate of Completion</p>
                  <p className="text-xl font-black text-white uppercase leading-tight text-balance break-words">{result.name}</p>
                  <p className="mt-3 font-mono text-2xl font-bold text-accent-orange tabular-nums">{toWholeSeconds(result.chipTime)}</p>
                  <p className="mt-1 text-sm text-secondary break-words">{result.category.name} · {event.title}</p>
                  <p className="mt-5 text-xs text-secondary/80 leading-relaxed text-balance">
                    Your certificate is ready. Download the PDF to open it in full and save it to your phone.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer (Actions) */}
            <div className="p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 border-t border-white/[0.05] bg-black/40 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleDownload}
                className="btn-gradient flex-1 py-3.5 rounded-[16px] text-white font-bold flex items-center justify-center gap-2"
              >
                <Download size={20} /> Download PDF
              </button>
              <button
                type="button"
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
