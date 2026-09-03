import React from 'react';
import { notFound } from 'next/navigation';
import db from '@/lib/db';
import { REGISTRATION_FORMS, asRegistrationForm } from '@/lib/registration-form';
import RegistrationWizardClient from './RegistrationWizardClient';
import BankTransferWizardClient from './BankTransferWizardClient';
import { approvedCommunityNames } from '@/lib/running-community-store';

export default async function RegisterPage(props: { 
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await props.params;
  const search = await props.searchParams;
  const orderRef = search.orderRef as string | undefined;
  
  // The approved clubs the picker suggests. Fetched here rather than from the
  // client so the list is in the first render — a runner who starts typing
  // straight away should not watch an empty dropdown while a request lands.
  const [event, communities] = await Promise.all([
    db.event.findUnique({
      where: { id },
      include: { categories: true }
    }),
    approvedCommunityNames(),
  ]);

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

  // Which checkout this event's organizer chose. asRegistrationForm() falls back
  // to ONLINE for anything unrecognised, so a bad value can never leave the page
  // rendering no wizard at all.
  const form = asRegistrationForm(event.registrationForm);

  if (form === REGISTRATION_FORMS.BANK_TRANSFER) {
    return <BankTransferWizardClient event={event} eventId={id} registration={registration} communities={communities} />;
  }

  return <RegistrationWizardClient event={event} eventId={id} registration={registration} communities={communities} />;
}
