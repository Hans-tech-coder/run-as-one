import prisma from '@/lib/db';
import { can, requireTeamActor } from '@/lib/actor';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { ADD_ON_ORDER } from '@/lib/add-on-stock';
import { addOnSalesClosed } from '@/lib/add-ons';
import AdminNotFound from '../../../../AdminNotFound';
import { EVENT_NOT_FOUND } from '../../../event-not-found';
import DashboardHeader from '@/app/admin/DashboardHeader';
import { PaidToAccountsProvider } from '../paid-to';
import StaffRegistrationForm from './StaffRegistrationForm';
import type { StaffEvent } from './staff-registration';

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
  const event: StaffEvent = {
    id: found.id,
    title: found.title,
    date: found.date,
    eventType: found.eventType,
    categories: found.categories.map(category => ({
      id: category.id,
      name: category.name,
      price: category.price,
      inclusions: category.inclusions,
    })),
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
        </p>
        <PaidToAccountsProvider accounts={event.bankAccounts}>
          <StaffRegistrationForm event={event} />
        </PaidToAccountsProvider>
      </div>
    </>
  );
}
