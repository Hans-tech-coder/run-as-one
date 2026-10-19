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
import type { SwitchEvent } from '@/lib/logistics-change-context';
import { shipmentsFor } from '@/app/events/[slug]/register/delivery-split';

/**
 * **A delivery switch as the staff screens read it, and an order's logistics
 * as the registrants rows show them** (LOGISTICS_CHANGE_PLAN.md Session 2,
 * Revision 1).
 *
 * `logisticsChangeView` is the one shape a Pickup & Delivery card, its history,
 * a registrants row and every route's answer carry: the order it moved with
 * what it was before, the order it rides on by reference, dates as strings.
 * `orderLogisticsFields` is the one place a registrants row's Logistics
 * columns are worded; that screen only reads switches now (R6), so it carries
 * no switch action. Server-only.
 */

export const LOGISTICS_VIEW_INCLUDE = {
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

type ChangeWithOrders = Prisma.LogisticsChangeGetPayload<{ include: typeof LOGISTICS_VIEW_INCLUDE }>;

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
    // A recorded payment (Session 3). The proof's pathname stays on the
    // server; the screen asks the proof route for a signed URL.
    transactionNumber: change.transactionNumber,
    hasProof: change.proofOfPayment !== null,
    createdEmailSentAt: change.createdEmailSentAt?.toISOString() ?? null,
    appliedEmailSentAt: change.appliedEmailSentAt?.toISOString() ?? null,
    lastEmailError: change.lastEmailError,
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
    await db.logisticsChange.findUniqueOrThrow({ where: { id: changeId }, include: LOGISTICS_VIEW_INCLUDE }),
  );
}

/** Every switch on an event, oldest first, under each order it moved — one query for the screen. */
export async function logisticsChangesByOrder(eventId: string): Promise<Map<string, LogisticsChangeView[]>> {
  const rows = await db.logisticsChange.findMany({
    where: { eventId },
    orderBy: { createdAt: 'asc' },
    include: LOGISTICS_VIEW_INCLUDE,
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

type RowEvent = Pick<
  SwitchEvent,
  'province' | 'location' | 'format' | 'logisticsDeliveryFeeInside' | 'logisticsDeliveryFeeOutside'
>;
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
 * runner's kit goes (their own household's parcel on a split order), and the
 * order's switches, which the cell reads its chip and notes from.
 */
export function orderLogisticsFields(event: RowEvent, order: RowOrder, changes: LogisticsChangeView[]) {
  // A split order stores no one address: each household is its own parcel,
  // grouped by the rule the checkout charged by (RUNNER_ADDRESS_PLAN.md).
  const shipments = order.deliverySplit ? shipmentsFor(event, order.runners) : null;
  return order.runners.map((_, index) => {
    const shipment = shipments?.find(s => s.runners.includes(index));
    return {
      logisticsMethod: logisticsMethodLabel(order.logisticsMethod).toUpperCase(),
      deliveryZone: deliveryZoneLabelFor(event, shipment ? shipment.zone : order.deliveryZone).toUpperCase(),
      deliveryAddress: (shipment ? formatRunnerAddress(shipment.address) : order.deliveryAddress) || 'N/A',
      deliverySplit: order.deliverySplit,
      isDelivery: asLogisticsMethod(order.logisticsMethod) === LOGISTICS_METHODS.DELIVERY,
      logisticsChanges: changes,
    };
  });
}

export type OrderLogisticsFields = ReturnType<typeof orderLogisticsFields>[number];
