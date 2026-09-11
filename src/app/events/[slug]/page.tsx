import React from 'react';
import { notFound, redirect } from 'next/navigation';
import {
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import db from '@/lib/db';
import { formatPesos } from '@/lib/money';
import { sellsPackages } from '@/lib/event-type';
import { inclusionIcon } from '@/lib/inclusion-icon';
import { formatEventDay, hasFinished } from '@/lib/event-schedule';
import {
  canonicalEventPath,
  eventByParam,
  registerPath,
  resultsPath,
} from '@/lib/event-slug';
import {
  EVENT_FULL_MESSAGE,
  pauseNote,
  registrationState,
  takenSlotsByCategory,
  withSlotCounts,
} from '@/lib/registration-gate';
import './EventDetails.css';

import EventHeroBanner from '@/components/EventHeroBanner';
import PromoHighlights from '@/components/PromoHighlights';
import CategoryPrice from '@/components/CategoryPrice';
import LinkPendingIcon from '@/components/ui/LinkPendingIcon';
import { automaticPromosFor, promoTerms } from '@/lib/promo-store';
import { categorySalePrices } from '@/lib/discount';

export default async function EventDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Matched on slug or cuid, because the id links minted before slugs existed
  // are still out there on posters and in group chats.
  const event = await db.event.findFirst({
    where: eventByParam(slug),
    include: { categories: true }
  });

  if (!event) {
    notFound();
  }

  // One canonical address per event: an old cuid link lands here and is sent on
  // to the readable URL rather than quietly serving the page under both.
  const canonical = canonicalEventPath(event, slug);
  if (canonical) {
    redirect(canonical);
  }

  const resultsCount = await db.raceResult.count({
    where: { eventId: event.id }
  });

  // A race that has already been run cannot be entered any more, so the sidebar
  // swaps its Register button for an explanation. Taking someone's money for a
  // race they cannot run is the one outcome this page must not allow;
  // /register turns them away too, for anyone who typed the URL.
  const finished = hasFinished(event);

  // Once the organizer has uploaded the times, this race has left /events for
  // good. It is no longer something you sign up for, and what a visitor opening
  // the link now wants is the ranking — so the event page hands them over to
  // /results rather than standing as a second, emptier address for the same
  // race. Old links keep working; they just arrive where the race now lives.
  if (finished && resultsCount > 0) {
    redirect(resultsPath(event));
  }

  // Whether this race is taking entries at all, and why not — the organizer's
  // hold, or every option sold out. Worked out here rather than in the sidebar
  // because the per-option counts are also what the categories list shows: a
  // runner who came for the 10K should see that the 10K is what is gone.
  const categories = withSlotCounts(
    event.categories,
    await takenSlotsByCategory(event.categories.map((category) => category.id)),
  );
  const state = registrationState(event, categories, finished);

  // What this race is offering without a code. Shown here rather than only
  // in the wizard because an early bird that nobody knows about cannot do
  // the one thing an early bird is for, which is to bring a decision
  // forward. Codes are deliberately not listed: those are the organizer's
  // to hand out.
  const automaticPromos = finished
    ? []
    : (await automaticPromosFor(event)).map(promoTerms);

  // Which options a promotion has repriced, so the list below can strike the
  // old price through. Only automatic, currently-running CATEGORY_PRICE
  // promotions count, and `categorySalePrices` is the one place that decides
  // it — half of that rule re-expressed here is how a page starts advertising
  // a price the checkout will not honour.
  const salePrices = categorySalePrices(automaticPromos, event.categories);

  // Inclusions are per category now, and optional, so this section has three
  // shapes. Organizers who set nothing get no section at all — better than the
  // four hardcoded items that used to stand here and were wrong for most events.
  const withInclusions = event.categories.filter(
    (cat) => cat.inclusions.length > 0,
  );
  // When every option includes the same things — the usual case on a race, where
  // the 5K and the 10K both get a singlet and a medal — repeating the list under
  // each distance is noise. One list, no headings.
  const sharedInclusions =
    withInclusions.length === event.categories.length &&
    withInclusions.every(
      (cat) =>
        cat.inclusions.join('\0') === withInclusions[0].inclusions.join('\0'),
    );

  return (
    <div className="event-details-page">
      <EventHeroBanner event={event as any} />

      {/* Main Content */}
      <section className="mt-12 mb-20 t-stagger is-shown">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          
          {/* Left Column: About & Inclusions */}
          <div className="lg:col-span-2 space-y-6 lg:space-y-8">
            {/* The organizer writes this now, so an empty one means they had
                nothing to add — not that the page should invent a sentence. */}
            {event.description?.trim() && (
              <div className="info-block glass-panel p-8 rounded-3xl border border-white/10 hover:border-accent-blue/30 transition-colors t-stagger-line t-stagger-line--3">
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-white tracking-tight">About The Event</h2>
                {/* whitespace-pre-line because the field is a textarea: the
                    paragraph breaks an organizer types are theirs to keep. */}
                <p className="text-base sm:text-lg text-secondary leading-relaxed whitespace-pre-line">
                  {event.description}
                </p>
              </div>
            )}

            <PromoHighlights promos={automaticPromos} categories={event.categories} />

            {withInclusions.length > 0 && (
              <div className="info-block glass-panel p-8 rounded-3xl border border-white/10 hover:border-accent-blue/30 transition-colors t-stagger-line t-stagger-line--4">
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-white tracking-tight">What&apos;s Included</h2>

                {sharedInclusions ? (
                  <InclusionsGrid items={withInclusions[0].inclusions} />
                ) : (
                  <div className="flex flex-col gap-8">
                    {withInclusions.map((cat) => (
                      <div key={cat.id}>
                        {/* Price stays out of here: the sidebar is where costs
                            are compared, and repeating them beside every
                            inclusions list only adds noise. */}
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 mb-4 pb-3 border-b border-white/10">
                          <h3 className="text-xl font-bold text-white uppercase tracking-wide">
                            {cat.name}
                          </h3>
                          {cat.distance && (
                            <span className="text-xs text-secondary bg-white/10 px-2.5 py-1 rounded-full">
                              {cat.distance}
                            </span>
                          )}
                        </div>
                        <InclusionsGrid items={cat.inclusions} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {event.raceKitImageUrl && (
               <div className="info-block glass-panel p-8 rounded-3xl border border-white/10 hover:border-accent-blue/30 transition-colors t-stagger-line t-stagger-line--5">
                 <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-white tracking-tight">Race Kit Reveal</h2>
                 <img src={event.raceKitImageUrl} alt="Race Kit Poster" className="w-full rounded-2xl border border-white/10 shadow-2xl" />
               </div>
            )}
          </div>

          {/* Right Column: Sidebar (Sticky) */}
          <div className="order-first lg:order-none lg:col-span-1 t-stagger-line t-stagger-line--3">
            <div className="lg:sticky lg:top-32 space-y-6">
              
              {/* Categories Bento */}
              <div className="glass-panel p-5 sm:p-6 rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent">
                <h2 className="text-xl sm:text-2xl font-bold mb-5 sm:mb-6 text-white">{sellsPackages(event) ? 'Packages' : 'Categories'}</h2>
                <div className="flex flex-col gap-4">
                  {categories.map((cat: any) => {
                    // A row is a way in whenever Register Now would be: the
                    // race is open and this option still has room. A full row,
                    // or any row while the race is paused, full or over, stays
                    // plain text — a link the wizard would only turn away is a
                    // dead end dressed up as a button.
                    const bookable = state === 'OPEN' && !cat.isFull;
                    const body = (
                      <>
                      <div className="absolute top-0 right-0 w-32 h-32 bg-accent-orange/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-accent-orange/20 transition-all"></div>
                      <div className="relative z-10 flex flex-col items-start gap-1">
                        <div className={cat.isFull ? 'font-bold text-lg text-white/60' : 'font-bold text-lg text-white'}>{cat.name}</div>
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Packages have no distance; an empty pill is worse
                              than no pill. */}
                          {cat.distance && <div className="text-sm text-secondary bg-white/10 px-3 py-1 rounded-full">{cat.distance}</div>}
                          {/* The whole point of a per-option cap: a full 10K
                              says nothing about the 5K beside it, so it is this
                              row that has to carry the news. */}
                          {cat.isFull && (
                            <div className="text-xs font-bold uppercase tracking-wide text-white/70 bg-white/10 border border-white/10 px-3 py-1 rounded-full">
                              Full
                            </div>
                          )}
                          {cat.isLastCall && (
                            <div className="text-xs font-bold uppercase tracking-wide text-accent-orange bg-accent-orange/15 px-3 py-1 rounded-full">
                              {cat.slotsLeft} slot{cat.slotsLeft === 1 ? '' : 's'} left
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="relative z-10 shrink-0 flex items-center gap-2">
                        <CategoryPrice
                          price={cat.price}
                          sale={salePrices.get(cat.id)}
                          dimmed={cat.isFull}
                          className={
                            cat.isFull
                              ? 'text-lg sm:text-xl font-bold shrink-0 text-white/40'
                              : 'text-lg sm:text-xl font-bold shrink-0 text-accent-orange'
                          }
                        />
                        {/* The same chevron Register Now carries, so the row
                            reads as the same kind of thing: a way into the
                            wizard. It turns into the runner while the wizard
                            loads, like every other call to action here. */}
                        {bookable && (
                          <LinkPendingIcon className="text-white/40 group-hover:text-accent-orange transition-colors">
                            <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                          </LinkPendingIcon>
                        )}
                      </div>
                      </>
                    );

                    return bookable ? (
                      // Opens the wizard with this option already chosen for
                      // the first runner — see registerPath.
                      <Link
                        key={cat.id}
                        href={registerPath(event, cat)}
                        className={CATEGORY_ROW(false, true)}
                      >
                        <span className="sr-only">Register for </span>
                        {body}
                      </Link>
                    ) : (
                      <div key={cat.id} className={CATEGORY_ROW(cat.isFull, false)}>
                        {body}
                      </div>
                    );
                  })}
                </div>
                
                <div className="mt-6 pt-6 border-t border-white/10 text-sm text-secondary flex flex-col gap-2">
                  {event.logisticsPickup && <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-accent-blue" /> On-site Pickup Available</div>}
                  {event.logisticsDeliveryFeeInside > 0 && <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-accent-blue" /> Delivery, inside province (+₱{formatPesos(event.logisticsDeliveryFeeInside)})</div>}
                  {event.logisticsDeliveryFeeOutside > 0 && <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-accent-blue" /> Delivery, outside province (+₱{formatPesos(event.logisticsDeliveryFeeOutside)})</div>}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-4">
                {finished ? (
                  <RaceIsOver event={event} />
                ) : state === 'PAUSED' ? (
                  <RegistrationOnHold
                    icon={<CalendarClock size={20} />}
                    heading="Registration Paused"
                    message={pauseNote(event)}
                  />
                ) : state === 'FULL' ? (
                  <RegistrationOnHold
                    icon={<Users size={20} />}
                    heading="Every Option Is Full"
                    message={EVENT_FULL_MESSAGE}
                  />
                ) : (
                  <>
                    <Link href={registerPath(event)} className="btn-gradient w-full text-center justify-center py-4 text-lg font-bold flex items-center gap-2 group shadow-xl shadow-accent-orange/20">
                      Register Now{' '}
                      <LinkPendingIcon className="ml-1">
                        <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform inline-block" />
                      </LinkPendingIcon>
                    </Link>

                    {resultsCount > 0 && (
                      <Link href={resultsPath(event)} className="w-full bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/30 transition-all py-4 px-6 rounded-[16px] font-bold text-center uppercase tracking-wider flex items-center justify-center gap-2">
                        View Results
                      </Link>
                    )}
                  </>
                )}
              </div>

            </div>
          </div>
          
        </div>
      </section>
    </div>
  );
}

/**
 * The sidebar of a race that has already been run and whose times are not up.
 *
 * It stands where Register Now stands on a live event, because that is where
 * someone's eye goes and the answer they need is "you cannot enter this one" —
 * not a button that quietly fails, and not a disabled button that says nothing
 * about why. It then tells them the one thing that is still coming.
 *
 * There is no results branch here: the moment an organizer uploads times, this
 * page redirects to /results and this panel is never reached. A race is either
 * still waiting for its times, which is what this says, or it has moved.
 */
function RaceIsOver({ event }: { event: { slug: string; date: string } }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/5 text-secondary">
          <CalendarCheck2 size={20} />
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-white m-0">Registration Closed</h2>
      </div>

      <p className="text-sm sm:text-base text-secondary leading-relaxed m-0">
        {`This race was held on ${formatEventDay(event.date)}. Official times appear on the results page once the organizer uploads them.`}
      </p>

      <Link
        href="/events"
        className="mt-5 w-full bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/30 transition-all py-4 px-6 rounded-[16px] font-bold text-center uppercase tracking-wider flex items-center justify-center gap-2 no-underline"
      >
        Find Another Race
      </Link>
    </div>
  );
}

/**
 * One row of the categories list, dimmed once that option has sold out.
 *
 * Only a `bookable` row — one that is a link into the wizard — lights its
 * border on hover and wears a focus ring; a row that cannot be pressed must not
 * look as though it can. A function rather than an inline template literal only
 * because this file's class strings are long enough already.
 */
function CATEGORY_ROW(isFull: boolean, bookable: boolean) {
  const base =
    'group relative overflow-hidden bg-black/40 border border-white/5 rounded-2xl p-4 sm:p-5 transition-colors flex items-center justify-between gap-3';
  if (isFull) return base + ' opacity-60';
  if (!bookable) return base;
  return (
    base +
    ' no-underline cursor-pointer hover:border-accent-orange/50 focus-visible:outline-none focus-visible:border-accent-orange focus-visible:ring-2 focus-visible:ring-accent-orange/40'
  );
}

/**
 * The sidebar of a race that is still ahead but is not taking entries — the
 * organizer paused sign-ups, or every option has sold out.
 *
 * Same panel as RaceIsOver, standing in the same place, for the same reason:
 * the answer belongs where the eye already goes, and a disabled Register button
 * explains nothing. What differs is that this one is temporary, so it does not
 * send the runner away — the categories, the inclusions and the race kit above
 * it are all still worth reading, and a hold can lift.
 */
function RegistrationOnHold({
  icon,
  heading,
  message,
}: {
  icon: React.ReactNode;
  heading: string;
  message: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/5 text-secondary">
          {icon}
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-white m-0">{heading}</h2>
      </div>

      <p className="text-sm sm:text-base text-secondary leading-relaxed m-0">
        {message}
      </p>

      <Link
        href="/events"
        className="mt-5 w-full bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/30 transition-all py-4 px-6 rounded-[16px] font-bold text-center uppercase tracking-wider flex items-center justify-center gap-2 no-underline"
      >
        Browse Other Races
      </Link>
    </div>
  );
}

/**
 * One option's inclusions, as a plain list.
 *
 * Every row used to be a bordered, tinted card holding a 48px tile with the
 * same check in it, which made four short words stand three lines tall and gave
 * a five-item list the weight of the whole page. What a runner is reading here
 * is a list, so it looks like one: an icon, the words, nothing else.
 *
 * The icon is chosen from the text (lib/inclusion-icon), so the shirt line
 * draws a shirt and the medal line a medal — that is what makes the list
 * scannable now that the cards are gone.
 */
function InclusionsGrid({ items }: { items: string[] }) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 sm:gap-y-4 list-none p-0 m-0">
      {items.map((item, idx) => {
        const Icon = inclusionIcon(item);
        return (
          <li key={idx} className="flex items-start gap-3">
            <Icon
              className="text-accent-blue h-5 w-5 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span className="font-medium text-white/90 text-sm sm:text-base leading-relaxed">
              {item}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
