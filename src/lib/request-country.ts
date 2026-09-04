import { headers } from 'next/headers';
import { countryFor, DEFAULT_COUNTRY } from './phone';

/**
 * Where this request appears to come from, as an ISO country code.
 *
 * Vercel adds x-vercel-ip-country to every request it serves, so this costs no
 * lookup and no third-party call. It is a starting guess for the phone field's
 * country, never a decision — a runner abroad, or anyone behind a VPN, changes
 * it in one click, and the value they pick is what gets stored.
 *
 * Falls back to the default country locally, where the header is absent, and
 * for any code that is not one the phone list carries.
 */
export async function requestCountry(): Promise<string> {
  try {
    const headerList = await headers();
    const raw =
      headerList.get('x-vercel-ip-country') ??
      headerList.get('cf-ipcountry') ??
      '';
    const code = raw.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return DEFAULT_COUNTRY;
    // countryFor() falls back on its own for codes we do not carry.
    return countryFor(code).iso2;
  } catch {
    return DEFAULT_COUNTRY;
  }
}
