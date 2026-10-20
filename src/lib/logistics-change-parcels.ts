/**
 * **Which receipts share a parcel after a delivery switch** (LOGISTICS_CHANGE_PLAN.md
 * L6, Revision 1 R4 and R5): who rides at ₱0 on whose paid parcel, and when a
 * new parcel would land on an address that is still waiting for payment.
 *
 * - **Riders (L6, R5).** An order rides on whatever its latest applied switch
 *   recorded, as long as it is still a PAID delivery; one that has since gone
 *   back to pickup rides on nothing. A receipt others ride on cannot go back to
 *   pickup alone: they go back first, one at a time (R5), each at ₱0.
 * - **An address waiting for payment (R4).** While one receipt's switch to an
 *   address waits for its fee, a second receipt to the same address (the
 *   `groupByAddress` rule the quote and the split checkout use) is refused
 *   rather than charged a second time or let ride free. Once the first is paid
 *   the second quotes ₱0 on its own (L6); staff can also cancel the first.
 *   This keeps the rule that an unpaid parcel never carries a free rider.
 *
 * Kept free of Prisma like `logistics-change.ts`, so the Ship kits
 * panel says the refusal while staff type, and the store says it again under
 * the event's locks.
 */

import { asLogisticsMethod, LOGISTICS_METHODS } from './registration-codes';
import { groupByAddress, type RunnerAddress } from './runner-address';
import { LOGISTICS_DIRECTIONS, paidParcels, type ExistingDelivery, type QuotedParcel } from './logistics-change';

// ── Riders ───────────────────────────────────────────────────────────────────

/** One order's place in one applied switch, as the riders read it. */
export type AppliedLink = {
  registrationId: string;
  /** The order now. */
  status: string;
  logisticsMethod: string;
  direction: string;
  ridesOnRegistrationId: string | null;
  /** When the switch applied, in ms. The latest one per order counts. */
  at: number;
};

/**
 * The orders riding at ₱0 on any of `hosts`' parcels, and on theirs in turn,
 * that are not among `hosts` — what must go back to pickup before a host may.
 */
export function ridersOf(links: readonly AppliedLink[], hosts: readonly string[]): string[] {
  const latest = new Map<string, AppliedLink>();
  for (const link of links) {
    const seen = latest.get(link.registrationId);
    if (!seen || link.at > seen.at) latest.set(link.registrationId, link);
  }
  const rides = [...latest.values()].filter(
    link =>
      link.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY &&
      link.ridesOnRegistrationId &&
      link.status.trim().toUpperCase() === 'PAID' &&
      asLogisticsMethod(link.logisticsMethod) === LOGISTICS_METHODS.DELIVERY,
  );
  const group = new Set(hosts);
  const riders: string[] = [];
  for (let grew = true; grew; ) {
    grew = false;
    for (const link of rides) {
      if (group.has(link.registrationId) || !group.has(link.ridesOnRegistrationId!)) continue;
      group.add(link.registrationId);
      riders.push(link.registrationId);
      grew = true;
    }
  }
  return riders;
}

/** "RM-A1" or "RM-A1, RM-B2 and RM-C3". */
export function refsOf(refs: readonly string[]): string {
  return refs.length <= 1 ? (refs[0] ?? '') : `${refs.slice(0, -1).join(', ')} and ${refs.at(-1)}`;
}

/** R5's sentence, on *Back to pickup* and from the store alike. */
export function ridersRefusal(riderRefs: readonly string[]): string {
  const refs = refsOf(riderRefs);
  return `${refs} ${riderRefs.length === 1 ? 'ships' : 'ship'} with this receipt at no charge. Switch ${refs} back to pickup first.`;
}

// ── An address waiting for payment ───────────────────────────────────────────

/** A switch to delivery still waiting for its fee, and where it would ship. */
export type WaitingSwitch = {
  /** The receipt it belongs to, as staff read it. */
  orderRef: string;
  registrationIds: readonly string[];
  deliveryAddress: string | null;
  deliverySplit: boolean;
  /** Its orders' live runners' home addresses, read only when it ships split. */
  runners: ExistingDelivery['runners'];
};

/**
 * Where one delivery's kits go: its one address, or each household on a split
 * order — by the rule a paid order's parcels are read with (`paidParcels`), so
 * "the same address" means one thing for a paid order, a waiting switch and
 * the screen's parcel count.
 */
export function parcelAddressesOf(
  delivery: Pick<ExistingDelivery, 'deliveryAddress' | 'deliverySplit' | 'runners'>,
): RunnerAddress[] {
  // Revision 3b: a switch still waiting for the runner's address ships nowhere yet.
  if (!delivery.deliverySplit && !delivery.deliveryAddress) return [];
  return paidParcels([
    { ...delivery, registrationId: '', status: 'PAID', logisticsMethod: LOGISTICS_METHODS.DELIVERY },
  ]).map(parcel => parcel.address);
}

/**
 * The receipt whose waiting switch a new parcel would join (R4), or null. Only
 * a parcel that would pay is compared: one riding on a paid parcel at ₱0
 * harms nobody. The order being switched never blocks itself.
 */
export function waitingConflict(
  parcels: readonly Pick<QuotedParcel, 'address' | 'fee'>[],
  waiting: readonly WaitingSwitch[],
  registrationId: string,
): string | null {
  const paying = parcels.filter(parcel => parcel.fee > 0).map(parcel => parcel.address);
  if (paying.length === 0) return null;
  const held = waiting
    .filter(change => !change.registrationIds.includes(registrationId))
    .flatMap(change => parcelAddressesOf(change).map(address => ({ orderRef: change.orderRef, address })));
  const addresses: RunnerAddress[] = [...paying, ...held.map(parcel => parcel.address)];
  for (const group of groupByAddress(addresses)) {
    if (!group.runners.some(index => index < paying.length)) continue;
    const hit = group.runners.find(index => index >= paying.length);
    if (hit !== undefined) return held[hit - paying.length].orderRef;
  }
  return null;
}

/** R4's sentence. */
export function waitingRefusal(orderRef: string): string {
  return `${orderRef} is waiting for payment for delivery to this address. Switch this receipt once that is paid, and it ships free.`;
}
