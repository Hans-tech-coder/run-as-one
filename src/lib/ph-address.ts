import provinces from './ph-provinces.json';

/**
 * Where in the Philippines a place is: the Province → City/Municipality →
 * Barangay lists a delivery address is picked from, and the one rule for
 * comparing two province names.
 *
 * The data is the PSA's PSGC, built by scripts/gen-psgc.mjs. The province index
 * is bundled (it is small and both the wizard and the admin's event form need
 * it at once); each province's cities and barangays live in public/psgc/ and
 * are fetched only when that province is chosen. Highly urbanized cities sit
 * under the province they are in (Cebu City under Cebu), and NCR is one
 * "Metro Manila".
 */

export interface PhProvince {
  /** File name under public/psgc/, not something a person reads. */
  code: string;
  name: string;
}

export interface PhCity {
  name: string;
  barangays: string[];
}

export const PH_PROVINCES: readonly PhProvince[] = provinces;

/** Case- and accent-blind, so "PARAÑAQUE CITY" matches "Parañaque City". */
export function placeKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function samePlace(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b) && placeKey(a!) === placeKey(b!);
}

export function findProvince(name: string | null | undefined): PhProvince | undefined {
  return name ? PH_PROVINCES.find((p) => samePlace(p.name, name)) : undefined;
}

const cityCache = new Map<string, PhCity[]>();
const pending = new Map<string, Promise<PhCity[]>>();

/** The cities of a province, fetched once per page load. */
export function loadCities(province: PhProvince): Promise<PhCity[]> {
  const cached = cityCache.get(province.code);
  if (cached) return Promise.resolve(cached);
  let request = pending.get(province.code);
  if (!request) {
    request = fetch(`/psgc/${province.code}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load ${province.name}`);
        return res.json() as Promise<PhCity[]>;
      })
      .then((cities) => {
        cityCache.set(province.code, cities);
        return cities;
      })
      .finally(() => pending.delete(province.code));
    pending.set(province.code, request);
  }
  return request;
}

/**
 * Whether `city` is one of `province`'s cities. `undefined` when that list has
 * not been loaded here (always so on the server), so a caller can tell "no"
 * from "cannot say".
 */
export function isKnownCity(province: string, city: string): boolean | undefined {
  const found = findProvince(province);
  const cities = found && cityCache.get(found.code);
  if (!cities) return undefined;
  return cities.some((c) => samePlace(c.name, city));
}

/**
 * Cities people name instead of their province, mapped to the province they
 * are filed under here. Metro Manila's cities, and the highly urbanized cities
 * whose name is not their province's ("Baguio", not "Benguet").
 */
const CITY_PROVINCE: Record<string, string> = {
  'Metro Manila': 'Metro Manila', NCR: 'Metro Manila', Manila: 'Metro Manila',
  'Quezon City': 'Metro Manila', Makati: 'Metro Manila', Pasig: 'Metro Manila',
  Taguig: 'Metro Manila', BGC: 'Metro Manila', 'Bonifacio Global City': 'Metro Manila',
  Mandaluyong: 'Metro Manila', 'San Juan City': 'Metro Manila', Marikina: 'Metro Manila',
  Caloocan: 'Metro Manila', Malabon: 'Metro Manila', Navotas: 'Metro Manila',
  Valenzuela: 'Metro Manila', 'Las Piñas': 'Metro Manila', 'Parañaque': 'Metro Manila',
  Muntinlupa: 'Metro Manila', Pasay: 'Metro Manila', Pateros: 'Metro Manila',
  Baguio: 'Benguet', 'Davao City': 'Davao del Sur', Angeles: 'Pampanga', Clark: 'Pampanga',
  Olongapo: 'Zambales', Subic: 'Zambales', Bacolod: 'Negros Occidental',
  'Cagayan de Oro': 'Misamis Oriental', 'General Santos': 'South Cotabato',
  'Zamboanga City': 'Zamboanga del Sur', 'Puerto Princesa': 'Palawan',
  Tacloban: 'Leyte', Butuan: 'Agusan del Norte', Iligan: 'Lanao del Norte',
  'Lapu-Lapu': 'Cebu', Mandaue: 'Cebu', Lucena: 'Quezon',
};

/**
 * The province a free-text location is in — "Capitol Lingayen, Pangasinan" →
 * Pangasinan — for an event whose organizer has not picked one yet.
 *
 * Every province name and every city in CITY_PROVINCE is looked for as a whole
 * word, and the match that ends last wins, because an address ends with its
 * widest place ("San Juan, Batangas" is Batangas). On a tie the longer name
 * wins, so "Quezon City" is Metro Manila rather than Quezon province and
 * "Cagayan de Oro" is not Cagayan. Undefined when nothing matches.
 */
export function inferProvince(location: string | null | undefined): PhProvince | undefined {
  if (!location) return undefined;
  const haystack = placeKey(location);
  const candidates: [string, string][] = [
    ...PH_PROVINCES.map((p): [string, string] => [p.name, p.name]),
    ...Object.entries(CITY_PROVINCE),
  ];
  let best: { end: number; length: number; province: string } | undefined;
  for (const [needle, province] of candidates) {
    const key = placeKey(needle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const m of haystack.matchAll(new RegExp(`(?<![A-Z0-9])${key}(?![A-Z0-9])`, 'g'))) {
      const end = m.index + m[0].length;
      if (!best || end > best.end || (end === best.end && m[0].length > best.length)) {
        best = { end, length: m[0].length, province };
      }
    }
  }
  return best && findProvince(best.province);
}
