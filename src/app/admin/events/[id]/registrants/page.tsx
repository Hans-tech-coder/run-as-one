import React from 'react';
import prisma from '@/lib/db';
import { can, requireTeamActor } from '@/lib/actor';
import RegistrantsTable, { type RegistrantPermissions } from './RegistrantsTable';
import RegistrantsTabs, { type RegistrantsTab } from './RegistrantsTabs';
import UnpaidCheckoutsList, { type UnpaidCheckout } from './UnpaidCheckoutsList';
import { latestFollowUps, latestStatusChanges } from '@/lib/activity-store';
import { followUpAgo } from '@/lib/follow-up';
import AdminNotFound from '../../../AdminNotFound';
import { EVENT_NOT_FOUND } from '../../event-not-found';
import { paymentMethodLabel } from '@/lib/registration-codes';
import { eventInstantParts, formatEventTime, formatInstantDay, today } from '@/lib/event-schedule';
import { expiresBy, isCancelledCheckout, listedRegistrationWhere, unpaidFollowUpWhere } from '@/lib/pending-expiry';
import { categoryChangesByRunner } from '@/lib/category-change-view';
import { logisticsChangesByOrder } from '@/lib/logistics-change-view';
import { readEventReceipts } from '@/lib/logistics-receipts';
import { buildRegistrantRows } from './registrant-rows';
import DashboardHeader from '@/app/admin/DashboardHeader';

