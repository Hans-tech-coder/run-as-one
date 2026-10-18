/**
 * Who registered for one of a client viewer's races, and how to get each kit
 * to them (CLIENT_RACE_PAGE_PLAN.md, Batch 4, decision D2 as revised by the
 * owner on 2026-10-08): **the runner list a client needs to release and ship
 * race kits, and nothing more.**
 *
 * Each runner is a name, a runner reference, a category, a shirt size, *Paid*
 * or *Awaiting verification*, pickup or delivery — and, because the client is
 * the one who hands over and ships the kits, a phone, an email, the home
 * address with its province, and for a delivered kit the delivery area and
 * the address it ships to. The `select` below is the whitelist: **no
 * birthdate, gender, emergency contact, medical note, guardian, club, payment
 * method, proof, amount or remark** leaves the query, and the row returned
 * has no field to carry one. The client can mark rows and export them
 * (`RunnerList.tsx`); the export is recorded in the activity trail.
 *
 * **Who is listed** is the registrants rule of the rest of the race page
 * (`registrantOrders` in `client-race-report.ts`): a runner on a PAID order or
 * on a bank transfer awaiting verification, never a removed runner or one on a
 * removed order. An unpaid checkout is not a runner and is not listed. So the
 * list's length is the *Registered Runners* tile.
 *
 * **The delivery address is the staff list's** (`registrants/page.tsx`): the
 * order's own address, or — on an order split per household — this runner's
 * own parcel, grouped by `shipmentsFor` with the rule the checkout charged by.
 *
 * **A category change shows as the staff list shows it** (CATEGORY_CHANGE_PLAN.md
 * D7): the current category, the one the runner started in, and the kit
 * difference between them — read by the registrants screen's own
 * `categoryMove`, so the client and the kit team see the same move. Only the
 * two category names and the inclusions leave the query; no amount, status
 * or reason of a change does.
 *
 * Every runner is sent at once, as the staff Registrants table does, so the
 * search, filters, marking and export all work across the whole list in the
 * browser. Sorted by first name, then last name.
 *
 * Gated by `event:view-runners`: the race is read through `reachableEvents`
 * and `can()` is asked with its own `clientId`, as `client-payout.ts` does. A
 * race the actor may not see is `null`, and the page has no runner section.
 *
 * Server-only.
 */

import prisma from './db';
import { can, reachableEvents, type Actor } from './actor';
import { chartSize, registrantOrders } from './client-race-report';
import { runnerRef } from './order-ref';
import { asLogisticsMethod, deliveryZoneLabelFor, LOGISTICS_METHODS } from './registration-codes';
import { formatRunnerAddress } from './runner-address';
import { shipmentsFor } from '@/app/events/[slug]/register/delivery-split';
import { CATEGORY_CHANGE_STATUSES } from './category-change';
import { categoryMove } from '@/app/admin/events/[id]/registrants/category-change-display';

/** One runner as a client sees it. Blank strings, never null, for what was not given. */
export type ClientRunnerRow = {
  /** "RM-D918005C-2", or the bare order reference for a runner alone on an order. */
  ref: string;
  firstName: string;
  lastName: string;
  /** The category the runner stands in now. */
  category: string;
  /** The category the runner registered in, when a change moved them; blank otherwise. */
  changedFrom: string;
  /** What the kit gained and lost by that move; null when it is the same kit. */
  kitChange: { added: string[]; removed: string[] } | null;
  /** In the size table's code (`chartSize`); blank when the package has nothing to wear. */
  size: string;
  status: 'Paid' | 'Awaiting verification';
  kit: 'Pickup' | 'Delivery';
  phone: string;
  email: string;
  /** The runner's home address, joined; blank on rows from before it was asked. */
  homeAddress: string;
  province: string;
  /** "Inside Province" / "Outside Province" for a delivered kit where the race asked; blank otherwise. */
  deliveryArea: string;
  /** Where a delivered kit ships; blank for a pickup. */
  deliveryAddress: string;
};

