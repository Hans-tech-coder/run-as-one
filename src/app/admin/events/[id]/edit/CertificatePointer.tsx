import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * The edit form's E-Certificate panel, which only points away: the
 * certificate has one home, the race's results workspace (RESULTS_NAV_PLAN.md,
 * Batch 2), so two screens never edit the same setting. The form no longer
 * sends it, and its PUT keeps what is stored. Split out of `page.tsx`, which
 * was on the split-candidates list.
 */
export default function CertificatePointer({ eventId }: { eventId: string }) {
  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">E-Certificate</h2>
        <Link href={`/admin/results/${eventId}`} className="btn-filter no-underline max-sm:min-h-11">
          Open in Results <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className="admin-panel-content">
        <p className="text-sm opacity-70 m-0">
          The certificate template and layout are set in this race&apos;s results workspace, beside its results.
        </p>
      </div>
    </div>
  );
}
