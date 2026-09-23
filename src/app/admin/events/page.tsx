import React from 'react';
import db from '@/lib/db';
import { can, reachableEvents, requireTeamActor } from '@/lib/actor';
import { hasFinished, today } from '@/lib/event-schedule';
import {
  registrationState,
  takenSlotsByCategory,
  withSlotCounts,
} from '@/lib/registration-gate';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { pacersNeedingCodeSentByEvent } from '@/lib/pacer-store';
import EventsTableClient from './EventsTableClient';
import DashboardHeader from '@/app/admin/DashboardHeader';

export default async function AdminEventsPage() {
  const actor = await requireTeamActor();

  const events = await db.event.findMany({
    // Every event of the organizer for its owner; only the assigned races for
    // a STAFF member (lib/actor.ts).
    where: reachableEvents(actor),
    include: {
      categories: { orderBy: CATEGORY_ORDER },
      client: { select: { id: true, name: true } },
      // The delete confirmation names how many registrations go with the
      // event, because removing one now removes those rows too.
      _count: { select: { registrations: true } },
    },
    // Ties only; the list's real order is worked out below.
    orderBy: { createdAt: 'asc' },
  });

  // **The order staff read the list in**: races still to come first, the
  // soonest at the top, then the races already run, the most recent first.
  // What staff open this screen for is the next race, and by creation date a
  // race added late for next week sank under ones months away. Finished races
  // stay reachable (results, remittances) without crowding the live ones.
  const day = today();
  const ordered = [...events].sort((a, b) => {
    const aDone = hasFinished(a, day);
    const bDone = hasFinished(b, day);
    if (aDone !== bDone) return aDone ? 1 : -1;
    return aDone ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });

  // Whether each event is taking sign-ups, and why not. Worked out here rather
  // than in the table because it is a database count: one grouped query across
  // every option on the page, not one per row.
  const taken = await takenSlotsByCategory(
    ordered.flatMap((event) => event.categories.map((category) => category.id)),
  );

  // Who has registered for each race, in people rather than orders — a group
  // of five is five runners — split into the paid and the still pending, the
  // same two statuses that hold a slot. Cancelled, refunded and expired orders
  // hold nobody's place and are not counted; removed runners never are.
  const orders = await db.registration.findMany({
    where: {
      eventId: { in: ordered.map((event) => event.id) },
      status: { in: ['PAID', 'PENDING'] },
      deletedAt: null,
    },
    select: {
      eventId: true,
      status: true,
      _count: { select: { runners: { where: { deletedAt: null } } } },
    },
  });
  const registered = new Map<string, { paid: number; pending: number }>();
  for (const order of orders) {
    const tally = registered.get(order.eventId) ?? { paid: 0, pending: 0 };
    if (order.status === 'PAID') tally.paid += order._count.runners;
    else tally.pending += order._count.runners;
    registered.set(order.eventId, tally);
  }

  // How many pacers of each race still need their code sent by hand, for the
  // count on the row menu's Pacers item. One grouped query for the whole page,
  // like the slot counts above it — a query per row is how a list of twenty
  // races stops loading.
  const pacersNotSent = await pacersNeedingCodeSentByEvent(
    actor.orgId,
    ordered.map(event => event.id),
  );

  const rows = ordered.map((event, index) => ({
    ...event,
    // The No. column: the event's place in the order above, fixed here so a
    // search, a filter or a column sort never renumbers the list.
    listNo: index + 1,
    registered: registered.get(event.id) ?? { paid: 0, pending: 0 },
    registrationState: registrationState(
      event,
      withSlotCounts(event.categories, taken),
      hasFinished(event, day),
    ),
    // What this person may do from the row's menu, asked with the same can()
    // the route behind each item asks — so a validator is never offered
    // Delete Event only to be refused by it. Registrants and Manage Results
    // stay for everyone: every role may read both.
    access: {
      edit: can(actor, 'event:edit', { organizerId: actor.orgId, eventId: event.id }),
      delete: can(actor, 'event:delete', { organizerId: actor.orgId, eventId: event.id }),
      // The same verb the Pacers screen and its routes ask, so nobody is
      // offered a page that would answer "Event not found."
      pacers: can(actor, 'promo:manage', { organizerId: actor.orgId, eventId: event.id }),
    },
    pacersNotSent: pacersNotSent.get(event.id) ?? 0,
  }));

  return (
    <>
      <DashboardHeader title="Events" />

      <div className="admin-content">
        <EventsTableClient
          events={rows}
          canCreate={can(actor, 'event:create', { organizerId: actor.orgId })}
          // Clients are Run As One's own records (EventClientField draws its
          // picker on the same permission), so only they may filter by one.
          canFilterByClient={can(actor, 'platform:manage', { organizerId: actor.orgId })}
        />
      </div>
    </>
  );
}
