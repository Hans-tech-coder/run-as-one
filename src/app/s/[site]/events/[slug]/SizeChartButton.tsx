'use client';

import { useState } from 'react';
import { Ruler } from 'lucide-react';
import ZoomLightbox from '@/components/ui/ZoomLightbox';

/**
 * The organizer's shirt size chart, opened full screen with zoom before the
 * runner registers — the same viewer the wizard's size guide uses, so the
 * supplier's small print can be read on a phone. Shown only when the event
 * uploaded its own chart; the default chart lives in the wizard.
 */
export default function SizeChartButton({ imageUrl }: { imageUrl: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="site-link site-link--arrow text-[0.9375rem]"
      >
        <Ruler size={16} aria-hidden="true" /> <span>See the size chart</span>
      </button>
      {open && (
        <ZoomLightbox
          images={[{ url: imageUrl, caption: 'Size Chart' }]}
          index={0}
          onIndexChange={() => {}}
          onClose={() => setOpen(false)}
          label="Size chart"
        />
      )}
    </>
  );
}
