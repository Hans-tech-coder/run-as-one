import { notFound } from 'next/navigation';
import { NOT_FOUND_METADATA } from '../../../NotFoundContent';

/**
 * Any path on a site that no page serves. `src/proxy.ts` rewrites every public
 * path into this tree, so this is what makes a typo answer with the site's own
 * branded 404 (../not-found.tsx) rather than the root's. The 404's title is
 * this page's too: without it the tab falls back to the layout's once the
 * page hydrates.
 */
export const metadata = NOT_FOUND_METADATA;

export default function MissingPage(): never {
  notFound();
}
