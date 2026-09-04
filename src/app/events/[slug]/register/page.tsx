import React from 'react';
import { notFound, redirect } from 'next/navigation';
import db from '@/lib/db';
import { REGISTRATION_FORMS, asRegistrationForm } from '@/lib/registration-form';
import RegistrationWizardClient from './RegistrationWizardClient';
import BankTransferWizardClient from './BankTransferWizardClient';
import { approvedCommunityNames } from '@/lib/running-community-store';
import { requestCountry } from '@/lib/request-country';
import { canonicalEventPath, eventByParam } from '@/lib/event-slug';

export default async function RegisterPage(props: { 
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await props.params;
  const search = await props.searchParams;
  const orderRef = search.orderRef as string | undefined;
  
  // The approved clubs the picker suggests. Fetched here rather than from the
  // client so the list is in the first render — a runner who starts typing
  // straight away should not watch an empty dropdown while a request lands.
  const [event, communities] = await Promise.all([
    // Slug or cuid: links printed before slugs existed have to keep working,
    // and a half-finished registration is the worst place to hit a 404.
    db.event.findFirst({
      where: eventByParam(slug),
      include: {
        categories: true,
        bankAccounts: { orderBy: { sortOrder: 'asc' } },
      }
    }),
    approvedCommunityNames(),
  ]);

  // A starting guess for the phone fields' country code, from the request.
  const defaultCountry = await requestCountry();

  if (!event) {
    notFound();
  }

  // Send an old cuid link on to the readable URL, keeping whatever the runner
  // came back with — the success flag and order reference PayMongo appends.
  const query = new URLSearchParams(
    Object.entries(search).flatMap(([key, value]) =>
      value === undefined
        ? []
        : Array.isArray(value)
          ? value.map((item) => [key, item] as [string, string])
          : [[key, value] as [string, string]],
    ),
  ).toString();
  const canonical = canonicalEventPath(event, slug, '/register');
  if (canonical) {
    redirect(query ? `${canonical}?${query}` : canonical);
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
    return <BankTransferWizardClient
        event={event}
        eventId={event.id}
        registration={registration}
        communities={communities}
        defaultCountry={defaultCountry}
      />;
  }

  return <RegistrationWizardClient
        event={event}
        eventId={event.id}
        registration={registration}
        communities={communities}
        defaultCountry={defaultCountry}
      />;
}
