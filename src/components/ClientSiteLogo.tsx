import React from 'react';
import type { SiteClient } from '@/lib/site-client';

/**
 * A client's logo on its own site (CLIENT_SUBDOMAIN_PLAN.md D2, D9), where Run
 * As One's lockup would otherwise sit. The uploaded image when there is one,
 * its name as a wordmark when not, so a site set up before its logo is still
 * plainly that client's. Logos come in every shape, so the image is held to a
 * height and a maximum width and keeps its own proportions.
 */
export function ClientSiteLogo({
  site,
  size = 'nav',
}: {
  site: Pick<SiteClient, 'name' | 'logoUrl'>;
  size?: 'nav' | 'footer';
}) {
  if (site.logoUrl) {
    const box =
      size === 'nav'
        ? 'h-9 sm:h-11 max-w-[160px] sm:max-w-[240px]'
        : 'h-12 sm:h-14 max-w-[220px] sm:max-w-[280px]';
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a public blob of any shape; next/image would need its size
      <img src={site.logoUrl} alt={site.name} className={`block w-auto object-contain ${box}`} />
    );
  }

  const type = size === 'nav' ? 'text-lg sm:text-xl max-w-[180px] sm:max-w-[320px]' : 'text-xl sm:text-2xl max-w-full';
  return (
    <span className={`block truncate font-sans font-black uppercase tracking-tight text-white ${type}`}>
      {site.name}
    </span>
  );
}
