import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import prisma from '@/lib/db';
import RegistrantsTable from './RegistrantsTable';
import {
  LOGISTICS_METHODS,
  asLogisticsMethod,
  deliveryZoneLabel,
  isBankTransfer,
  logisticsMethodLabel,
  paymentMethodLabel,
} from '@/lib/registration-codes';

export default async function RegistrantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch real runners for this event via the Registrations table
  const event = await prisma.event.findUnique({
    where: { id },
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
    reg.runners.forEach(runner => {
      runners.push({
        id: runner.id,
        registrationId: reg.id,
        orderRef: reg.orderRef,
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
        transactionNumber: reg.transactionNumber,
        consentGiven: reg.consentGiven,
        consentGivenAt: reg.consentGivenAt
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
        <RegistrantsTable runners={runners} eventId={id} />
      </div>
    </>
  );
}
