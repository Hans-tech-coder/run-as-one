import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { ResolvingMetadata } from 'next';
import db from '@/lib/public-db';
import { hasFinished } from '@/lib/event-schedule';
import { takesResults } from '@/lib/event-format';
import { canViewEventPage } from '@/lib/event-preview';
import { describePublish, isPublished } from '@/lib/event-visibility';
import { canonicalEventPath, eventByParam, resultsPath } from '@/lib/event-slug';
import { registrationState, takenSlotsByCategory, withSlotCounts } from '@/lib/registration-gate';
import { EVENT_SITE_CLIENT, ensureEventSite, eventPageMetadata } from '@/lib/site-client';
import { eventJsonLd, jsonLdScript } from '@/lib/event-structured-data';
import './EventDetails.css';

import PromoHighlights from '@/components/PromoHighlights';
import RaceHeader from '@/components/RaceHeader';
import { automaticPromosFor, promoTerms } from '@/lib/promo-store';
import { categorySalePrices } from '@/lib/discount';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { shownToRunners } from '@/lib/bib-medal';
import RichText from '@/components/RichText';
import { cleanHighlights } from '@/lib/event-highlights';
import EventHighlightsGallery from '@/components/EventHighlightsGallery';
import { publicAddOns } from '@/lib/add-on-stock';
import { AddOnsBlock, InclusionsGrid } from './EventSections';
import { RaceDetails } from './RaceDetails';
import { EventSidebar } from './EventSidebar';

/** One URL per event, on the site it belongs to (CLIENT_SUBDOMAIN_PLAN.md). */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata,
) {
  const { slug } = await params;
  return eventPageMetadata(slug, eventSlug => `/events/${eventSlug}`, parent);
}

/**
 * The event page, rendered by two routes: `page.tsx`, the cached copy everyone
 * gets, and `app/preview/[site]/events/[slug]`, rendered per request for a
 * browser that carries a dashboard session (`src/proxy.ts`). Only the second
 * may read the session (`staff`): a cached page that reads a cookie fails at
 * runtime ("changed from static to dynamic"), and could not be one copy for
 * everyone anyway.
 */
