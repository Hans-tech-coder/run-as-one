import type { Metadata } from 'next';
import { MAIN_SITE } from '@/lib/site-host';
import { siteOrigin } from '@/lib/site-client';
import { SITE_NAME } from '@/lib/site-contact';
import db, { publishCutoff } from '@/lib/public-db';
import { publishedEvents } from '@/lib/event-visibility';
import { pastEventsWhere } from '@/lib/past-events';
import { FORM_SUBTITLE } from './apply-steps';
import RegisterClient from './RegisterClient';
import SiteFrame from '@/app/SiteFrame';

/**
 * The service inquiry, server half: only here so the page has a title of its
 * own (SERVICE_INQUIRY_PLAN.md O2). The form is `RegisterClient`. The URL
 * stays `/admin/register`, so links already shared still work. It wears the
 * public site's frame (`SiteFrame`, Paper) rather than the sign-in card: it is
 * where a prospective client lands from the home page.
 */
export const metadata: Metadata = {
  // Worded for the search an organizer makes; the page's own heading stays FORM_TITLE.
  title: `Online Race Registration & Timing for Organizers | ${SITE_NAME}`,
  description: `Race organizers in the Philippines: ${FORM_SUBTITLE.charAt(0).toLowerCase()}${FORM_SUBTITLE.slice(1)}`,
  // `/admin/**` answers on the main host alone (src/proxy.ts); robots.ts lets this one page be crawled.
  alternates: { canonical: `${siteOrigin(MAIN_SITE)}/admin/register` },
};

/**
 * Whether there is a track record to show a prospective client — the races
 * Run As One has already run, on the Past tab (PAST_EVENTS_PLAN.md §3). A
 * cached read (lib/public-db.ts), like every public page's. Never scoped to a
 * client: `/admin/**` always answers on the main host (src/proxy.ts), where
 * the Past tab lists every client's races.
 */
export default async function RegisterPage() {
  const pastEvents = await db.event.count({ where: pastEventsWhere(publishedEvents(await publishCutoff())) });
  // The main site's frame: `/admin/**` only ever answers on the main host.
  return (
    <SiteFrame site={null}>
      <RegisterClient hasPastEvents={pastEvents > 0} />
    </SiteFrame>
  );
}
