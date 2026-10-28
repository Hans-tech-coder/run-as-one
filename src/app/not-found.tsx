import NotFoundContent, { NOT_FOUND_METADATA } from './NotFoundContent';
import SiteFrame from './SiteFrame';

/**
 * The root 404, for the few misses outside the site tree: an address under
 * `/pay`, `/track` and the other pages that keep the header (src/proxy.ts)
 * that none of them serves. Every other miss is a site's own, inside its frame
 * (`s/[site]/not-found.tsx`), and the dashboard has its own.
 *
 * In the main site's frame, and reading **no request API**: Next renders every
 * segment's not-found into each page's payload, so a `headers()` here would
 * run on every page of the app, the site tree's included.
 */
export const metadata = NOT_FOUND_METADATA;

export default function NotFound() {
  return (
    <SiteFrame site={null}>
      <NotFoundContent />
    </SiteFrame>
  );
}
