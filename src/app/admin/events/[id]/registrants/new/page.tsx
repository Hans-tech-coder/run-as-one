import prisma from '@/lib/db';
import { can, requireTeamActor } from '@/lib/actor';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { ADD_ON_ORDER } from '@/lib/add-on-stock';
import { addOnSalesClosed } from '@/lib/add-ons';
import { approvedCommunityNames } from '@/lib/running-community-store';
import AdminNotFound from '../../../../AdminNotFound';
import { EVENT_NOT_FOUND } from '../../../event-not-found';
import DashboardHeader from '@/app/admin/DashboardHeader';
import { PaidToAccountsProvider } from '../paid-to';
import StaffRegistrationForm from './StaffRegistrationForm';
import type { StaffEvent } from './staff-registration';
import { Lock } from 'lucide-react';
import type { Event } from '@prisma/client';
import { shownToRunners } from '@/lib/bib-medal';
import { hasFinished } from '@/lib/event-schedule';
import { isPublished } from '@/lib/event-visibility';
import {
  EVENT_FULL_MESSAGE,
  RESULTS_ONLY_MESSAGE,
  closedMessage,
  openingNote,
  pauseNote,
  registrationState,
  soleOpenCategory,
  takenSlotsByCategory,
  withSlotCounts,
} from '@/lib/registration-gate';

/**
 * Why the website would refuse any order for this race right now, worded as
 * its register page and checkout word it, or null while it takes sign-ups.
 */
function staffEntryStop(
  event: Event,
  categories: Parameters<typeof registrationState>[1],
  now: Date,
): { heading: string; message: string } | null {
  if (!isPublished(event, now)) {
    return { heading: 'This Race Is Not Published', message: 'The website does not take sign-ups for a draft or scheduled race.' };
  }
  switch (registrationState(event, categories, hasFinished(event), now)) {
    case 'EXTERNAL':
      return { heading: 'Sign-Ups Run Elsewhere', message: RESULTS_ONLY_MESSAGE };
    case 'FINISHED':
      return { heading: 'This Race Has Been Held', message: 'This race has already been held, so registration is closed.' };
    case 'CLOSED':
      return { heading: 'Registration Is Closed', message: closedMessage(event) };
    case 'PAUSED':
      return { heading: 'Registration Is Paused', message: pauseNote(event) };
    case 'SCHEDULED':
      return { heading: 'Registration Has Not Opened', message: openingNote(event) };
    case 'FULL':
      return { heading: 'This Race Is Full', message: EVENT_FULL_MESSAGE };
    default:
      return null;
  }
}

/**
 * /admin/events/[id]/registrants/new — staff encode a runner's order by hand
 * (STAFF_REGISTRATION_PLAN.md step 4), for a runner who registered over
 * Messenger or a call.
 *
 * Reached from the registrants screen's *Add Registration* button, which only
 * `registration:create` holders see. Anyone else — and a race outside the
 * signed-in organizer — reads "Event not found", as the registrants screen
 * does; the route refuses them too. Only add-ons on sale now are offered,
 * since the save re-reads them against the clock and the stock anyway.
 */
export default async function NewRegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireTeamActor();

  const found = await prisma.event.findFirst({
    where: { id, organizerId: actor.orgId },
    include: {
      categories: { orderBy: CATEGORY_ORDER },
      addOns: { orderBy: ADD_ON_ORDER },
      bankAccounts: { select: { bankName: true }, orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!found || !can(actor, 'registration:create', { organizerId: actor.orgId, eventId: id })) {
    return <AdminNotFound {...EVENT_NOT_FOUND} />;
  }

  const now = new Date();

  // The same options and counts the website's wizard reads: a Bib + Medal not
  // yet open is not offered, a Full it replaced reads closed, and a sold-out
  // option is left out. The save checks all of it again under the lock.
  const counted = withSlotCounts(
    shownToRunners(found.categories, now),
    await takenSlotsByCategory(found.categories.map(category => category.id)),
    now,
  );

  // A race the website would not take an order for is stopped here, before
  // staff type a whole order and attach a screenshot only to be refused.
  const stop = staffEntryStop(found, counted, now);
  if (stop) {
    return (
      <AdminNotFound
        title="Add Registration"
        heading={stop.heading}
        body={`${stop.message} Nothing can be added from here until it takes sign-ups again.`}
        icon={Lock}
        homeHref={`/admin/events/${id}/registrants`}
        homeLabel="Back to Registrants"
      />
    );
  }

  const open = counted.filter(category => !category.isFull);
  const soldOut = counted.filter(category => category.isFull).map(category => category.name);
  const event: StaffEvent = {
    id: found.id,
    title: found.title,
    date: found.date,
    eventType: found.eventType,
    categories: open.map(category => ({
      id: category.id,
      name: category.name,
      price: category.price,
      inclusions: category.inclusions,
      slotsLeft: category.slotsLeft,
    })),
    soleCategoryId: soleOpenCategory(counted)?.id ?? '',
    // On sale now; which category each is open to, the form decides.
    addOns: found.addOns
      .filter(item => item.active && !addOnSalesClosed(item, now))
      .map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        optionKind: item.optionKind,
        options: item.options,
        maxPerRunner: item.maxPerRunner,
        categoryIds: item.categoryIds,
      })),
    bankAccounts: found.bankAccounts.map(account => account.bankName),
    communities: await approvedCommunityNames(),
    pickup: found.logisticsPickup,
    logisticsDeliveryFeeInside: found.logisticsDeliveryFeeInside,
    logisticsDeliveryFeeOutside: found.logisticsDeliveryFeeOutside,
    province: found.province,
    location: found.location,
    format: found.format,
  };

  return (
    <>
      <DashboardHeader
        title="Add Registration"
        crumbs={[
          { label: 'Events', href: '/admin/events' },
          { label: found.title, href: `/admin/events/${id}/registrants` },
        ]}
      />
      <div className="admin-content max-w-4xl mx-auto">
        <p className="m-0 mb-6 text-sm text-secondary max-w-prose">
          For a runner who registered over Messenger or a call. Enter what they sent, attach their payment screenshot,
          and the order waits for validation like a bank transfer from the website. Prices, promos and slots are the
          website’s.
          {soldOut.length > 0 && ` Sold out, so not offered: ${soldOut.join(', ')}.`}
        </p>
        <PaidToAccountsProvider accounts={event.bankAccounts}>
          <StaffRegistrationForm
            event={event}
            canValidate={can(actor, 'registration:validate', { organizerId: actor.orgId, eventId: id })}
          />
        </PaidToAccountsProvider>
      </div>
    </>
  );
}
