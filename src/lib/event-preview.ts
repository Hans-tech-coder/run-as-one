import { can, getActor, isClientViewer } from './actor';
import { isPublished } from './event-visibility';

/**
 * Who may open an event page before it is public (EVENT_PUBLISH_PLAN.md D9).
 *
 * A published event is everyone's. A draft or a scheduled one is shown only to
 * signed-in team members who could open it in the dashboard, so they can read
 * the page as runners will before pressing Publish. Everyone else, client
 * viewers included (D7), gets the same 404 as an event that does not exist, so
 * an unpublished slug cannot be confirmed by guessing.
 *
 * Only the event page offers this preview. The register page and both checkout
 * routes stay published-only: an order taken on a hidden event is a real order
 * nobody meant to sell.
 *
 * Server-only (it reads the session), which is why it is not in
 * lib/event-visibility.ts, whose rule the client components share.
 */
export async function canViewEventPage(event: {
  id: string;
  organizerId: string;
  publishAt: Date | null;
}): Promise<{ visible: boolean; preview: boolean }> {
  if (isPublished(event)) return { visible: true, preview: false };
  const actor = await getActor();
  const staff =
    actor !== null &&
    !isClientViewer(actor) &&
    can(actor, 'event:view', { organizerId: event.organizerId, eventId: event.id });
  return { visible: staff, preview: staff };
}
