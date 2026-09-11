'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, Share2, FileText, X, CheckCircle2 } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import { toWholeSeconds } from '@/lib/race-time';
import type { CertificateEvent, CertificateResult } from '@/lib/e-certificate';

interface OpenCertificate<R extends CertificateResult> {
  result: R;
  pdfUrl: string;
  /** Where Share Result points: the runner's own result page. */
  sharePath: string;
}

/**
 * Generating a runner's certificate and holding it open. Both screens that
 * offer the certificate use it — the runner's own result, and the Actions menu
 * on the full leaderboard, which opens it in place rather than navigating to
 * the runner's page first. `generating` is the result being drawn, so the
 * caller can show where the wait is.
 */
export function useECertificate<R extends CertificateResult>(event: CertificateEvent) {
  const [open, setOpen] = useState<OpenCertificate<R> | null>(null);
  const [generating, setGenerating] = useState<R | null>(null);
  const busy = useRef(false);
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();

  const show = useCallback(async (result: R, sharePath: string) => {
    if (busy.current) return;
    busy.current = true;
    setGenerating(result);
    try {
      // pdf-lib is loaded on the first certificate, not with the page.
      const { buildCertificatePdf } = await import('@/lib/e-certificate');
      const bytes = await buildCertificatePdf(result, event);
      const pdfUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      setOpen({ result, pdfUrl, sharePath });
    } catch (error) {
      console.error('Error generating certificate:', error);
      alert({
        title: 'Certificate Unavailable',
        message: 'Could not generate the certificate. The organizer might not have uploaded a valid template yet.',
      });
    } finally {
      busy.current = false;
      setGenerating(null);
    }
  }, [event, alert]);

  const close = useCallback(() => {
    setOpen((current) => {
      if (current) URL.revokeObjectURL(current.pdfUrl);
      return null;
    });
  }, []);

  return { open, generating, show, close };
}

interface ModalProps {
  result: CertificateResult;
  event: CertificateEvent;
  pdfUrl: string;
  sharePath: string;
  onClose: () => void;
}

/**
 * The certificate itself. A bottom sheet on a phone, where the thumb already
 * is; a centred dialog from sm up. Rendered into <body>, so no transformed or
 * clipping ancestor can move it, and no row it was opened from receives its
 * clicks.
 */
export function ECertificateModal({ result, event, pdfUrl, sharePath, onClose }: ModalProps) {
  const { alert, toast } = useAlert();

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `${result.name.replace(/\s+/g, '_')}_Certificate.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    const url = new URL(sharePath, window.location.origin).href;
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

  // A PDF in an iframe renders only where the browser has a built-in viewer
  // *and* the page can drive it. Chrome on Android has none and paints an
  // empty grey box; Safari on an iPhone shows the page at its print size,
  // cropped to the corner. So the inline preview is kept for a mouse-driven
  // browser that reports a viewer, and a phone gets a summary of what the
  // certificate says with the download — which opens the phone's own viewer —
  // as the way to see it.
  const canPreviewInline =
    navigator.pdfViewerEnabled === true &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ecert-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
        onClick={onClose}
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
            onClick={onClose}
            aria-label="Close certificate"
            className="w-10 h-10 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-secondary hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-4 md:p-6 bg-black/60 overflow-y-auto relative flex flex-col justify-center items-center min-h-0">
          {canPreviewInline ? (
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
    </div>,
    document.body
  );
}
