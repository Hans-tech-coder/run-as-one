import 'server-only';
import type { Prisma } from '@prisma/client';
import db from '@/lib/db';
import {
  LOGISTICS_METHODS,
  asLogisticsMethod,
  deliveryZoneLabelFor,
  logisticsMethodLabel,
} from '@/lib/registration-codes';
import { formatRunnerAddress, type RunnerAddressField } from '@/lib/runner-address';
import { isOpenSwitch } from '@/lib/logistics-change';
import { eligibilityFor, type SwitchEvent } from '@/lib/logistics-change-context';
import { shipmentsFor } from '@/app/events/[slug]/register/delivery-split';

/**
 * **A delivery switch as the registrants screen reads it, and an order's
 * logistics as its rows show them** (LOGISTICS_CHANGE_PLAN.md Session 2).
 *
 * `logisticsChangeView` is the one shape the row, the history and every
 * route's answer carry: the orders it moved with what each was before, the
 * order it rides on by reference, dates as strings. `orderLogisticsFields` is
 * the one place a row's Logistics columns are worded — the page builds its
 * rows with it, and a switch route answers with it, so a switch made on the
 * screen reads exactly as it will after a reload. Server-only.
 */

const VIEW_INCLUDE = {
  ridesOn: { select: { orderRef: true } },
  orders: {
    select: {
      registrationId: true,
      fromLogisticsMethod: true,
      fromDeliveryZone: true,
      fromDeliveryAddress: true,
      fromDeliverySplit: true,
      registration: { select: { orderRef: true } },
    },
  },
} as const;

type ChangeWithOrders = Prisma.LogisticsChangeGetPayload<{ include: typeof VIEW_INCLUDE }>;

export function logisticsChangeView(change: ChangeWithOrders) {
  return {
    id: change.id,
    changeRef: change.changeRef,
    status: change.status,
    direction: change.direction,
    deliveryAddress: change.deliveryAddress,
    deliverySplit: change.deliverySplit,
    /** The paid order whose parcel this joined at ₱0 (L6), by reference. */
    ridesOnOrderRef: change.ridesOn?.orderRef ?? null,
    fee: change.fee,
    transactionFee: change.transactionFee,
    totalCharged: change.totalCharged,
    paymentMethod: change.paymentMethod,
    holdUntil: change.holdUntil?.toISOString() ?? null,
    reason: change.reason,
    createdBy: change.createdBy,
    createdAt: change.createdAt.toISOString(),
    appliedAt: change.appliedAt?.toISOString() ?? null,
    cancelledAt: change.cancelledAt?.toISOString() ?? null,
    cancelledBy: change.cancelledBy,
    expiredAt: change.expiredAt?.toISOString() ?? null,
    orders: change.orders.map(link => ({
      registrationId: link.registrationId,
      orderRef: link.registration.orderRef,
      fromLogisticsMethod: link.fromLogisticsMethod,
      fromDeliveryAddress: link.fromDeliveryAddress,
      fromDeliverySplit: link.fromDeliverySplit,
    })),
  };
}

export type LogisticsChangeView = ReturnType<typeof logisticsChangeView>;

export async function readLogisticsChangeView(changeId: string): Promise<LogisticsChangeView> {
  return logisticsChangeView(
    await db.logisticsChange.findUniqueOrThrow({ where: { id: changeId }, include: VIEW_INCLUDE }),
  );
}

/** Every switch on an event, oldest first, under each order it moved — one query for the screen. */
export async function logisticsChangesByOrder(eventId: string): Promise<Map<string, LogisticsChangeView[]>> {
  const rows = await db.logisticsChange.findMany({
    where: { eventId },
    orderBy: { createdAt: 'asc' },
    include: VIEW_INCLUDE,
  });
  const byOrder = new Map<string, LogisticsChangeView[]>();
  for (const row of rows) {
    const view = logisticsChangeView(row);
    for (const link of row.orders) {
      byOrder.set(link.registrationId, [...(byOrder.get(link.registrationId) ?? []), view]);
    }
  }
  return byOrder;
}

type RowEvent = SwitchEvent;
type RowOrder = {
  status: string;
  logisticsMethod: string;
  deliveryZone: string | null;
  deliveryAddress: string | null;
  deliverySplit: boolean;
  /** Live runners, in runner order. */
  runners: readonly Partial<Record<RunnerAddressField, string | null>>[];
};

/**
 * One order's Logistics fields, one entry per live runner in runner order:
 * the method and zone in the uppercase words the screen prints, where this
 * runner's kit goes (their own household's parcel on a split order), the
 * order's switches, and which switch the row menu may offer — null when none
 * is allowed now (L3, L11, L13), so the item is never shown only to refuse.
 */
export function orderLogisticsFields(
  event: RowEvent,
  order: RowOrder,
  changes: LogisticsChangeView[],
  now = new Date(),
) {
  // A split order stores no one address: each household is its own parcel,
  // grouped by the rule the checkout charged by (RUNNER_ADDRESS_PLAN.md).
  const shipments = order.deliverySplit ? shipmentsFor(event, order.runners) : null;
  const eligibility = eligibilityFor(event, order, changes.some(change => isOpenSwitch(change.status)), now);
  return order.runners.map((_, index) => {
    const shipment = shipments?.find(s => s.runners.includes(index));
    return {
      logisticsMethod: logisticsMethodLabel(order.logisticsMethod).toUpperCase(),
      deliveryZone: deliveryZoneLabelFor(event, shipment ? shipment.zone : order.deliveryZone).toUpperCase(),
      deliveryAddress: (shipment ? formatRunnerAddress(shipment.address) : order.deliveryAddress) || 'N/A',
      deliverySplit: order.deliverySplit,
      isDelivery: asLogisticsMethod(order.logisticsMethod) === LOGISTICS_METHODS.DELIVERY,
      logisticsChanges: changes,
      logisticsSwitch: eligibility.allowed ? { direction: eligibility.direction } : null,
    };
  });
}

export type OrderLogisticsFields = ReturnType<typeof orderLogisticsFields>[number];

/**
 * A switch route's answer for the screen: each order's fields again, keyed by
 * runner id, so the table replaces its copy of every row the switch touched.
 */
export async function readOrderLogistics(registrationIds: readonly string[]) {
  const orders = await db.registration.findMany({
    where: { id: { in: [...registrationIds] } },
    select: {
      id: true,
      eventId: true,
      status: true,
      logisticsMethod: true,
      deliveryZone: true,
      deliveryAddress: true,
      deliverySplit: true,
      runners: {
        where: { deletedAt: null },
        orderBy: { runnerNo: 'asc' },
        select: { id: true, addressStreet: true, addressBarangay: true, addressCity: true, addressProvince: true },
      },
      event: {
        select: {
          id: true,
          title: true,
          organizerId: true,
          date: true,
          resultsOnly: true,
          province: true,
          location: true,
          format: true,
          logisticsPickup: true,
          logisticsDeliveryFeeInside: true,
          logisticsDeliveryFeeOutside: true,
          logisticsChangeUntil: true,
        },
      },
    },
  });
  if (orders.length === 0) return {};
  const changes = await logisticsChangesByOrder(orders[0].eventId);
  const rows: Record<string, OrderLogisticsFields> = {};
  for (const order of orders) {
    const fields = orderLogisticsFields(order.event, order, changes.get(order.id) ?? []);
    order.runners.forEach((runner, index) => {
      rows[runner.id] = fields[index];
    });
  }
  return rows;
}
