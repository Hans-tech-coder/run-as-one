import { findProvince, isKnownCity } from './ph-address';
import { upperCaseForStorage } from './text-case';

/**
 * Every runner's home address: required of each one, pickup or delivery, and
 * kept on their own `Runner` row (`RUNNER_ADDRESS_PLAN.md`).
 *
 * Why every runner, and why on Step 1 rather than the delivery step: when a
 * race was postponed and runners switched to virtual or from pickup to
 * delivery, the organizers had no address for anyone who had chosen pickup and
 * had to phone them one by one. The runners who most need an address on file
 * are exactly the ones the delivery step never sees.
 *
 * Four parts and no more — province, city/municipality and barangay from the
 * PSGC lists (lib/ph-address.ts), then one house/street line. ZIP and landmark
 * belong to a shipment, so they stay on the delivery step.
 *
 * Runner 2 onward may say "same address as" an earlier runner. Only an earlier
 * one can be named, so a chain always ends; `addressSources` follows it to the
 * runner who actually typed the address. The wizard posts the resolved copy for
 * every runner, and the checkout routes store it on each row, so an admin read
 * never has to follow a reference — and a later edit to one runner's address
 * cannot silently move another's.
 *
 * Joined for display in the same "STREET, BARANGAY, CITY, PROVINCE" shape that
 * `composeDeliveryAddress` builds, so a home address and a delivery address
 * print alike in the registrant table, the CSV and the email.
 */

export interface RunnerAddress {
  addressProvince: string;
  addressCity: string;
  addressBarangay: string;
  addressStreet: string;
}

export type RunnerAddressField = keyof RunnerAddress;

/** Form order, top to bottom: the first missing one is where the caret goes. */
export const RUNNER_ADDRESS_FIELDS: readonly RunnerAddressField[] = [
  'addressProvince',
  'addressCity',
  'addressBarangay',
  'addressStreet',
];

export const EMPTY_RUNNER_ADDRESS: RunnerAddress = {
  addressProvince: '',
  addressCity: '',
  addressBarangay: '',
  addressStreet: '',
};

export const RUNNER_ADDRESS_LABELS: Record<RunnerAddressField, string> = {
  addressProvince: 'Province',
  addressCity: 'City/Municipality',
  addressBarangay: 'Barangay',
  addressStreet: 'House/Unit No. & Street',
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Why each part is not good enough yet. Empty means complete.
 *
 * Same bar as the delivery address: the province must be on the list, since
 * logistics groups and (later) prices by it; the city is checked against its
 * province's list only where that list has been loaded, which is never on the
 * server; the barangay is not held to the list, so one newer than the data
 * still counts.
 */
export function runnerAddressProblems(
  address: Partial<Record<RunnerAddressField, unknown>> | null | undefined,
): Partial<Record<RunnerAddressField, string>> {
  const province = text(address?.addressProvince);
  const city = text(address?.addressCity);
  const problems: Partial<Record<RunnerAddressField, string>> = {};
  if (!findProvince(province)) {
    problems.addressProvince = 'Choose a province from the list';
  }
  if (!city.trim() || isKnownCity(province, city) === false) {
    problems.addressCity = 'Choose a city or municipality from the list';
  }
  if (!text(address?.addressBarangay).trim()) {
    problems.addressBarangay = 'Choose a barangay';
  }
  if (!text(address?.addressStreet).trim()) {
    problems.addressStreet = 'Enter the house/unit number and street';
  }
  return problems;
}

/**
 * For each runner, the index of the runner whose typed address it uses —
 * its own index when it typed one. `sameAs[i]` is the index runner i chose, or
 * null for "new address"; anything that is not an earlier runner (a stale
 * choice, runner 1 itself) counts as null, which is what makes every chain end.
 */
export function addressSources(sameAs: readonly (number | null)[]): number[] {
  const sources: number[] = [];
  sameAs.forEach((chosen, index) => {
    const valid = chosen !== null && Number.isInteger(chosen) && chosen >= 0 && chosen < index;
    sources.push(valid ? sources[chosen] : index);
  });
  return sources;
}

/** "BLK 5 RIZAL ST., SAN ISIDRO, TARLAC CITY, TARLAC" — "" when nothing is on file. */
export function formatRunnerAddress(
  address: Partial<Record<RunnerAddressField, string | null>> | null | undefined,
): string {
  return [
    address?.addressStreet,
    address?.addressBarangay,
    address?.addressCity,
    address?.addressProvince,
  ]
    .map((part) => (part ?? '').replace(/—/g, '-').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * The checkout routes' check: the first runner whose posted address is not
 * complete, named the way the wizard names it. Undefined when all are.
 */
export function participantAddressError(participants: unknown): string | undefined {
  if (!Array.isArray(participants)) return undefined;

  for (const [index, participant] of participants.entries()) {
    const problems = runnerAddressProblems(participant as Partial<RunnerAddress>);
    const field = RUNNER_ADDRESS_FIELDS.find((f) => problems[f]);
    if (!field) continue;
    const problem = `${RUNNER_ADDRESS_LABELS[field]}: ${problems[field]!.toLowerCase()}`;
    return participants.length === 1
      ? `Home address — ${problem}`
      : `Runner ${index + 1}'s home address — ${problem}`;
  }
  return undefined;
}

/**
 * The four `Runner` columns as a checkout route writes them: uppercase like
 * every other registrant field, and commas dropped from the three place names,
 * since a comma in a name would make the joined address ambiguous. Call only
 * after `participantAddressError` has passed.
 */
export function storedRunnerAddress(
  participant: Partial<Record<RunnerAddressField, unknown>> | null | undefined,
): RunnerAddress {
  const name = (value: unknown) => upperCaseForStorage(text(value).replace(/,/g, ' ').replace(/\s+/g, ' ').trim());
  return {
    addressProvince: name(participant?.addressProvince),
    addressCity: name(participant?.addressCity),
    addressBarangay: name(participant?.addressBarangay),
    addressStreet: upperCaseForStorage(text(participant?.addressStreet).replace(/—/g, '-').replace(/\s+/g, ' ').trim()),
  };
}
