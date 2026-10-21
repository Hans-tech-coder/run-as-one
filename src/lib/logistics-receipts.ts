import 'server-only';
import db from '@/lib/db';
import { switchPaymentChoices } from '@/lib/category-change-hold';
import { listedRegistrationWhere } from '@/lib/pending-expiry';
import {
  LOGISTICS_METHODS,
  asLogisticsMethod,
  deliveryZoneLabelFor,
  logisticsMethodLabel,
} from '@/lib/registration-codes';
import { formatRunnerAddress, groupByAddress, type RunnerAddress } from '@/lib/runner-address';
import { LOGISTICS_CHANGE_STATUSES, logisticsChangeDeadline, type LogisticsDirection } from '@/lib/logistics-change';
import { SWITCH_EVENT_SELECT, eligibilityFor } from '@/lib/logistics-change-context';
import { LOGISTICS_VIEW_INCLUDE, logisticsChangeView, type LogisticsChangeView } from '@/lib/logistics-change-view';

/**
 * **Each receipt as the pickup / delivery switch reads it**
 * (LOGISTICS_CHANGE_PLAN.md R2, R3, Revision 2): one entry per receipt (order
 * reference), because a switch moves a whole receipt — every runner of a
 * group registration — and is charged per receipt, while the registrants
 * table it is opened from is one row per runner.
 *
 * The rule this owns: what a receipt's switch knows — its runners and kits,
 * pickup or delivery, where each household's parcel goes, a switch waiting
 * for payment, its history, and whether staff may switch it now (L3, L11,
 * L13). **No receipt is read against another**: a delivery fee is charged per
 * order (the owner, 2026-10-21, which replaced L6, R4 and R5), so nothing here
 * says one receipt ships with, or waits on, another. It is decided from
 * **one** read of the event's listed orders (`listedRegistrationWhere`, the
 * registrants screen's own list), their live runners' home addresses and the
 * event's switches, so the page wakes the database once.
 *
 * The same read carries what the *Ship kits* panel quotes from in the browser
 * (the event's fees), so opening a receipt fetches nothing; the store re-reads
 * and re-checks all of it under the event's locks when staff save.
 * Server-only.
 */

/** Orders whose kits are still coming: paid, or a bank transfer awaiting its check. */
const KIT_STATUSES = ['PAID', 'PENDING'];

const ADDRESS_FIELDS = {
  addressStreet: true,
  addressBarangay: true,
  addressCity: true,
  addressProvince: true,
} as const;

function addressOf(runner: Partial<Record<keyof RunnerAddress, string | null>>): RunnerAddress {
  return {
    addressStreet: runner.addressStreet ?? '',
    addressBarangay: runner.addressBarangay ?? '',
    addressCity: runner.addressCity ?? '',
    addressProvince: runner.addressProvince ?? '',
  };
}

export async function readEventReceipts(
  eventId: string,
  organizerId: string,
  /** Whether this staff member may record a payment (`registration:validate`), which *Already paid* is. */
  { recordPaid = false }: { recordPaid?: boolean } = {},
  now = new Date(),
) {
  const event = await db.event.findFirst({
    where: { id: eventId, organizerId },
    select: {
      ...SWITCH_EVENT_SELECT,
      registrations: {
        where: { AND: [listedRegistrationWhere(), { status: { in: KIT_STATUSES } }] },
        // Oldest first, as the registrants screen lists them.
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          orderRef: true,
          status: true,
          customerEmail: true,
          paymentMethod: true,
          logisticsMethod: true,
          deliveryZone: true,
          deliveryAddress: true,
          deliverySplit: true,
          runners: {
            where: { deletedAt: null },
            orderBy: { runnerNo: 'asc' },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              ...ADDRESS_FIELDS,
              category: { select: { name: true } },
            },
          },
        },
      },
      logisticsChanges: { orderBy: { createdAt: 'asc' }, include: LOGISTICS_VIEW_INCLUDE },
    },
  });
  if (!event) return null;

  const switchesOf = new Map<string, LogisticsChangeView[]>();
  for (const change of event.logisticsChanges) {
    const view = logisticsChangeView(change);
    for (const link of change.orders) {
      switchesOf.set(link.registrationId, [...(switchesOf.get(link.registrationId) ?? []), view]);
    }
  }

  const receipts = event.registrations.map(order => {
    const switches = switchesOf.get(order.id) ?? [];
    const isDelivery = asLogisticsMethod(order.logisticsMethod) === LOGISTICS_METHODS.DELIVERY;
    const runners = order.runners.map(runner => ({
      id: runner.id,
      name: `${runner.firstName} ${runner.lastName}`,
      email: runner.email,
      category: runner.category?.name ?? '',
      address: addressOf(runner),
    }));
    // A split order stores no one address: each household is its own parcel,
    // grouped by the rule the checkout charged by (RUNNER_ADDRESS_PLAN.md).
    const parcels = !isDelivery
      ? []
      : order.deliverySplit
        ? groupByAddress(runners.map(runner => runner.address)).map(group => ({
            address: formatRunnerAddress(group.address) || 'No address on file',
            runners: group.runners.map(index => runners[index].name),
          }))
        : [{ address: order.deliveryAddress || 'No address on file', runners: runners.map(runner => runner.name) }];
    const hasOpenSwitch = switches.some(change => change.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT);
    const eligibility = eligibilityFor(event, order, hasOpenSwitch, now);

    return {
      id: order.id,
      orderRef: order.orderRef,
      status: order.status,
      paymentMethod: order.paymentMethod,
      // Raw, for the quote; the label, for the shared display helpers.
      logisticsCode: order.logisticsMethod,
      logisticsMethod: logisticsMethodLabel(order.logisticsMethod),
      isDelivery,
      deliveryZone: isDelivery ? deliveryZoneLabelFor(event, order.deliveryZone) : '',
      deliveryAddress: order.deliveryAddress,
      deliverySplit: order.deliverySplit,
      runners,
      parcels,
      /** Every switch of this receipt, oldest first, for the shared display helpers. */
      registrationId: order.id,
      logisticsChanges: switches,
      /** Which way staff may switch it now, or why not (L3, L11, L13). */
      canSwitch: eligibility.allowed
        ? { allowed: true as const, direction: eligibility.direction as LogisticsDirection }
        : { allowed: false as const, message: eligibility.message },
      // The entry's own way, plus *Already paid* for staff who record payments.
      paymentChoices: switchPaymentChoices(order.paymentMethod, recordPaid),
      /** What the search box matches: the reference, the names, the emails. */
      searchText: [order.orderRef, order.customerEmail, ...runners.flatMap(runner => [runner.name, runner.email])]
        .join(' ')
        .toLowerCase(),
    };
  });

  const deadline = logisticsChangeDeadline(event);
  return {
    event: {
      id: event.id,
      title: event.title,
      province: event.province,
      location: event.location,
      format: event.format,
      logisticsDeliveryFeeInside: event.logisticsDeliveryFeeInside,
      logisticsDeliveryFeeOutside: event.logisticsDeliveryFeeOutside,
      deadline: deadline ? deadline.toISOString() : null,
    },
    receipts,
  };
}

export type EventReceipts = NonNullable<Awaited<ReturnType<typeof readEventReceipts>>>;
export type Receipt = EventReceipts['receipts'][number];
export type ReceiptEvent = EventReceipts['event'];
