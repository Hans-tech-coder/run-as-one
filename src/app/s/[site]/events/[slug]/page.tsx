import EventDetails from './EventDetails';

export { generateMetadata } from './EventDetails';

/**
 * Cached per site and race for at most a minute, and dropped by any write
 * (the note is in src/app/s/[site]/(home)/page.tsx). An unpublished event is a
 * cached 404 here; the team's preview of it is the per-request route a
 * signed-in browser is sent to instead (`app/preview`, `src/proxy.ts`).
 */
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

export default async function EventDetailsPage({ params }: { params: Promise<{ site: string; slug: string }> }) {
  const { site, slug } = await params;
  return <EventDetails site={site} slug={slug} staff={false} />;
}
