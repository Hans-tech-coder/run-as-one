'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, Share2, FileText, X, CheckCircle2 } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import RunnerLoader from '@/components/ui/RunnerLoader';
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

/** Set once a preview has painted in this visit: the PDF viewer is started. */
let viewerWarm = false;

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

  // The browser's PDF viewer paints inside the iframe a second or more after
  // the iframe reports `load` (measured: `load` at ~90ms, the page visible at
  // ~2–3s on a cold viewer), and until then the frame is a blank grey box that
  // reads as broken. Nothing the page can listen to says the viewer has
  // painted, so the runner figure covers the frame until it has loaded *and*
  // a floor has passed: long on the first preview of the visit, while the
  // viewer starts up, short once it is warm.
  const [loaded, setLoaded] = useState(false);
  const [floorPassed, setFloorPassed] = useState(false);
  useEffect(() => {
    const floor = window.setTimeout(() => setFloorPassed(true), viewerWarm ? 400 : 2800);
    return () => window.clearTimeout(floor);
  }, [pdfUrl]);
  const previewReady = loaded && floorPassed;
  useEffect(() => {
    if (previewReady) viewerWarm = true;
  }, [previewReady]);

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

  // Paper (site.css, "Paper on portals"): `.site-portal` gives this its
  // tokens though it renders outside the frame. Both screens that open it are
  // public pages.
  return createPortal(
    <div
      className="site-portal fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ecert-title"
    >
      <div className="site-scrim" onClick={onClose}></div>

      <div className="site-modal max-w-4xl max-h-[92dvh] sm:max-h-[85dvh] animate-scale-in">
        <div className="site-modal__head">
          <h3 id="ecert-title" className="site-modal__title flex items-center gap-2.5">
            <FileText className="text-site-accent shrink-0" size={20} aria-hidden="true" />
            <span className="truncate">Your e-certificate</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="Close certificate" className="site-modal__close">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-site-surface p-4 md:p-6 flex flex-col justify-center items-center">
          {canPreviewInline ? (
            // Sized by the room's height so the page fills the frame: an
            // iframe wider than the page shows the PDF viewer's own grey
            // either side, which no page style can reach.
            <div
              className="relative aspect-[1.414]"
              style={{ width: 'min(100%, calc((85dvh - 220px) * 1.414))' }}
            >
              <iframe
                src={`${pdfUrl}#toolbar=0&navpanes=0&view=Fit`}
                onLoad={() => setLoaded(true)}
                className="block h-full w-full rounded-[6px] border border-site-line bg-site-card"
                title="E-certificate preview"
                aria-busy={!previewReady}
              />
              {!previewReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[6px] border border-site-line bg-site-card px-6 text-center">
                  <RunnerLoader
                    size="lg"
                    caption="Preparing your certificate"
                    slowCaption="Almost there, the preview is still loading"
                  />
                  <p className="max-w-[28rem] text-sm text-site-muted text-balance">
                    You can already download the PDF while the preview loads.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full rounded-[12px] border border-site-line bg-site-card px-5 py-7 text-center">
              <CheckCircle2 size={28} className="mx-auto mb-3 text-[var(--status-success)]" aria-hidden="true" />
              <p className="text-sm font-semibold text-site-muted mb-2">Certificate of completion</p>
              <p className="site-modal__title text-[1.375rem] text-balance break-words">{result.name}</p>
              <p className="mt-3 font-mono text-2xl font-bold text-site-ink tabular-nums">{toWholeSeconds(result.chipTime)}</p>
              <p className="mt-1 text-sm text-site-muted break-words">{result.category.name} · {event.title}</p>
              <p className="mt-5 text-sm text-site-muted leading-relaxed text-balance">
                Your certificate is ready. Download the PDF to open it in full and save it to your phone.
              </p>
            </div>
          )}
        </div>

        <div className="site-modal__foot">
          <button type="button" onClick={handleDownload} className="site-btn site-btn--action w-full sm:w-auto">
            <Download size={18} aria-hidden="true" /> Download PDF
          </button>
          <button type="button" onClick={handleShare} className="site-btn site-btn--quiet w-full sm:w-auto">
            <Share2 size={18} aria-hidden="true" /> Share result
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
