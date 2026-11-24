import publicDb, { publishCutoff } from './public-db';
import { publishedEvents } from './event-visibility';
import { formatEventDayShort, today } from './event-schedule';

/**
 * **Which races the Contact Us form offers** under "Which race is this about?":
 * the published races of the site being asked on — a client's own on its
 * subdomain, every one on the main site — from the last six months onward,
 * newest first. Older races rarely draw a question, and a select of every race
 * ever held is a list nobody can scan.
 *
 * The page and `/api/contact` read the same list, so the route only accepts a
 * race the form could have shown: a forged slug never reaches the email.
 * Read through `publicDb`, so opening the page does not wake Neon.
 */

/** How far back the list reaches, in days. */
const LOOKBACK_DAYS = 183;
/** Enough for every live race on any one site; past it the list is noise. */
const MAX_RACES = 40;

export interface ContactRace {
  slug: string;
  /** "Title — Mon D, YYYY", as the select and the email show it. */
  label: string;
}

export async function contactRaces(clientId: string | null): Promise<ContactRace[]> {
  const from = new Date(`${today()}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - LOOKBACK_DAYS);
  const fromDay = from.toISOString().slice(0, 10);

  const events = await publicDb.event.findMany({
    where: {
      ...publishedEvents(await publishCutoff()),
      ...(clientId ? { clientId } : {}),
      date: { gte: fromDay },
    },
    orderBy: { date: 'desc' },
    take: MAX_RACES,
    select: { slug: true, title: true, date: true },
  });

  return events.map(event => ({
    slug: event.slug,
    label: `${event.title} — ${formatEventDayShort(event.date)}`,
  }));
}
