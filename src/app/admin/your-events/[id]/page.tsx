import React from 'react';
import type { Metadata } from 'next';
import { requireActor } from '@/lib/actor';
import { clientPayout } from '@/lib/client-payout';
import { viewerRaceReport } from '@/lib/client-race-report';
import { formatEventDay, today } from '@/lib/event-schedule';
import { SITE_NAME } from '@/lib/site-contact';
import AdminNotFound from '../../AdminNotFound';
import DashboardHeader from '../../DashboardHeader';
import PrintableCopy from '../../PrintableCopy';
import RaceReport from './RaceReport';
import './your-events.css';
import './race-print.css';

export const metadata: Metadata = {
  title: `Race Details | ${SITE_NAME} Admin`,
};

/** Another client's race, a removed one and a made-up id all read alike (§7). */
const RACE_NOT_FOUND = {
  title: 'Race Not Found',
  heading: 'Race not found.',
  body: 'The link may be an old one, or the race is no longer linked to your organization.',
  homeHref: '/admin',
  homeLabel: 'Back to Your Events',
};

/**
 * One of a client viewer's races (CLIENT_RACE_PAGE_PLAN.md, Batches 1–3): what
 * an organizer needs to run it — how full each category is, how registrations
 * came in, the shirt sizes to order, how the race kits go out, and what Run As
 * One has paid out for it.
 *
 * **Meant for viewers, so it gates on `requireActor()`** and lets
 * `viewerRaceReport` decide: it reads through `reachableEvents` and `can()`
 * with the race's own `clientId`, and answers null for anything this person
 * may not see, which is drawn as the same not-found for every id. Every number
 * above the payouts is a count (`client-race-report.ts`). The payout summary is
 * its own read and its own verb (`client-payout.ts`, `event:view-payout`), so
 * someone who may see the counts but not the money gets the page without it.
 * There is no runner on it.
 *
 * Left out on purpose, after the owner's look at a competitor's portal:
 * withdrawals, a per-order money ledger, promo-code tools, inventory
 * allocation and courier stages. A client cannot act on them here, and a
 * non-technical one would only be asked to make sense of them.
 *
 * **Save as PDF** prints a light copy of the same sections portalled onto
 * `<body>` (`PrintableCopy`, shared with the e-certificate guide): the sizes
 * are what goes to the shirt supplier, who has no account, so the payouts
 * are left off the paper. The button is in
 * the page, not the header: at the end of the race's status line, above the
 * tiles (`RaceReport`).
 *
 * Server-rendered; the only client code is the print portal and its button.
 */
export default async function YourRacePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const [report, payout] = await Promise.all([viewerRaceReport(actor, id), clientPayout(actor, id)]);
  if (!report) return <AdminNotFound {...RACE_NOT_FOUND} />;

  return (
    <>
      <DashboardHeader title={report.event.title} crumbs={[{ label: 'Your Events', href: '/admin' }]} />

      <div className="admin-content">
        <PrintableCopy
          className="race-print-copy"
          print={<RaceReport report={report} idPrefix="print-" printedOn={formatEventDay(today())} />}
        >
          <RaceReport report={report} idPrefix="" payout={payout} />
        </PrintableCopy>
      </div>
    </>
  );
}
