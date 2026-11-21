/**
 * **Where a race's venue is on a map**: a plain Google Maps search for the
 * venue the organizer typed, so a runner who has never been to the town can
 * see how far it is before they pay.
 *
 * The rule: **a search link, never an embed and never a guess.** A search URL
 * needs no API key, loads nothing with the page (the event page is a cached
 * static page that must stay light on a phone), and lets Google resolve
 * "Capas Town Plaza" the way it would if the runner typed it themselves. The
 * province is added when the venue text does not already name it, because
 * "Town Plaza" alone matches a plaza in every province. A virtual run has no
 * venue, so it gets no link at all, and neither does a blank location.
 *
 * Shared by the event page's Race Details and its JSON-LD (`hasMap`), so the
 * page and what Google reads point at the same place.
 */

import { isVirtual } from './event-format';

export function venueMapUrl(event: {
  location: string;
  province?: string | null;
  format?: unknown;
}): string | null {
  if (isVirtual(event)) return null;
  const venue = event.location.trim();
  if (!venue) return null;
  const province = event.province?.trim() ?? '';
  const query =
    province && !venue.toLowerCase().includes(province.toLowerCase())
      ? `${venue}, ${province}`
      : venue;
  const country = /philippines/i.test(query) ? query : `${query}, Philippines`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(country)}`;
}
