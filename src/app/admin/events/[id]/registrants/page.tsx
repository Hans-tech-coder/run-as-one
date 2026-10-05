import React from 'react';
import prisma from '@/lib/db';
import { can, requireTeamActor } from '@/lib/actor';
import RegistrantsTable, { type RegistrantPermissions } from './RegistrantsTable';
import RegistrantsTabs, { type RegistrantsTab } from './RegistrantsTabs';
import UnpaidCheckoutsList, { type UnpaidCheckout } from './UnpaidCheckoutsList';
import { latestStatusChanges } from '@/lib/activity-store';
import AdminNotFound from '../../../AdminNotFound';
import { EVENT_NOT_FOUND } from '../../event-not-found';
import { runnerRef } from '@/lib/order-ref';
import { isPdfProof } from '@/lib/uploads';
import { EMAIL_KIND_LABELS, outstandingEmail } from '@/lib/email-delivery';
import {
  LOGISTICS_METHODS,
  asLogisticsMethod,
  deliveryZoneLabelFor,
  isBankTransfer,
  isComplimentary,
  logisticsMethodLabel,
  paymentMethodLabel,
} from '@/lib/registration-codes';
import { DISCOUNT_TYPES, asDiscountType } from '@/lib/discount';
import {
  GUARDIAN_RELATIONSHIP_LABELS,
  ageOn,
  asGuardianRelationship,
  guardianLine,
  needsGuardianConsent,
} from '@/lib/minor-consent';
import {
  eventInstantParts,
  formatEventInstant,
  formatEventTime,
  formatInstantDay,
  today,
} from '@/lib/event-schedule';
import { expiresBy, listedRegistrationWhere, unpaidFollowUpWhere } from '@/lib/pending-expiry';
import { formatRunnerAddress } from '@/lib/runner-address';
import { shipmentsFor } from '@/app/events/[slug]/register/delivery-split';
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

  // Flatten the runners from all registrations
  const runners: any[] = [];
  event.registrations.forEach(reg => {
    // Which transactional email this order still owes, decided once here from
    // the rule in lib/email-delivery.ts rather than re-derived in the table:
    // the same answer drives the row's mark, the backlog filter and the
    // manual-send modal, and three copies of it would eventually disagree.
    const pendingEmail = outstandingEmail(reg);
    // A split order (RUNNER_ADDRESS_PLAN.md Batch 2) stores no one delivery
    // address: each household is its own parcel, shipped to the home address
    // its runners gave. Grouped here with the same rule the checkout charged
    // by, so each row can say where its own kit goes and in which zone.
    const shipments = reg.deliverySplit ? shipmentsFor(event, reg.runners) : null;
    reg.runners.forEach((runner, runnerIndex) => {
      const shipment = shipments?.find(s => s.runners.includes(runnerIndex));
      runners.push({
        id: runner.id,
        registrationId: reg.id,
        // This runner's permanent place in the registration order — 1 is the
        // first person who ever registered for this event. It is a property of
        // the registrant rather than of the view, so it is assigned here off
        // the ordered fetch and travels with the row: filter the table down to
        // the unpaid orders and the numbers still read 3, 7, 12, which says
        // who those people are. A row index would have renumbered them 1, 2, 3
        // and said nothing at all.
        //
        // Derived from the order rather than stored, so it is a reading of the
        // list as it stands and not a bib number: cancel an early order and
        // everyone behind it shifts up by one. A number that has to survive
        // that would need a column of its own.
        regNo: runners.length + 1,
        orderRef: reg.orderRef,
        // When the order was placed: the moment the registration form was
        // submitted, which for an online payment is when the runner went to
        // checkout, not when the money arrived. Every runner of a group shares
        // it, since they were registered in one submission.
        registeredAtLabel: shortInstant(reg.createdAt),
        registeredAt: csvInstant(reg.createdAt),
        runnerNo: runner.runnerNo,
        // One orderRef covers the whole order, so on a screen with one row per
        // runner it cannot say which of them this is — unless the order holds
        // only one runner, where there is nothing to tell apart and the bare
        // order reference is the answer. Built here rather than in the table so
        // the reference the admin reads is the same string the runner was
        // emailed — see lib/order-ref.ts.
        runnerRef: runnerRef(reg.orderRef, runner.runnerNo, reg.runners.length),
        firstName: runner.firstName,
        lastName: runner.lastName,
        name: `${runner.firstName} ${runner.lastName}`,
        email: runner.email,
        phone: runner.phone,
        gender: runner.gender,
        birthdate: runner.birthdate,
        // Guardian consent (GUARDIAN_CONSENT_PLAN.md Batch 4). Whether this
        // runner is a minor is decided here, against the race day, with the
        // same rule the wizards and the checkout routes use — never re-derived
        // from the guardian columns, because a row from before Batch 3, or a
        // birthdate staff corrected later, is a minor with none on file, and
        // that is exactly the row the organizer has to be told about.
        isMinor: needsGuardianConsent(runner.birthdate, event.date),
        ageOnRaceDay: ageOn(runner.birthdate, event.date),
        guardianName: runner.guardianName,
        guardianRelationship: asGuardianRelationship(runner.guardianRelationship),
        guardianRelationshipLabel: (() => {
          const known = asGuardianRelationship(runner.guardianRelationship);
          return known ? GUARDIAN_RELATIONSHIP_LABELS[known] : null;
        })(),
        guardianLine: guardianLine(runner.guardianName, runner.guardianRelationship),
        // Worded on the server, in Manila time, so the modal and the CSV read
        // the same instant the same way on every organizer's machine.
        guardianConsentAt: runner.guardianConsentAt ? runner.guardianConsentAt.toISOString() : null,
        guardianConsentAtLabel: runner.guardianConsentAt
          ? formatEventInstant(runner.guardianConsentAt)
          : null,
        category: runner.category.name,
        distance: runner.category.distance,
        size: runner.singletSize,
        runningCommunity: runner.runningCommunity,
        status: reg.status,
        // The latest recorded change to that status — who, when, and to what.
        // statusProvenance (lib/activity.ts) only names the person when it
        // still agrees with the status above.
        statusRecord: statusRecords.get(reg.id) ?? null,
        // When the abandoned-checkout sweep expired this order, or null on the
        // overwhelming majority of rows that were never swept. Carried so the
        // detail modal can say *when* rather than leaving EXPIRED unexplained
        // — see lib/pending-expiry.ts.
        expiredAt: reg.expiredAt ? reg.expiredAt.toISOString() : null,
        emergencyContactName: runner.emergencyContactName,
        emergencyContactPhone: runner.emergencyContactPhone,
        // The runner's home address (RUNNER_ADDRESS_PLAN.md). The four parts
        // raw, for the edit modal to PUT back, and joined once for the table,
        // the detail modal and the CSV. Empty on rows from before it was
        // collected, never a display word, for the same reason as medical
        // conditions below.
        addressProvince: runner.addressProvince ?? '',
        addressCity: runner.addressCity ?? '',
        addressBarangay: runner.addressBarangay ?? '',
        addressStreet: runner.addressStreet ?? '',
        homeAddress: formatRunnerAddress(runner),
        // Kept raw, not defaulted to a readable "None": the edit modal PUTs
        // this row straight back, so a display word here would be saved as the
        // runner's actual medical history. The table, the modal and the export
        // each supply their own wording for an empty answer.
        medicalConditions: runner.medicalConditions || '',
        // The three coded columns arrive here as codes (BANK_TRANSFER,
        // DELIVERY, INSIDE) and leave as the uppercase words a person reads.
        // Done once, here, so the table, the filters, the detail modal and the
        // CSV export can never format them three different ways again — and
        // uppercase, because on this screen they are stored data sitting beside
        // a runner's uppercase name, not a choice being offered.
        logisticsMethod: logisticsMethodLabel(reg.logisticsMethod).toUpperCase(),
        // The zone the runner declared at checkout — it decides which delivery
        // fee they were charged, so the organizer needs to see it. Blank when
        // both zones cost the same, since the runner was never asked.
        deliveryZone: deliveryZoneLabelFor(event, shipment ? shipment.zone : reg.deliveryZone).toUpperCase(),
        deliveryAddress: (shipment ? formatRunnerAddress(shipment.address) : reg.deliveryAddress) || 'N/A',
        deliverySplit: reg.deliverySplit,
        paymentMethod: paymentMethodLabel(reg.paymentMethod).toUpperCase(),
        // The branches the screen actually needs, decided from the code rather
        // than by matching the label back against a string.
        isDelivery:
          asLogisticsMethod(reg.logisticsMethod) === LOGISTICS_METHODS.DELIVERY,
        isBankTransfer: isBankTransfer(reg.paymentMethod),
        // A free pacer entry, read from the discount this order snapshotted
        // rather than from the promo code, which staff may since have paused
        // or deleted (PACER_DISCOUNT_PLAN.md Batch 3). Decided here for the
        // same reason the two branches above are: the table is a client
        // island, and matching a label back against a string is how a screen
        // starts disagreeing with the database.
        isPacer: asDiscountType(reg.discountType) === DISCOUNT_TYPES.PACER,
        // ₱0 and nothing to validate. The chip above says *why* it was free;
        // this says how it was settled, and it is what stops the detail modal
        // printing a bare COMPLIMENTARY nobody can interpret.
        isComplimentary: isComplimentary(reg.paymentMethod),
        proofOfPayment: reg.proofOfPayment,
        // Whether that proof is a PDF rather than a photo. Decided here, off
        // the stored pathname, because the module that knows the rule imports
        // the Blob SDK and the table is a client island.
        proofIsPdf: isPdfProof(reg.proofOfPayment),
        transactionNumber: reg.transactionNumber,
        consentGiven: reg.consentGiven,
        consentGivenAt: reg.consentGivenAt,
        // The name the person submitting typed under the tick. Null on any
        // registration made before it was asked for, which the detail modal
        // says rather than leaving a blank line.
        consentSignature: reg.consentSignature,
        // The payment validator's own notes on this order. Internal, so they
        // ride the row but never the CSV export the organizer hands out and
        // never an email. Carried on every runner of a group because the note
        // is about the order all of them are on.
        remarks: reg.remarks,
        remarksBy: reg.remarksBy,
        // Serialized here rather than in the client component: the table is a
        // client island and a Date crossing that boundary arrives as a string
        // anyway, so it is made one deliberately.
        remarksAt: reg.remarksAt ? reg.remarksAt.toISOString() : null,
        // Email delivery, on every runner of the order for the same reason the
        // remarks are: the email is about the order, and a mark that lit up on
        // one member of a group would leave the other four looking fine.
        emailPending: pendingEmail !== null,
        emailPendingKind: pendingEmail,
        emailPendingLabel: pendingEmail ? EMAIL_KIND_LABELS[pendingEmail] : null,
        // Resend's own words for the last failure — a quota stop reads
        // differently from a bad address, and the modal shows which.
        lastEmailError: reg.lastEmailError,
        receivedEmailSentAt: reg.receivedEmailSentAt ? reg.receivedEmailSentAt.toISOString() : null,
        confirmationEmailSentAt: reg.confirmationEmailSentAt
          ? reg.confirmationEmailSentAt.toISOString()
          : null,
        manualEmailSentAt: reg.manualEmailSentAt ? reg.manualEmailSentAt.toISOString() : null,
        manualEmailSentBy: reg.manualEmailSentBy,
        // The order's money, carried on every runner of it for the same reason
        // the remarks are: it belongs to the order, not to one member. Only
        // what a person reconciling a payment needs — the discount explains why
        // a transfer came in short, and the total is what it should have been.
        promoCode: reg.promoCode,
        discountAmount: reg.discountAmount,
        totalAmount: reg.totalAmount
      });
    });
  });

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
      runners: {
        where: { deletedAt: null },
        orderBy: { runnerNo: 'asc' },
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
    },
  });
  const now = new Date();
  const unpaidCheckouts: UnpaidCheckout[] = unpaidOrders
    .map((order, index) => {
      // The first runner filled in the form, so their email and phone are the
      // order's contact, the same person the receipt would have gone to.
      const contact = order.runners[0];
      const expired = order.status === 'EXPIRED';
      const deadline = expiresBy(order.createdAt);
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
        expired,
        // Read beside the Awaiting payment / Expired badge.
        statusDetail: expired
          ? order.expiredAt ? shortInstant(order.expiredAt) : ''
          : deadline > now
            ? `Expires by ${shortInstant(deadline)}`
            // The sweep is late or was cut short (MAX_SWEEP); the next run takes it.
            : 'Expires at the next sweep',
      };
    });
  const unpaidRunners = unpaidCheckouts
    .filter(order => !order.expired)
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
              raceDay={event.date}
              initialSearch={search ?? ''}
              permissions={permissions}
            />
          }
          unpaid={<UnpaidCheckoutsList orders={unpaidCheckouts} eventId={id} />}
        />
      </div>
    </>
  );
}
