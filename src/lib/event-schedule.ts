import type { Prisma } from '@prisma/client';

/**
 * When an event stops being something you can sign up for and becomes
 * something you look up the times for.
 *
 * Every listing on the site sits on one side of that line: /events and the home
 * page show races that have not happened yet, /results shows races that have,
 * and a race that is over but whose organizer has not uploaded times yet shows
 * in neither — it is not open for registration, and there is nothing to read.
 * Putting the rule here rather than in each page means those pages can never
 * disagree about which side an event is on.
 *
 * `Event.date` is a string column, not a DateTime. It holds the value the admin
 * form's `<input type="date">` produces — YYYY-MM-DD, no time, no zone — which
 * is the right shape for what it means: a race is on a calendar day, not at an
 * instant. Because that format sorts and compares correctly as text, the
 * database can do the filtering and the ordering itself; see
 * `isCalendarDay`, which is what keeps every stored value in that format.
 */

/**
 * The zone the site's "today" is read in. Hardcoded rather than taken from the
 * server, because the server is Vercel's and runs in UTC: without this, a race
 * happening today in Manila would already count as finished for the eight hours
 * before UTC catches up, and a runner refreshing at breakfast would find it
 * gone from the listing.
 */
const EVENT_TIME_ZONE = 'Asia/Manila';

/** The only shape `Event.date` is ever allowed to hold. */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether a value is a calendar day the rest of this module can reason about.
 * The API routes reject anything else at the door, so a row that would sort
 * into the wrong listing can never be written in the first place.
 */
export function isCalendarDay(value: unknown): value is string {
  return typeof value === 'string' && CALENDAR_DAY.test(value);
}

/**
 * Today in Manila, as YYYY-MM-DD.
 *
 * en-CA is used purely because its date format is ISO order, which is the
 * format the column holds — nothing about this site is Canadian.
 */
export function today(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Races that have not happened yet, race day itself included: an event is
 * upcoming right up to the end of the day it is held on. A runner looking at
 * the listing on the morning of the race should still find it there.
 */
export function upcomingEvents(day: string = today()): Prisma.EventWhereInput {
  return { date: { gte: day } };
}

/** Races that are over — yesterday and earlier. */
export function finishedEvents(day: string = today()): Prisma.EventWhereInput {
  return { date: { lt: day } };
}

/** Whether this particular event is already over. */
export function hasFinished(event: { date: string }, day: string = today()): boolean {
  return event.date < day;
}

/**
 * Soonest first, which for an upcoming listing means the race you can still
 * enter and have least time to decide about is the one you see first. Two races
 * on the same day fall back to the newer listing, so a just-published event is
 * not buried behind one that has been up for months.
 */
export const soonestFirst: Prisma.EventOrderByWithRelationInput[] = [
  { date: 'asc' },
  { createdAt: 'desc' },
];

/**
 * Most recent first — the same rule as `soonestFirst` read backwards in time.
 * A finished race is most interesting the week after it was run, so /results
 * leads with the race people have just come home from.
 */
export const mostRecentFirst: Prisma.EventOrderByWithRelationInput[] = [
  { date: 'desc' },
  { createdAt: 'desc' },
];

/**
 * A race day as a runner reads it, not as the database stores it.
 *
 * `Event.date` is kept as YYYY-MM-DD because that is what sorts and compares
 * correctly, but nobody says "twenty twenty-six dash oh nine dash twenty-six"
 * out loud, and a runner scanning a poster-sized card should recognise the day
 * at a glance. So the stored value is the machine's format and these two are
 * the reader's: `short` for cards, where the date is one line of a stack and
 * has to stay narrow, and `long` on the event page itself, where the date is
 * a headline fact and has the room to be spelled out.
 *
 * The day is formatted as UTC deliberately. A calendar day carries no instant,
 * so handing 'YYYY-MM-DD' to `new Date` and then rendering it in Manila would
 * shift it by the zone offset and print the day before. Building the date in
 * UTC and reading it back in UTC keeps the day printed exactly as stored.
 */
function formatDay(date: string, month: 'short' | 'long'): string {
  if (!isCalendarDay(date)) return date;
  const [year, monthNumber, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month,
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, monthNumber - 1, day)));
}

/** "Sep 26, 2026" — for event cards, where the line has to stay narrow. */
export function formatEventDayShort(date: string): string {
  return formatDay(date, 'short');
}

/** "September 26, 2026" — for the event page and for prose about a race. */
export function formatEventDay(date: string): string {
  return formatDay(date, 'long');
}

/**
 * A start or end time as a runner reads it: "4:00 PM", not "16:00".
 *
 * The admin form's `<input type="time">` produces 24-hour HH:MM, which is the
 * right thing to store and the wrong thing to show — Philippine race posters
 * and gun-start announcements are all AM/PM, and a 5 AM assembly time misread
 * as 5 PM is a runner who misses the race. Anything that is not a time this
 * function recognises is passed through untouched rather than dropped, so an
 * older row in an unexpected shape still shows the organizer's own words.
 */
export function formatEventTime(time: string): string {
  const parsed = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!parsed) return time;

  const hours = Number(parsed[1]);
  const minutes = Number(parsed[2]);
  if (hours > 23 || minutes > 59) return time;

  const suffix = hours < 12 ? 'AM' : 'PM';
  // Midnight and noon are both written as 12 — hour 0 and hour 12 collapse to
  // the same numeral, on opposite halves of the day.
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}
