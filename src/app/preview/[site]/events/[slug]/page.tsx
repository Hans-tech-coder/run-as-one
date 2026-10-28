import EventDetails from '../../../../s/[site]/events/[slug]/EventDetails';

export { generateMetadata } from '../../../../s/[site]/events/[slug]/EventDetails';

/**
 * The event page for a browser that carries a dashboard session: `src/proxy.ts`
 * rewrites `/events/<slug>` here instead of to the cached copy, so a draft or
 * scheduled event can still be previewed by the team that may open it
 * (lib/event-preview.ts, EVENT_PUBLISH_PLAN.md D9). Rendered per request,
 * because it reads the session. A browser never reaches this path by typing it:
 * the proxy rewrites `/preview/…` into the site tree, where it is a 404.
 */
export const dynamic = 'force-dynamic';

export default async function EventPreviewPage({ params }: { params: Promise<{ site: string; slug: string }> }) {
  const { site, slug } = await params;
  return <EventDetails site={site} slug={slug} staff />;
}
