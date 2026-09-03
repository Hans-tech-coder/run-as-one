import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import prisma from '@/lib/db';
import RegistrantsTable from './RegistrantsTable';

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
        status: reg.status,
        emergencyContactName: runner.emergencyContactName,
        emergencyContactPhone: runner.emergencyContactPhone,
        medicalConditions: runner.medicalConditions || 'None',
        logisticsMethod: reg.logisticsMethod,
        // The zone the runner declared at checkout — it decides which delivery
        // fee they were charged, so the organizer needs to see it.
        deliveryZone: reg.deliveryZone || '',
        deliveryAddress: reg.deliveryAddress || 'N/A',
        paymentMethod: reg.paymentMethod,
        proofOfPayment: reg.proofOfPayment,
        transactionNumber: reg.transactionNumber
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
