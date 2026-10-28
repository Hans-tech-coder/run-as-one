import NotFoundContent, { NOT_FOUND_METADATA } from '@/app/NotFoundContent';

/**
 * The wizard's `notFound()` (an event that is gone), inside its site's frame
 * (layout.tsx) rather than the root's main-site one.
 */
export const metadata = NOT_FOUND_METADATA;

export default NotFoundContent;
