import type { Prisma } from '@prisma/client';
import { finishedEvents } from './event-schedule';
import { RESULTS_EVENTS, awaitingResults, takesResults } from './event-format';
import { cleanPhotoAlbums } from './photo-albums';
import { EVENT_SITE_CLIENT, type eventLinkOrigin } from './site-client';

/**
 * What counts as a past event, and where each one's card goes
 * (PAST_EVENTS_PLAN.md D2, D3). The Past tab on /events lists them; the home
 * page's Recently Held strip, the line under /results and the link on Our
 * Services point at that tab, and each shows only when the tab would have
 * something in it. One rule here, so none of them can offer a race the tab
 * would not list, or hide one it would.
 *
 * **Past** is published and finished (the caller's `scope` carries the
 * publish cut-off and, on a client's site, the client), virtual runs
 * included, and a results-only race only once its times are up — before
 * that its event page is a 404, and a card must never open onto one.
 */

/**
 * `finishedEvents()` is itself an OR, hence AND rather than a second OR
 * spread beside it.
 */
export function pastEventsWhere(scope: Prisma.EventWhereInput): Prisma.EventWhereInput {
  return { AND: [finishedEvents(), scope, { OR: [{ resultsOnly: false }, { raceResults: { some: {} } }] }] };
}

/**
 * The past races a card would send to their event page rather than to a
 * ranking (D3): no times uploaded, or a virtual run, which never has any.
 * /results lists the others, so these are the ones it points away to.
 */
export function pastWithoutResultsWhere(scope: Prisma.EventWhereInput): Prisma.EventWhereInput {
  return { AND: [pastEventsWhere(scope), { NOT: { ...RESULTS_EVENTS, raceResults: { some: {} } } }] };
}

/**
 * What a past card is drawn from: card fields only, plus the result count
 * that decides where the card goes, what says whether it may still promise
 * times (`awaitingResults`), and the photo albums behind its camera chip —
 * of which only "any?" reaches the browser.
 */
export const PAST_CARD = {
  id: true,
  slug: true,
  title: true,
  date: true,
  location: true,
  imageUrl: true,
  format: true,
  virtualEndDate: true,
  eventType: true,
  resultsOnly: true,
  timedResults: true,
  photoAlbums: true,
  client: EVENT_SITE_CLIENT,
  _count: { select: { raceResults: true } },
} satisfies Prisma.EventSelect;

type PastRow = Prisma.EventGetPayload<{ select: typeof PAST_CARD }>;
type LinkOrigin = Awaited<ReturnType<typeof eventLinkOrigin>>;

/**
 * One row as `EventGrid`'s `past` action reads it. A virtual run never has
 * results, whatever rows the table holds.
 */
export function toPastCard(
  { client, _count, eventType, resultsOnly, timedResults, photoAlbums, ...event }: PastRow,
  linkOrigin: LinkOrigin,
) {
  const hasResults = takesResults(event) && _count.raceResults > 0;
  return {
    ...event,
    hasResults,
    hasPhotos: cleanPhotoAlbums(photoAlbums).length > 0,
    resultsSoon: !hasResults && awaitingResults({ ...event, eventType, resultsOnly, timedResults }),
    siteOrigin: linkOrigin({ client }),
  };
}
