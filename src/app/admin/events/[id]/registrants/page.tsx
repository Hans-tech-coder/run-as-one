import React from 'react';
import prisma from '@/lib/db';
import { can, requireTeamActor } from '@/lib/actor';
import RegistrantsTable, { type RegistrantPermissions } from './RegistrantsTable';
import RegistrantsTabs, { type RegistrantsTab } from './RegistrantsTabs';
import UnpaidCheckoutsList, { type UnpaidCheckout } from './UnpaidCheckoutsList';
import { latestFollowUps, latestPaymentCorrections, latestStatusChanges } from '@/lib/activity-store';
import { followUpAgo } from '@/lib/follow-up';
import AdminNotFound from '../../../AdminNotFound';
import { EVENT_NOT_FOUND } from '../../event-not-found';
import { isBankTransfer, paymentMethodLabel } from '@/lib/registration-codes';
import { eventInstantParts, formatEventTime, formatInstantDay, today } from '@/lib/event-schedule';
import { expiresBy, isCancelledCheckout, listedRegistrationWhere, unpaidFollowUpWhere } from '@/lib/pending-expiry';
import { categoryChangesByRunner } from '@/lib/category-change-view';
import { logisticsChangesByOrder } from '@/lib/logistics-change-view';
import { readEventReceipts } from '@/lib/logistics-receipts';
import { buildRegistrantRows, type DuplicateRef } from './registrant-rows';
import { coverage, findLiveMatches, runnerKey } from '@/lib/runner-match';
import { ADD_ON_LINES_READ } from '@/lib/add-ons';
import { FIRST_MOVE } from '@/lib/paid-runners';
import { refundsForEvent } from '@/lib/refund-store';
import RefundsList from './RefundsList';
import { PaidToAccountsProvider } from './paid-to';
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
  // `?paidTo=untagged` (or `paymongo`, `account:<name>`) starts the *Paid to*
  // filter on: the remittance page's Untagged line links here with it.
  searchParams: Promise<{ search?: string; tab?: string; paidTo?: string }>;
}) {
  const { id } = await params;
  const { search, tab, paidTo } = await searchParams;
  const initialTab: RegistrantsTab = tab === 'unpaid' ? 'unpaid' : tab === 'refunds' ? 'refunds' : 'registrants';

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
      // The race's account names, for *Paid to* (PAYMENT_CHANNELS_PLAN.md
      // Batch 3): validating, recording, correcting and tagging offer these.
      bankAccounts: { select: { bankName: true }, orderBy: { sortOrder: 'asc' } },
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
            // Every runner the order charged for, removed and refunded ones
            // too, so the money split matches the refund quote's
            // (lib/paid-runners.ts). A removed runner stays in the table for
            // the audit trail (Runner.deletedAt) and never on this screen: the
            // rows leave them out (registrant-rows.ts). Each one's first move
            // says the category they checked out in.
            // Each runner's add-on lines (ADD_ONS_PLAN.md): the items for the
            // Add-ons column, filter, detail and CSV, and their money for the
            // per-runner split (runner-money.ts).
            include: {
              category: true,
              addOns: ADD_ON_LINES_READ,
              refund: { select: { status: true } },
              categoryChanges: FIRST_MOVE,
            }
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
    correctPayment: can(actor, 'registration:correct-payment', reach),
    refund: can(actor, 'registration:refund', reach),
    activity: can(actor, 'activity:view', { organizerId: actor.orgId }),
  };
  // Encoding a runner's order by hand (STAFF_REGISTRATION_PLAN.md): the same
  // holders as validating. A results-only race takes no registrations at all.
  const canCreate = can(actor, 'registration:create', reach) && !event.resultsOnly;

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
        select: { firstName: true, lastName: true, email: true, phone: true, birthdate: true },
      },
    },
  });
  // Who is on more than one live order (DUPLICATE_ORDERS_PLAN.md,
  // lib/runner-match.ts), for both tabs in one query: the registrants' chip
  // and the unpaid orders already covered by a payment elsewhere.
  const liveRunners = event.registrations.flatMap(reg => reg.runners.filter(r => !r.deletedAt));
  const matches = await findLiveMatches(prisma, id, [...liveRunners, ...unpaidOrders.flatMap(o => o.runners)]);
  const registrantsHref = (orderRef: string) => `/admin/events/${id}/registrants?search=${encodeURIComponent(orderRef)}`;
  const duplicatesByRunner = new Map<string, DuplicateRef[]>();
  for (const reg of event.registrations) {
    // Only a live order can double another one; a cancelled copy is no risk.
    const live = reg.status === 'PAID' || (reg.status === 'PENDING' && isBankTransfer(reg.paymentMethod));
    if (!live) continue;
    for (const runner of reg.runners) {
      const others = (matches.get(runnerKey(runner)) ?? []).filter(m => m.registrationId !== reg.id);
      if (others.length > 0) {
        duplicatesByRunner.set(
          runner.id,
          others.map(m => ({ orderRef: m.orderRef, status: m.status, href: registrantsHref(m.orderRef) })),
        );
      }
    }
  }
  const covers = coverage(unpaidOrders, matches);

  // One row per live runner, built in registrant-rows.ts, with the category
  // changes each has had (CATEGORY_CHANGE_PLAN.md) read in one query.
  const runners = buildRegistrantRows({
    event,
    statusRecords,
    changesByRunner: await categoryChangesByRunner(id),
    // And each order's delivery switches (LOGISTICS_CHANGE_PLAN.md), in one more.
    logisticsByOrder: await logisticsChangesByOrder(id),
    // And each order's latest payment correction (PAYMENT_CORRECTION_PLAN.md
    // Batch 2), in one more, for the detail modal's "Corrected" line.
    correctionsByOrder: await latestPaymentCorrections(actor.orgId, id),
    duplicatesByRunner,
    shortInstant,
    csvInstant,
  });

  // What each receipt may do about pickup and delivery, and what the switch
  // panels quote from (LOGISTICS_CHANGE_PLAN.md Revision 2). Read in full
  // here so opening a switch fetches nothing; the store re-checks all of it
  // under the event's locks on save.
  const switching = await readEventReceipts(id, actor.orgId, { recordPaid: permissions.validate });
  if (!switching) return <AdminNotFound {...EVENT_NOT_FOUND} />;

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
      // Runners already on a PAID order or a pending bank transfer elsewhere.
      // All of them: the order is hidden behind Show covered and leaves the
      // count, its status untouched, so it returns if that transfer is
      // rejected. Some of them: listed, with a note.
      const cover = covers.get(order.id);
      const fully = cover && cover.covered === cover.total;
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
        coveredBy: fully ? cover.byOrderRefs : [],
        coverNote:
          cover && !fully
            ? `${cover.covered} of ${cover.total} runners registered in ${cover.byOrderRefs.join(', ')}`
            : null,
      };
    });
  // The tab's count is the orders still awaiting payment, never the expired
  // or cancelled ones it can also show.
  const unpaidRunners = unpaidCheckouts
    .filter(order => order.status === 'PENDING' && order.coveredBy.length === 0)
    .reduce((sum, order) => sum + order.runnerNames.length, 0);

  // Refunds are money, so the tab is for those who may make one (D4).
  const refunds = permissions.refund ? await refundsForEvent(id) : null;

  return (
    <>
      <DashboardHeader title="Registrants" crumbs={[{ label: 'Events', href: '/admin/events' }, { label: event.title }]} />

      <div className="admin-content">
        <RegistrantsTabs
          initialTab={initialTab}
          registrantCount={runners.length}
          unpaidCount={unpaidRunners}
          refundCount={refunds?.filter(refund => refund.active).length ?? null}
          refunds={refunds ? <RefundsList refunds={refunds} /> : null}
          registrants={
            // The race's account names for *Paid to* (PAYMENT_CHANNELS_PLAN.md
            // Batch 3), read by the table's hooks and every modal that asks.
            <PaidToAccountsProvider accounts={event.bankAccounts.map(account => account.bankName)}>
            <RegistrantsTable
              runners={runners}
              eventId={id}
              eventTitle={event.title}
              raceDay={event.date}
              initialSearch={search ?? ''}
              initialPaidTo={paidTo}
              permissions={permissions}
              switching={switching}
              addRegistrationHref={canCreate ? `/admin/events/${id}/registrants/new` : undefined}
            />
            </PaidToAccountsProvider>
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