export default async function RegistrantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // `?search=` prefills the table's search box. The marketing screen's
  // redemptions panel links here with an order reference in it, so tracing a
  // discount back to the people who used it is one click.
  // `?tab=unpaid` opens the Unpaid checkouts tab: the "+N unpaid" on the
  // events table and the overview link straight to it.
  searchParams: Promise<{ search?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { search, tab } = await searchParams;
  const initialTab: RegistrantsTab = tab === 'unpaid' ? 'unpaid' : 'registrants';

  // Scoped to the signed-in organizer's own events, the way every admin route
  // is. This screen carries the most sensitive data in the app — every
  // runner's email, phone, birthdate, emergency contact and medical notes — and
  // an id in the URL is not proof it belongs to the browser's owner: without
  // the `organizerId` here, any approved organizer handed another's event id
  // could read their whole registrant list.
  //
  // A no-match reads as "Event not found." rather than "not yours", so the
  // screen cannot be used to confirm that some id exists. A STAFF member
  // unassigned to this race gets the same "Event not found."
  const actor = await requireTeamActor();

  // Fetch real runners for this event via the Registrations table
  const found = await prisma.event.findFirst({
    where: { id, organizerId: actor.orgId },
    include: {
      registrations: {
        // Registration order, oldest first — fixed here rather than left to
        // the database. Without an ordering Postgres is free to hand back rows
        // in whatever order it finds them on disk, and every UPDATE (a status
        // change, a remark, an email stamp) rewrites the row at the end of the
        // heap. The list therefore reshuffled itself as an organizer worked
        // it: validating one payment moved that order, and the person sitting
        // at "No. 1" was not the first person who registered.
        orderBy: { createdAt: 'asc' },
        // An online order is listed only once PayMongo has confirmed it; an
        // unpaid or abandoned one stays off this screen (lib/pending-expiry.ts).
        where: listedRegistrationWhere(),
        include: {
          runners: {
            // The same reason one level down. A group's members were coming
            // back in an arbitrary order, so runner -2 could sit above runner
            // -1 and the references on screen read out of sequence. The
            // confirmation email has always sorted this way (byRunnerNo in
            // lib/email.ts); this screen was the one place that did not.
            orderBy: { runnerNo: 'asc' },
            // A runner removed from an order stays in the table for the audit
            // trail (Runner.deletedAt) and never on this screen.
            where: { deletedAt: null },
            include: { category: true }
          }
        }
      }
    }
  });
  const event =
    found && can(actor, 'registration:view', { organizerId: actor.orgId, eventId: id })
      ? found
      : null;

  if (!event) {
    // In the dashboard's frame, with the way back to the events list. The
    // wording is shared with the results screen and says the same for a
    // missing event and one this person may not open.
    return <AdminNotFound {...EVENT_NOT_FOUND} />;
  }

  // What this person may do here, decided once on the server with the same
  // can() every registrants route enforces, so the screen offers only the
  // buttons that would work. A validator is not shown Edit only to be told no
  // — and a hidden button is manners, not access: the routes still refuse.
  const reach = { organizerId: actor.orgId, eventId: id };
  const permissions: RegistrantPermissions = {
    validate: can(actor, 'registration:validate', reach),
    remark: can(actor, 'registration:remark', reach),
    email: can(actor, 'registration:email', reach),
    edit: can(actor, 'registration:edit', reach),
    remove: can(actor, 'registration:delete', reach),
    proof: can(actor, 'proof:view', reach),
    activity: can(actor, 'activity:view', { organizerId: actor.orgId }),
  };

  // Who last moved each order's status, from the trail — the detail modal's
  // "Validated by Ana Cruz" line. One query for the whole screen.
  const statusRecords = await latestStatusChanges(actor.orgId, id);

  // "Oct 7, 2026, 3:00 AM", in Manila, so every staff member's machine reads
  // the same instant the same way. Used on both tabs.
  const shortInstant = (value: Date) =>
    `${formatInstantDay(value)}, ${formatEventTime(eventInstantParts(value).time)}`;
  // "2026-10-03 08:46", in Manila, for the CSV exports: the spelling Excel
  // reads as a date and time, so the column sorts in time order.
  const csvInstant = (value: Date) => {
    const { day, time } = eventInstantParts(value);
    return `${day} ${time}`;
  };

  // One row per live runner, built in registrant-rows.ts, with the category
  // changes each has had (CATEGORY_CHANGE_PLAN.md) read in one query.
  const runners = buildRegistrantRows({
    event,
    statusRecords,
    changesByRunner: await categoryChangesByRunner(id),
    // And each order's delivery switches (LOGISTICS_CHANGE_PLAN.md), in one more.
    logisticsByOrder: await logisticsChangesByOrder(id),
    shortInstant,
    csvInstant,
  });

  // What each receipt may do about pickup and delivery, and what the switch
  // panels quote from (LOGISTICS_CHANGE_PLAN.md Revision 2). Read in full
  // here so opening a switch fetches nothing; the store re-checks all of it
  // under the event's locks on save.
  const switching = await readEventReceipts(id, actor.orgId, { recordPaid: permissions.validate });
  if (!switching) return <AdminNotFound {...EVENT_NOT_FOUND} />;

  // The Unpaid checkouts tab (UNPAID_ORDERS_PLAN.md Batch 3): online orders
  // never paid, which the list above leaves out by the owner's rule. A
  // separate query with its own filter, so these rows can never reach the
  // registrants table, its count or its CSV export. Gated by the same
  // registration:view as the screen, which every event role holds: staff do
  // this follow-up, so it does not fall on the admins.
  const unpaidOrders = await prisma.registration.findMany({
    where: { eventId: id, ...unpaidFollowUpWhere(event.date, today()) },
    // Oldest first, as the registrants tab lists, so No. 1 is at the top.
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      orderRef: true,
      status: true,
      paymentMethod: true,
      totalAmount: true,
      createdAt: true,
      expiredAt: true,
      // A payment link moves the deadline (decision D4).
      holdUntil: true,
      runners: {
        where: { deletedAt: null },
        orderBy: { runnerNo: 'asc' },
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
    },
  });
  // The latest follow-up per order (UNPAID_FOLLOWUP_PLAN.md Batch 1), from
  // the trail in one query, as the status records above are.
  const followUps = await latestFollowUps(actor.orgId, id);
  const now = new Date();
  const unpaidCheckouts: UnpaidCheckout[] = unpaidOrders
    // A cancelled order belongs here only if it was cancelled unpaid; one
    // paid first is a registrant (Batch 2).
    .filter(order => order.status !== 'CANCELLED' || isCancelledCheckout(order, statusRecords.get(order.id)))
    .map((order, index) => {
      // The first runner filled in the form, so their email and phone are the
      // order's contact, the same person the receipt would have gone to.
      const contact = order.runners[0];
      const status = order.status as UnpaidCheckout['status'];
      const cancel = status === 'CANCELLED' ? statusRecords.get(order.id) : undefined;
      const deadline = expiresBy(order.createdAt, order.holdUntil);
      const followUp = followUps.get(order.id);
      return {
        id: order.id,
        // The order's place in this list, oldest first, fixed here for the
        // registrants tab's reason (regNo above): filtering or sorting never
        // renumbers it.
        listNo: index + 1,
        orderRef: order.orderRef,
        runnerNames: order.runners.map(r => `${r.firstName} ${r.lastName}`),
        contactName: `${contact.firstName} ${contact.lastName}`,
        contactEmail: contact.email,
        contactPhone: contact.phone,
        paymentMethod: paymentMethodLabel(order.paymentMethod).toUpperCase(),
        totalAmount: order.totalAmount,
        createdAt: order.createdAt.toISOString(),
        createdLabel: shortInstant(order.createdAt),
        submittedAt: csvInstant(order.createdAt),
        status,
        // Read beside the Awaiting payment / Expired / Cancelled badge.
        statusDetail: cancel
          ? `By ${cancel.by} · ${shortInstant(new Date(cancel.at))}`
          : status === 'EXPIRED'
            ? order.expiredAt ? shortInstant(order.expiredAt) : ''
            : deadline > now
              ? `Expires by ${shortInstant(deadline)}`
              // The sweep is late or was cut short (MAX_SWEEP); the next run takes it.
              : 'Expires at the next sweep',
        followUp: followUp ? { ...followUp, ago: followUpAgo(followUp.at, now) } : null,
        cancelReason: cancel?.reason ?? null,
      };
    });
  // The tab's count is the orders still awaiting payment, never the expired
  // or cancelled ones it can also show.
  const unpaidRunners = unpaidCheckouts
    .filter(order => order.status === 'PENDING')
    .reduce((sum, order) => sum + order.runnerNames.length, 0);

  return (
    <>
      <DashboardHeader title="Registrants" crumbs={[{ label: 'Events', href: '/admin/events' }, { label: event.title }]} />

      <div className="admin-content">
        <RegistrantsTabs
          initialTab={initialTab}
          registrantCount={runners.length}
          unpaidCount={unpaidRunners}
          registrants={
            <RegistrantsTable
              runners={runners}
              eventId={id}
              eventTitle={event.title}
              raceDay={event.date}
              initialSearch={search ?? ''}
              permissions={permissions}
              switching={switching}
            />
          }
          unpaid={
            <UnpaidCheckoutsList
              orders={unpaidCheckouts}
              eventId={id}
              eventSlug={event.slug}
              eventTitle={event.title}
              canValidate={permissions.validate}
              canEmail={permissions.email}
            />
          }
        />
      </div>
    </>
  );
}
