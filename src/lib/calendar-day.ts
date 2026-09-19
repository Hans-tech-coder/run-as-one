/**
 * Arithmetic on calendar days, the `YYYY-MM-DD` strings every date field in
 * this app holds (`Event.date`, `Runner.birthdate`, the promo windows).
 *
 * Shared by the two drawn calendars — the runner's `BirthdatePicker` and the
 * dashboard's `AdminDatePicker` — so they cannot disagree about how long
 * February is or which weekday a month starts on. A calendar day is not an
 * instant: everything here runs on Date.UTC and reads back with the UTC
 * getters, so no timezone ever touches it. "Today" is not in here; it is
 * Manila's, and lives in `event-schedule.ts` as `today()`.
 */

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const WEEKDAYS = [
  ["Su", "Sunday"],
  ["Mo", "Monday"],
  ["Tu", "Tuesday"],
  ["We", "Wednesday"],
  ["Th", "Thursday"],
  ["Fr", "Friday"],
  ["Sa", "Saturday"],
] as const;

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function dayParts(day: string): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m, d];
}

export function isoDay(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = dayParts(day);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return isoDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Moves by whole months, keeping the day where the month allows (Mar 31 − 1 → Feb 28). */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = dayParts(day);
  const index = y * 12 + (m - 1) + n;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return isoDay(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** 0 for Sunday, as the grids are drawn. */
export function weekday(day: string): number {
  const [y, m, d] = dayParts(day);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "March 4, 2014" — never an ambiguous 03/04/14. "" for anything else. */
export function formatCalendarDay(day: string): string {
  if (!CALENDAR_DAY.test(day)) return "";
  const [y, m, d] = dayParts(day);
  if (m < 1 || m > 12) return "";
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function clampDay(day: string, min: string, max: string): string {
  if (day > max) return max;
  if (day < min) return min;
  return day;
}

/**
 * A month as six weeks of seven cells, `null` where the day belongs to the
 * month either side. Always six, so a calendar keeps one height from month to
 * month and nothing jumps under the pointer while someone browses.
 */
export function monthWeeks(y: number, m: number): (string | null)[][] {
  const lead = weekday(isoDay(y, m, 1));
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth(y, m) }, (_, i) => isoDay(y, m, i + 1)),
  ];
  while (cells.length < 42) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
