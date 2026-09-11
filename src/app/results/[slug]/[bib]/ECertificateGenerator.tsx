'use client';

import React, { useEffect } from 'react';
import { FileText } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import RunnerLoader from '@/components/ui/RunnerLoader';
import { ECertificateModal, useECertificate } from '@/components/ECertificate';

interface Props {
  result: any;
  event: any;
}

// The drawing lives in lib/e-certificate.ts and the dialog in
// components/ECertificate.tsx, shared with the full leaderboard's Actions menu.
export default function ECertificateGenerator({ result, event }: Props) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const cert = useECertificate(event);
  const isGenerating = cert.generating !== null;

  const generateCertificate = () => cert.show(result, pathname);

  useEffect(() => {
    if (searchParams.get('cert') === '1' && !cert.open && !isGenerating) {
      generateCertificate();
    }
  }, [searchParams]);

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

      {cert.open && (
        <ECertificateModal
          result={cert.open.result}
          event={event}
          pdfUrl={cert.open.pdfUrl}
          sharePath={cert.open.sharePath}
          onClose={cert.close}
        />
      )}
    </>
  );
}
