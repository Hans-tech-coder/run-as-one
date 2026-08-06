import React from 'react';
import { notFound } from 'next/navigation';
import db from '@/lib/db';
import RegistrationWizardClient from './RegistrationWizardClient';

export default async function RegisterPage(props: { 
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await props.params;
  const search = await props.searchParams;
  const orderRef = search.orderRef as string | undefined;
  
  const event = await db.event.findUnique({
    where: { id },
    include: { categories: true }
  });

  if (!event) {
    notFound();
  }

  let registration = null;
  if (orderRef) {
    registration = await db.registration.findUnique({
      where: { orderRef },
      include: { runners: true }
    });
  }

  return <RegistrationWizardClient event={event} eventId={id} registration={registration} />;
}
