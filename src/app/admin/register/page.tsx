import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site-contact';
import db, { publishCutoff } from '@/lib/public-db';
import { publishedEvents } from '@/lib/event-visibility';
import { pastEventsWhere } from '@/lib/past-events';
import { FORM_SUBTITLE, FORM_TITLE } from './apply-steps';
import RegisterClient from './RegisterClient';

/**
 * The service inquiry, server half: only here so the page has a title of its
 * own (SERVICE_INQUIRY_PLAN.md O2). The form is `RegisterClient`. The URL
 * stays `/admin/register`, so links already shared still work.
 */
export const metadata: Metadata = {
  title: `${FORM_TITLE} | ${SITE_NAME}`,
  description: FORM_SUBTITLE,
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
  return <RegisterClient hasPastEvents={pastEvents > 0} />;
}
