import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CalendarClock, ChevronRight, Users } from 'lucide-react';
import db from '@/lib/db';
import { IconBadge, PageOrbs, StatusPanel } from '@/components/StatusPanel';
import { REGISTRATION_FORMS, asRegistrationForm } from '@/lib/registration-form';
import RegistrationWizardClient from './RegistrationWizardClient';
import BankTransferWizardClient from './BankTransferWizardClient';
import { approvedCommunityNames } from '@/lib/running-community-store';
import { requestCountry } from '@/lib/request-country';
import { canonicalEventPath, eventByParam } from '@/lib/event-slug';
import { hasFinished } from '@/lib/event-schedule';
import {
  EVENT_FULL_MESSAGE,
  pauseNote,
  registrationState,
  takenSlotsByCategory,
  withSlotCounts,
} from '@/lib/registration-gate';

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

  // A race that has already been run cannot be entered. The event page no
  // longer offers the button, but the URL is still typeable and still sitting
  // in someone's history, and that page is where the explanation lives.
  //
  // An orderRef is let through: that is a runner coming back from the payment
  // gateway to see what they already paid for, not someone starting a new
  // registration, and bouncing them would lose them their receipt.
  if (!orderRef && hasFinished(event)) {
    redirect(`/events/${event.slug}`);
  }

  // How full each option is, attached to the categories the wizards already
  // receive. Done here rather than in the wizard because the wizard is a client
  // component and this is a database count — and because the whole event may be
  // closed, which has to be decided before a wizard is rendered at all.
  const categories = withSlotCounts(
    event.categories,
    await takenSlotsByCategory(event.categories.map(category => category.id)),
  );
  const state = registrationState(event, categories, hasFinished(event));

  // An organizer's hold, or every option sold out. Both stop the wizard here
  // rather than letting a runner fill in three steps and be refused by the
  // checkout route — which would still refuse them, because that route counts
  // again inside its own write.
  //
  // As with the finished check above, a runner coming back from the payment
  // gateway with an orderRef is let through: they are looking at something they
  // already paid for, and a hold placed since then must not hide their receipt.
  if (!orderRef && (state === 'PAUSED' || state === 'FULL')) {
    return (
      <RegistrationClosed
        event={event}
        heading={state === 'PAUSED' ? 'Registration Is Paused' : 'This Race Is Full'}
        message={state === 'PAUSED' ? pauseNote(event) : EVENT_FULL_MESSAGE}
        icon={state === 'PAUSED' ? <CalendarClock size={30} /> : <Users size={30} />}
      />
    );
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
        event={{ ...event, categories }}
        eventId={event.id}
        registration={registration}
        communities={communities}
        defaultCountry={defaultCountry}
      />;
  }

  return <RegistrationWizardClient
        event={{ ...event, categories }}
        eventId={event.id}
        registration={registration}
        communities={communities}
        defaultCountry={defaultCountry}
      />;
}

/**
 * What stands here when the race is still ahead but sign-ups are not open —
 * the organizer has paused them, or every option has sold out.
 *
 * A full page rather than a redirect back to the event: the runner typed or
 * followed a link to *register*, and bouncing them somewhere else without a
 * word makes the site look broken. It is the same StatusPanel that carries
 * /coming-soon and the 404, so a stop is recognisably part of this site, and it
 * ends on the two things still worth doing — read the event, or find another
 * race.
 */
function RegistrationClosed({
  event,
  heading,
  message,
  icon,
}: {
  event: { slug: string; title: string };
  heading: string;
  message: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden">
      <PageOrbs />

      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center">
        <StatusPanel>
          <div className="flex flex-col items-center text-center">
            <IconBadge>{icon}</IconBadge>

            <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-[0.3em] text-secondary">
              {event.title}
            </p>
            <h1 className="mb-3 bg-gradient-to-r from-white to-white/60 bg-clip-text text-2xl font-black uppercase tracking-wide text-transparent text-balance sm:text-3xl">
              {heading}
            </h1>
            <p className="m-0 max-w-md text-base leading-relaxed text-secondary">
              {message}
            </p>
          </div>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href={`/events/${event.slug}`}
              className="btn-gradient group w-full shrink-0 justify-center whitespace-nowrap rounded-[16px] px-8 py-4 text-center text-base no-underline shadow-xl shadow-accent-orange/20 sm:w-auto"
            >
              <span>Back To This Event</span>
              <ChevronRight
                size={18}
                aria-hidden="true"
                className="shrink-0 transition-transform group-hover:translate-x-1"
              />
            </Link>
            <Link
              href="/events"
              className="flex min-h-[56px] w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[16px] border border-white/10 bg-white/[0.04] px-5 py-4 text-center text-sm text-white no-underline transition-colors duration-200 hover:border-accent-orange/40 hover:bg-white/[0.08] sm:w-auto"
            >
              <span>Browse Other Races</span>
            </Link>
          </div>
        </StatusPanel>
      </div>
    </div>
  );
}
