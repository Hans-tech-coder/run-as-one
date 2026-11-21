/**
 * What an event page tells Google about the race, as schema.org `SportsEvent`
 * JSON-LD — the markup that lets a race show in Google's event listings.
 *
 * **The rule: only what the page itself shows.** Every field comes from a
 * column the event page renders; a field the event does not have is left out,
 * never filled with a guess. Google demotes markup that disagrees with its page,
 * and a wrong time or price in a search result is a runner at the wrong gate.
 *
 * - Dates are Manila wall-clock (`+08:00`, lib/event-schedule.ts): the day plus
 *   the gun start and end when set, the bare day when not. A virtual run is its
 *   window, `date` to `virtualEndDate`, and is an online event at a
 *   `VirtualLocation` (the event page) rather than at a venue.
 * - One offer per option runners are shown (`shownToRunners`, applied by the
 *   caller), at the price the page shows — a running automatic sale price
 *   (`categorySalePrices`), else the list price — linking to the register
 *   wizard opened on that option. In stock only while the page would let a
 *   runner register for it (an open race, or one opening on its schedule, and
 *   the option not full); every other state — closed, paused, full, over — is
 *   sold out, because a search result must not promise a slot the page refuses.
 * - The organizer is the client on a client's race (they hire Run As One to
 *   run it), else Run As One.
 *
 * Every URL is on the event's own site (`eventOrigin`), the same canonical
 * `eventPageMetadata` names. Reads no request API: the event page is a cached
 * static page. `jsonLdScript` escapes the payload, since titles and
 * descriptions are typed by staff and must not be able to close the tag.
 */

import { isVirtual } from './event-format';
import { EVENT_UTC_OFFSET, isCalendarDay } from './event-schedule';
import { registerPath } from './event-slug';
import { toPesos } from './money';
import { parseInline, parseRichText } from './rich-text';
import type { RegistrationState } from './registration-gate';
import { SITE_NAME } from './site-contact';
import { deploymentOrigin, eventOrigin, mainOrigin, siteLabelOf, type SiteClientRef } from './site-host';

export interface StructuredEvent {
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  format: string;
  virtualEndDate: string | null;
  location: string;
  province: string | null;
  registrationOpensAt: Date | string | null;
  client: (SiteClientRef & { name: string }) | null;
  /** Already narrowed to what runners are shown, with slot counts. */
  categories: { id: string; name: string; price: number; isFull: boolean }[];
}

const TIME = /^\d{2}:\d{2}$/;

/** `2026-12-07T05:00:00+08:00`, or the bare day when no time is set. */
function manila(day: string, time: string | null): string {
  const clock = time?.trim() ?? '';
  return TIME.test(clock) ? `${day}T${clock}:00${EVENT_UTC_OFFSET}` : day;
}

/** The description as plain text: the markup stripped, the words kept. */
function plainText(source: string | null): string {
  if (!source?.trim()) return '';
  const lines = parseRichText(source).flatMap(block =>
    block.kind === 'heading' ? [block.text] : block.kind === 'paragraph' ? block.lines : block.items,
  );
  return lines
    .map(line => parseInline(line).map(part => part.text).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drops the keys whose value is missing, so a field the event lacks is absent. */
function present<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''),
  ) as Partial<T>;
}

export function eventJsonLd(
  event: StructuredEvent,
  state: RegistrationState,
  salePrices: ReadonlyMap<string, { salePrice: number }>,
): Record<string, unknown> {
  const origin = eventOrigin(event, deploymentOrigin());
  const pageUrl = `${origin}/events/${event.slug}`;
  const virtual = isVirtual(event);

  const startDate = virtual ? event.date : manila(event.date, event.startTime);
  let endDate: string | undefined;
  if (virtual) {
    if (event.virtualEndDate && isCalendarDay(event.virtualEndDate)) endDate = event.virtualEndDate;
  } else if (event.endTime && TIME.test(event.endTime.trim())) {
    const end = manila(event.date, event.endTime);
    // An end before the start (a typo, or a run past midnight) would be an
    // invalid event; no end at all is the honest answer.
    if (end > startDate) endDate = end;
  }

  const location = virtual
    ? { '@type': 'VirtualLocation', url: pageUrl }
    : present({
        '@type': 'Place',
        name: event.location.trim(),
        address: present({
          '@type': 'PostalAddress',
          streetAddress: event.location.trim(),
          addressRegion: event.province?.trim(),
          addressCountry: 'PH',
        }),
      });

  const organizer = event.client
    ? present({
        '@type': 'Organization',
        name: event.client.name,
        // Only a client with a live site has a page of its own to point at.
        url: siteLabelOf(event.client) ? origin : undefined,
      })
    : { '@type': 'Organization', name: SITE_NAME, url: mainOrigin(deploymentOrigin()) };

  const selling = state === 'OPEN' || state === 'SCHEDULED';
  const opensAt = event.registrationOpensAt ? new Date(event.registrationOpensAt) : null;
  const offers = event.categories.map(category =>
    present({
      '@type': 'Offer',
      name: category.name,
      price: toPesos(salePrices.get(category.id)?.salePrice ?? category.price),
      priceCurrency: 'PHP',
      availability:
        selling && !category.isFull ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      url: `${origin}${registerPath(event, category)}`,
      validFrom: opensAt && !Number.isNaN(opensAt.getTime()) ? opensAt.toISOString() : undefined,
    }),
  );

  const poster = event.imageUrl.trim();
  return present({
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.title,
    description: plainText(event.description),
    image: poster ? [poster] : undefined,
    url: pageUrl,
    startDate,
    endDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: virtual
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    location,
    organizer,
    offers: offers.length ? offers : undefined,
  });
}

/**
 * JSON-LD as a `<script>` body. `<`, `>` and `&` become `\u` escapes (the
 * Next.js JSON-LD guide's advice), so no text inside can end the tag; the line
 * and paragraph separators too, which some parsers read as line breaks.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
}
