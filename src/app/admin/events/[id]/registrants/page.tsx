import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { redirect } from 'next/navigation';
import RegistrantsTable from './RegistrantsTable';
import { runnerRef } from '@/lib/order-ref';
import { isPdfProof } from '@/lib/uploads';
import { EMAIL_KIND_LABELS, outstandingEmail } from '@/lib/email-delivery';
import {
  LOGISTICS_METHODS,
  asLogisticsMethod,
  deliveryZoneLabel,
  isBankTransfer,
  logisticsMethodLabel,
  paymentMethodLabel,
} from '@/lib/registration-codes';

export default async function RegistrantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // `?search=` prefills the table's search box. The marketing screen's
  // redemptions panel links here with an order reference in it, so tracing a
  // discount back to the people who used it is one click.
  searchParams: Promise<{ search?: string }>;
}) {
  const { id } = await params;
  const { search } = await searchParams;

  // Scoped to the signed-in organizer's own events, the way every admin route
  // is. This screen carries the most sensitive data in the app — every
  // runner's email, phone, birthdate, emergency contact and medical notes — and
  // an id in the URL is not proof it belongs to the browser's owner: without
  // the `organizerId` here, any approved organizer handed another's event id
  // could read their whole registrant list.
  //
  // A no-match reads as "Event not found." rather than "not yours", so the
  // screen cannot be used to confirm that some id exists. There is no super
  // admin branch because there is no super admin here: `src/proxy.ts` sends a
  // `SUPER_ADMIN` off `/admin/**` to `/superadmin` before this page runs.
  const auth = await getAuthCookie();
  if (!auth) redirect('/admin/login');

  // Fetch real runners for this event via the Registrations table
  const event = await prisma.event.findFirst({
    where: { id, organizerId: auth.id },
    include: {
      registrations: {
        include: {
          runners: {
            include: { category: true }
          }
        }
      }
    }
  });

  if (!event) {
    return (
      <div className="p-8 text-center text-secondary">
        Event not found.
      </div>
    );
  }

  // Flatten the runners from all registrations
  const runners: any[] = [];
  event.registrations.forEach(reg => {
    // Which transactional email this order still owes, decided once here from
    // the rule in lib/email-delivery.ts rather than re-derived in the table:
    // the same answer drives the row's mark, the backlog filter and the
    // manual-send modal, and three copies of it would eventually disagree.
    const pendingEmail = outstandingEmail(reg);
    reg.runners.forEach(runner => {
      runners.push({
        id: runner.id,
        registrationId: reg.id,
        orderRef: reg.orderRef,
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
        category: runner.category.name,
        distance: runner.category.distance,
        size: runner.singletSize,
        runningCommunity: runner.runningCommunity,
        status: reg.status,
        // When the abandoned-checkout sweep expired this order, or null on the
        // overwhelming majority of rows that were never swept. Carried so the
        // detail modal can say *when* rather than leaving EXPIRED unexplained
        // — see lib/pending-expiry.ts.
        expiredAt: reg.expiredAt ? reg.expiredAt.toISOString() : null,
        emergencyContactName: runner.emergencyContactName,
        emergencyContactPhone: runner.emergencyContactPhone,
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
        // fee they were charged, so the organizer needs to see it.
        deliveryZone: deliveryZoneLabel(reg.deliveryZone).toUpperCase(),
        deliveryAddress: reg.deliveryAddress || 'N/A',
        paymentMethod: paymentMethodLabel(reg.paymentMethod).toUpperCase(),
        // The branches the screen actually needs, decided from the code rather
        // than by matching the label back against a string.
        isDelivery:
          asLogisticsMethod(reg.logisticsMethod) === LOGISTICS_METHODS.DELIVERY,
        isBankTransfer: isBankTransfer(reg.paymentMethod),
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

  return (
    <>
      <header className="admin-header">
        <div className="flex items-center gap-4">
          <Link href="/admin/events" className="text-secondary hover:text-primary transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="admin-header-title">Registrants: {event.title}</h1>
        </div>
      </header>

      <div className="admin-content">
        <RegistrantsTable runners={runners} eventId={id} initialSearch={search ?? ''} />
      </div>
    </>
  );
}
