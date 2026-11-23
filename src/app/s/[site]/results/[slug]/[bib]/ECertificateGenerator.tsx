'use client';

import React, { useEffect } from 'react';
import { FileText } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ECertificateModal, useECertificate } from '@/components/ECertificate';
import BusyLabel from '@/components/ui/BusyLabel';

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
      {/* A wrapper centres it: `.site-btn` is inline-flex, so mx-auto alone
          would leave it on the left. */}
      <div className="mt-6 sm:mt-8 text-center">
        <button
          onClick={generateCertificate}
          disabled={isGenerating}
          className="site-btn site-btn--action w-full sm:w-fit sm:min-w-[20rem]"
        >
          {isGenerating ? (
            <BusyLabel>Generating E-Certificate</BusyLabel>
          ) : (
            <>
              <FileText size={20} aria-hidden="true" />
              View E-Certificate
            </>
          )}
        </button>
      </div>

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
