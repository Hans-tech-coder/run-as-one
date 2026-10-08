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

/** One runner as a client sees it. Blank strings, never null, for what was not given. */
export type ClientRunnerRow = {
  /** "RM-D918005C-2", or the bare order reference for a runner alone on an order. */
  ref: string;
  firstName: string;
  lastName: string;
  category: string;
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
      rows.push({
        ref: runnerRef(order.orderRef, runner.runnerNo, order.runners.length),
        firstName: runner.firstName,
        lastName: runner.lastName,
        category: runner.category.name,
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
