import 'server-only';
import prisma from '@/lib/db';
import { reachableEvents, type Actor } from '@/lib/actor';
import { soonestFirst, today, upcomingEvents } from '@/lib/event-schedule';
import { awaitingVerificationWhere, heldPlacesByCategory } from '@/lib/pending-expiry';
import { LOGISTICS_CHANGE_STATUSES } from '@/lib/logistics-change';
import { MOVED_CHANGE_STATUSES } from '@/lib/settlement-store';

/**
 * Everything the Overview (`page.tsx`) shows, read in one go (OVERVIEW_PLAN.md).
 *
 * **Every figure is counted by the database.** The page used to load every PAID
 * order of every race, with every runner on it, to add up four numbers in
 * JavaScript — a page that got slower with every order the platform took. Now
 * it is a fixed handful of aggregates, counts and `take`-bounded lists, run
 * together, however many orders there are.
 */

/** How many of the oldest bank transfers the queue lists; the heading counts them all. */
const QUEUE_ROWS = 5;

export type OverviewData = Awaited<ReturnType<typeof loadOverview>>;
export type OverviewOrder = OverviewData['queue'][number];
export type OverviewLiveRow = OverviewData['liveRows'][number];

export async function loadOverview(actor: Actor) {
  // The races this person may read registrations on — every event of the
  // organizer for its owner, only the assigned ones for a STAFF member. Every
  // query below is scoped by it, the pending queue included.
  const reachable = reachableEvents(actor, 'registration:view');

  // Races the organizer still has ahead of them, race day itself included —
  // the same line the public listings draw (hasFinished / upcomingEvents in
  // src/lib/event-schedule.ts), so the tile, these rows and /events can never
  // disagree about which races are still live. One reading of "today" is
  // shared, so nothing is counted differently across Manila's midnight.
  const live: typeof reachable = { AND: [reachable, upcomingEvents(today())] };

  // A registration that was removed (a column no screen writes yet — see
  // Registration.deletedAt) is kept for the trail and counted nowhere.
  const paidOrders = { status: 'PAID', deletedAt: null, event: reachable };

  // The queue is bank transfers only. They are the orders a person verifies by
  // hand against a deposit slip; a PENDING online checkout is waiting on
  // PayMongo, not on staff, and the nightly sweep expires it
  // (src/lib/pending-expiry.ts). Both still hold a slot, so the live-race rows
  // below show the unpaid checkouts too — beside the registrants, not in them.
  //
  // An order whose every runner was removed is nobody to verify, so it is not
  // in the queue (UNPAID_ORDERS_PLAN.md: an emptied test order sat here).
  const awaiting = {
    ...awaitingVerificationWhere(),
    deletedAt: null,
    event: reachable,
    runners: { some: { deletedAt: null } },
  };

  const orderSelect = {
    id: true,
    orderRef: true,
    customerName: true,
    totalAmount: true,
    createdAt: true,
    event: { select: { id: true, title: true } },
    _count: { select: { runners: { where: { deletedAt: null } } } },
  } as const;

  const [
    liveEvents,
    money,
    totalRegistrants,
    awaitingCount,
    queue,
    recent,
    liveHeld,
    changeMoney,
    switchMoney,
  ] = await Promise.all([
    prisma.event.findMany({
      where: live,
      orderBy: soonestFirst,
      select: { id: true, title: true, date: true, categories: { select: { id: true, slotLimit: true } } },
    }),
    // Net revenue for the organizer: subtotal + delivery fee, less whatever a
    // promotion took off, and excluding the platform and transaction fees
    // that were never theirs. Every amount is centavos, so the sums are exact
    // integers.
    //
    // The discount has to come off. It is the organizer's own money that was
    // given away — a percentage and a free runner both reduce the goods, not
    // the platform's cut — so a total that ignored it would report revenue the
    // organizer never actually received.
    //
    // Add-ons are summed apart (ADD_ONS_PLAN.md D1): `subtotal` is entries
    // only, so the organizer's add-on sales are added on purpose and named on
    // the tile, and Run As One's own are kept out of both revenue and the
    // platform fee — the same split settlement.ts makes.
    prisma.registration.aggregate({
      where: paidOrders,
      _sum: {
        subtotal: true,
        deliveryFee: true,
        discountAmount: true,
        platformFee: true,
        addOnTotal: true,
        addOnRunAsOneTotal: true,
      },
    }),
    // Registrants as every screen counts them (pending-expiry.ts): paid, and
    // bank transfers awaiting verification. Never an unpaid online checkout.
    prisma.runner.count({
      where: {
        deletedAt: null,
        registration: {
          OR: [{ status: 'PAID' }, awaitingVerificationWhere()],
          deletedAt: null,
          event: reachable,
        },
      },
    }),
    prisma.registration.count({ where: awaiting }),
    prisma.registration.findMany({
      where: awaiting,
      // Oldest first: the runner who has waited longest is the next to verify.
      orderBy: { createdAt: 'asc' },
      take: QUEUE_ROWS,
      select: orderSelect,
    }),
    prisma.registration.findMany({
      where: paidOrders,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: orderSelect,
    }),
    heldPlacesByCategory({ category: { event: live } }),
    // Category changes on those orders, read as settlement.ts reads them, so
    // these tiles agree with Remittances: moved changes only, the change fee
    // Run As One's, refunds (paid or still due) off the organizer's side.
    prisma.categoryChange.aggregate({
      where: { status: { in: [...MOVED_CHANGE_STATUSES] }, registration: paidOrders },
      _sum: { totalCharged: true, refundAmount: true, changeFee: true, transactionFee: true },
    }),
    // Delivery switches on those orders, read as settlement.ts reads them
    // (LOGISTICS_CHANGE_PLAN.md L8): APPLIED with something charged, while the
    // receipt they moved is PAID. What was charged less PayMongo's cut is the
    // switch fee, and all of it is the organizer's — no Run As One share.
    prisma.logisticsChange.aggregate({
      where: {
        status: LOGISTICS_CHANGE_STATUSES.APPLIED,
        totalCharged: { gt: 0 },
        orders: { some: { registration: paidOrders } },
      },
      _sum: { totalCharged: true, transactionFee: true },
    }),
  ]);

  const sum = money._sum;
  const changes = changeMoney._sum;
  const changeFees = changes.changeFee ?? 0;
  const changeRevenue =
    (changes.totalCharged ?? 0) - (changes.refundAmount ?? 0) - changeFees - (changes.transactionFee ?? 0);
  const switchRevenue = (switchMoney._sum.totalCharged ?? 0) - (switchMoney._sum.transactionFee ?? 0);
  const runAsOneAddOns = sum.addOnRunAsOneTotal ?? 0;
  const organizerAddOns = (sum.addOnTotal ?? 0) - runAsOneAddOns;
  const totalRevenue =
    (sum.subtotal ?? 0) +
    (sum.deliveryFee ?? 0) -
    (sum.discountAmount ?? 0) +
    organizerAddOns +
    changeRevenue +
    switchRevenue;
  const platformFees = (sum.platformFee ?? 0) + changeFees;

  // Per race: the runners paid, awaiting verification and on unpaid
  // checkouts (heldPlacesByCategory — the split every screen uses), and how
  // full that is when every option has a cap. All three hold a slot, so all
  // three fill the bar; only the first two are registrants. An option with no
  // cap makes the race unlimited — the same reading fullEventIds gives the
  // public listings — so there is no "full" to measure and the row shows the
  // counts alone.
  const liveRows = liveEvents.map(event => {
    let paid = 0;
    let awaiting = 0;
    let unpaid = 0;
    for (const category of event.categories) {
      const places = liveHeld.get(category.id);
      if (!places) continue;
      paid += places.paid;
      awaiting += places.awaiting;
      unpaid += places.unpaid;
    }
    const capped =
      event.categories.length > 0 && event.categories.every(category => (category.slotLimit ?? 0) > 0);
    const capacity = capped ? event.categories.reduce((n, category) => n + (category.slotLimit ?? 0), 0) : null;
    return { id: event.id, title: event.title, date: event.date, paid, awaiting, unpaid, capacity };
  });

  return {
    totalRevenue,
    organizerAddOns,
    platformFees,
    runAsOneAddOns,
    totalRegistrants,
    awaitingCount,
    queue,
    recent,
    liveRows,
  };
}