export default async function EventDetails({ site, slug, staff }: { site: string; slug: string; staff: boolean }) {

  // Matched on slug or cuid, because the id links minted before slugs existed
  // are still out there on posters and in group chats.
  const event = await db.event.findFirst({
    where: eventByParam(slug),
    // The client's name is the organizer in the page's structured data.
    include: {
      categories: { orderBy: CATEGORY_ORDER },
      client: { select: { ...EVENT_SITE_CLIENT.select, name: true } },
    },
  });

  if (!event) {
    notFound();
  }

  // A Bib + Medal option that has not reached its date is not shown at all
  // (lib/bib-medal.ts). Dropped here, once, so the list, the prices, the promo
  // strip and the add-ons below all read the same options.
  event.categories = shownToRunners(event.categories);

  // A draft or scheduled event is a 404 to the public and a preview to the
  // team that is still finishing it (lib/event-preview.ts), who never get the
  // cached copy.
  const access = staff ? await canViewEventPage(event) : { visible: isPublished(event), preview: false };
  if (!access.visible) {
    notFound();
  }

  // On its own site first: a client's race opened on another host goes there,
  // path kept (lib/site-client.ts).
  ensureEventSite(event, site, `/events/${encodeURIComponent(slug)}`);

  // One canonical address per event: an old cuid link lands here and is sent on
  // to the readable URL rather than quietly serving the page under both.
  const canonical = canonicalEventPath(event, slug);
  if (canonical) {
    redirect(canonical);
  }

  // A virtual run has no results (lib/event-format.ts), so it never hands over
  // to /results nor offers View Results, whatever rows the table holds.
  const resultsCount = takesResults(event)
    ? await db.raceResult.count({ where: { eventId: event.id } })
    : 0;

  // A race that has already been run cannot be entered any more, so the sidebar
  // swaps its Register button for an explanation. Taking someone's money for a
  // race they cannot run is the one outcome this page must not allow;
  // /register turns them away too, for anyone who typed the URL.
  const finished = hasFinished(event);
  const highlights = cleanHighlights(event.highlights);

  // Once the organizer has uploaded the times, this race has left /events for
  // good. It is no longer something you sign up for, and what a visitor opening
  // the link now wants is the ranking — so the event page hands them over to
  // /results rather than standing as a second, emptier address for the same
  // race. Old links keep working; they just arrive where the race now lives.
  //
  // A results-only event takes the same exit whatever its date, since there is
  // nothing to register for, and has no page at all until its results are up
  // (RESULTS_ONLY_EVENT_PLAN.md, D1): its client sells the entries elsewhere,
  // and a page here would read as a second, wrong place to sign up.
  if ((finished || event.resultsOnly) && resultsCount > 0) {
    redirect(resultsPath(event));
  }
  if (event.resultsOnly) {
    notFound();
  }

  // Whether this race is taking entries at all, and why not — the organizer's
  // hold, or every option sold out. Worked out here rather than in the sidebar
  // because the per-option counts are also what the categories list shows: a
  // runner who came for the 10K should see that the 10K is what is gone.
  const categories = withSlotCounts(
    event.categories,
    await takenSlotsByCategory(event.categories.map((category) => category.id), db),
  );
  const state = registrationState(event, categories, finished);

  // What this race is offering without a code. Shown here rather than only
  // in the wizard because an early bird that nobody knows about cannot do
  // the one thing an early bird is for, which is to bring a decision
  // forward. Codes are deliberately not listed: those are the organizer's
  // to hand out.
  const automaticPromos = finished
    ? []
    : (await automaticPromosFor(event, db)).map(promoTerms);

  // Which options a promotion has repriced, so the list below can strike the
  // old price through. Only automatic, currently-running CATEGORY_PRICE
  // promotions count, and `categorySalePrices` is the one place that decides
  // it — half of that rule re-expressed here is how a page starts advertising
  // a price the checkout will not honour.
  const salePrices = categorySalePrices(automaticPromos, event.categories);

  // The add-ons a runner can buy with their entry, shown before they register
  // so the shirt is part of the decision, not a surprise on step 1. None on a
  // race already run: there is nothing left to buy them with.
  const addOns = finished ? [] : await publicAddOns(event.id, db);

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
    <div className="event-details-page site-wrap">
      {/* What Google's event listings read (lib/event-structured-data.ts). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(eventJsonLd({ ...event, categories }, state, salePrices)) }}
      />

      {/* Only the team ever sees this page unpublished, and they must not
          mistake the preview for the live page. */}
      {access.preview && (
        <p
          role="status"
          className="mt-6 mb-0 rounded-control border border-[var(--status-warning)] px-5 py-3 text-sm font-medium text-[var(--status-warning)]"
        >
          Preview. {describePublish(event)} Runners cannot open or register for it yet.
        </p>
      )}

      <RaceHeader event={event} back={{ href: '/events', label: 'All Races' }} />

      {/* The poster and the details on the left, the decision column on the
          right, beside the poster. On a phone the column comes first (order),
          right under the race's name, so the prices and Register are on the
          first screen there too; the poster and the details follow. */}
      <div className="grid grid-cols-1 gap-8 pb-16 lg:grid-cols-12 lg:gap-10 md:pb-20">
        <div className="lg:col-span-7 xl:col-span-8">
          {event.imageUrl?.trim() && (
            <div className="overflow-hidden rounded-panel bg-site-surface">
              {/* Whole, never cropped or written over: the banner carries the
                  race's own name and sponsors. */}
              <img src={event.imageUrl} alt={`${event.title} poster`} className="block h-auto w-full" />
            </div>
          )}

          <div className="event-blocks">
            <RaceDetails event={event} finished={finished} closed={state === 'CLOSED'} />

            {/* The organizer writes this now, so an empty one means they had
                nothing to add — not that the page should invent a sentence. */}
            {event.description?.trim() && (
              <section className="event-block" aria-labelledby="about-race">
                <h2 id="about-race" className="event-block__title">About the Race</h2>
                {/* Headings, lists and emphasis come from the admin editor's
                    toolbar; see src/lib/rich-text.ts for what it may contain. */}
                <RichText source={event.description} className="event-prose" />
              </section>
            )}

            <PromoHighlights promos={automaticPromos} categories={event.categories} />

            {withInclusions.length > 0 && (
              <section className="event-block" aria-labelledby="inclusions">
                <h2 id="inclusions" className="event-block__title">What&apos;s Included</h2>

                {sharedInclusions ? (
                  <InclusionsGrid items={withInclusions[0].inclusions} />
                ) : (
                  <div className="flex flex-col gap-7">
                    {withInclusions.map((cat) => (
                      <div key={cat.id}>
                        {/* Price stays out of here: the sidebar is where costs
                            are compared. */}
                        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                          <h3 className="m-0 text-lg font-semibold text-site-ink">{cat.name}</h3>
                          {cat.distance && <span className="site-chip">{cat.distance}</span>}
                        </div>
                        <InclusionsGrid items={cat.inclusions} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {addOns.length > 0 && <AddOnsBlock addOns={addOns} categories={event.categories} />}

            {/* Everything the organizer wants to show off — race kit, trophies,
                the venue, an after party — as one gallery that opens full
                screen with zoom, so small print on a poster can be read. */}
            {highlights.length > 0 && (
              <section className="event-block" aria-labelledby="highlights">
                <h2 id="highlights" className="event-block__title">Race Kit and Highlights</h2>
                <EventHighlightsGallery highlights={highlights} title={event.title} />
              </section>
            )}
          </div>
        </div>

        <aside className="order-first lg:order-none lg:col-span-5 xl:col-span-4 lg:row-span-2" aria-label="Register">
          <EventSidebar
            event={event}
            categories={categories}
            state={state}
            finished={finished}
            resultsCount={resultsCount}
            salePrices={salePrices}
          />
        </aside>
      </div>
    </div>
  );
}