export async function clientRunners(actor: Actor, eventId: string): Promise<ClientRunnerRow[] | null> {
  const event = await prisma.event.findFirst({
    where: { AND: [reachableEvents(actor, 'event:view-runners'), { id: eventId }] },
    select: {
      id: true,
      organizerId: true,
      clientId: true,
      province: true,
      location: true,
      logisticsDeliveryFeeInside: true,
      logisticsDeliveryFeeOutside: true,
    },
  });
  if (
    !event ||
    !can(actor, 'event:view-runners', { organizerId: event.organizerId, eventId: event.id, clientId: event.clientId })
  ) {
    return null;
  }

  const orders = await prisma.registration.findMany({
    where: { eventId: event.id, ...registrantOrders() },
    // The whitelist. Nothing else about an order or a runner leaves this query.
    select: {
      orderRef: true,
      status: true,
      logisticsMethod: true,
      deliveryZone: true,
      deliveryAddress: true,
      deliverySplit: true,
      runners: {
        where: { deletedAt: null },
        orderBy: { runnerNo: 'asc' },
        select: {
          runnerNo: true,
          firstName: true,
          lastName: true,
          singletSize: true,
          phone: true,
          email: true,
          addressStreet: true,
          addressBarangay: true,
          addressCity: true,
          addressProvince: true,
          category: { select: { name: true } },
          // Moved changes only, oldest first: `categoryMove` reads from the first to the last.
          categoryChanges: {
            where: {
              status: {
                in: [
                  CATEGORY_CHANGE_STATUSES.APPLIED,
                  CATEGORY_CHANGE_STATUSES.REFUND_DUE,
                  CATEGORY_CHANGE_STATUSES.REFUNDED,
                ],
              },
            },
            orderBy: { createdAt: 'asc' },
            select: {
              status: true,
              fromInclusions: true,
              toInclusions: true,
              fromCategory: { select: { name: true } },
              toCategory: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const rows: ClientRunnerRow[] = [];
  for (const order of orders) {
    const delivered = asLogisticsMethod(order.logisticsMethod) === LOGISTICS_METHODS.DELIVERY;
    const shipments = delivered && order.deliverySplit ? shipmentsFor(event, order.runners) : null;
    order.runners.forEach((runner, index) => {
      const shipment = shipments?.find(s => s.runners.includes(index));
      const move = categoryMove({
        categoryChanges: runner.categoryChanges.map(change => ({
          status: change.status,
          fromCategory: change.fromCategory.name,
          toCategory: change.toCategory.name,
          fromInclusions: change.fromInclusions,
          toInclusions: change.toInclusions,
        })),
      });
      rows.push({
        ref: runnerRef(order.orderRef, runner.runnerNo, order.runners.length),
        firstName: runner.firstName,
        lastName: runner.lastName,
        category: runner.category.name,
        changedFrom: move?.from ?? '',
        kitChange: move?.kit.changed ? { added: move.kit.added, removed: move.kit.removed } : null,
        size: chartSize(runner.singletSize),
        // `registrantOrders` admits only PAID and awaiting-verification orders.
        status: order.status === 'PAID' ? 'Paid' : 'Awaiting verification',
        kit: delivered ? 'Delivery' : 'Pickup',
        phone: runner.phone,
        email: runner.email,
        homeAddress: formatRunnerAddress(runner),
        province: runner.addressProvince ?? '',
        deliveryArea: delivered ? deliveryZoneLabelFor(event, shipment ? shipment.zone : order.deliveryZone) : '',
        deliveryAddress: delivered
          ? ((shipment ? formatRunnerAddress(shipment.address) : order.deliveryAddress) ?? '')
          : '',
      });
    });
  }

  return rows.sort(
    (a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName) || a.ref.localeCompare(b.ref),
  );
}
