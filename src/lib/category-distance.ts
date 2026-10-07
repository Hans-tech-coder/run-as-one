/**
 * A category filter lists races shortest first: 1K, 3K, 5K, 10K, Half
 * Marathon, 32K, Full Marathon. A plain string sort put "10K" before "5K", and
 * the names carry the distance in many spellings ("5K", "5KM", "1K PAWMAKER",
 * "HALF-MARATHON", "HALF MARATHON"), so the distance is read out of the name:
 * a half marathon is 21.0975 km, a marathon or full marathon 42.195 km, and
 * otherwise the first number before a K or KM. A name with no distance in it
 * (a merch package) goes after the races, alphabetically.
 */

const HALF_MARATHON_KM = 21.0975;
const MARATHON_KM = 42.195;

export function categoryDistanceKm(name: string): number | null {
  const n = name.toUpperCase();
  if (/HALF[\s-]*MARATHON/.test(n)) return HALF_MARATHON_KM;
  if (/MARATHON/.test(n)) return MARATHON_KM;
  const km = n.match(/(\d+(?:\.\d+)?)\s*KM?\b/);
  return km ? Number(km[1]) : null;
}

export function compareCategoryNames(a: string, b: string): number {
  const da = categoryDistanceKm(a);
  const db = categoryDistanceKm(b);
  if (da !== null && db !== null && da !== db) return da - db;
  if (da !== null && db === null) return -1;
  if (da === null && db !== null) return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
