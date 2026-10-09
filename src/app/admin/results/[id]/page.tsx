import prisma from '@/lib/db';
import { can, requireTeamActor } from '@/lib/actor';
import ResultsUploaderClient from './ResultsUploaderClient';
import ResultsTableClient from './ResultsTableClient';
import EventDetailsPanel from './EventDetailsPanel';
import CertificateWorkspacePanel from './CertificateWorkspacePanel';
import { certificateDraft } from './certificate-draft';
import AdminNotFound from '../../AdminNotFound';
import { EVENT_NOT_FOUND } from '../../events/event-not-found';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { withPacerRanks } from '@/lib/pacer-store';
import { genderDivision } from '@/lib/gender-division';
import DashboardHeader from '@/app/admin/DashboardHeader';

/**
 * One race's results workspace (RESULTS_NAV_PLAN.md, Batch 2). It moved here
 * from /admin/events/[id]/results, which now redirects (next.config.ts).
 *
 * Two shapes, decided by the rows themselves — nothing is stored to say
 * results were "started":
 * - **No results yet**: the create layout, three steps on one page — the
 *   race's details, the upload, the e-certificate.
 * - **Has results**: the details, the results table with its re-upload, and
 *   the e-certificate.
 */
export default async function AdminResultsWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireTeamActor();

  // Scoped to the actor's own organizer's events: the session check above
  // only proves *someone* is signed in, and an id in the URL is not proof the
  // event belongs to them. Unscoped, this screen would hand any approved
  // organizer another's category list and finishing times — and the uploader
  // below writes results against whatever event it is given. A STAFF member
  // unassigned to this race gets the same "not found".
  const event = await prisma.event.findFirst({
    where: { id, organizerId: actor.orgId },
    include: {
      categories: { orderBy: CATEGORY_ORDER },
      client: { select: { name: true } },
    }
  });

  if (!event || !can(actor, 'event:view', { organizerId: actor.orgId, eventId: id })) {
    // In the dashboard's frame, with the way back, rather than a bare line of
    // text outside the header and content. Worded exactly as the registrants
    // screen words it, whichever of the two misses this is.
    return <AdminNotFound {...EVENT_NOT_FOUND} />;
  }

  const results = await prisma.raceResult.findMany({
    where: { eventId: id },
    include: { category: true },
    orderBy: { overallRank: 'asc' }
  });

  // The same pacer match and the same pacer-free ranks the public results
  // show, so staff see exactly what runners see: a pacer reads "-", everyone
  // behind them has moved up. The stored upload itself is untouched.
  const ranked = await withPacerRanks(id, results);
  const tagged = ranked.map(result => ({ ...result, gender: genderDivision(result.gender) }));

  // Asked with the same can() as the routes behind them: Edit Event's PUT and
  // the certificate's own PUT both need event:edit.
  const canEdit = can(actor, 'event:edit', { organizerId: actor.orgId, eventId: id });
  const editHref = canEdit ? `/admin/events/${id}/edit` : null;
  const certificate = (
    <CertificateWorkspacePanel
      eventId={id}
      initial={certificateDraft(event)}
      event={{ title: event.title, date: event.date, location: event.location }}
      canEdit={canEdit}
      title={results.length === 0 ? '3. E-Certificate' : undefined}
    />
  );

  return (
    <>
      <DashboardHeader title="Race Results" crumbs={[{ label: 'Results', href: '/admin/results' }, { label: event.title }]} />

      <div className="admin-content flex flex-col gap-6">
        {results.length === 0 ? (
          <>
            <EventDetailsPanel event={event} editHref={editHref} title="1. Details" />

            <section className="admin-panel">
              <div className="admin-panel-header">
                <h2 className="admin-panel-title">2. Upload results</h2>
              </div>
              <div className="admin-panel-content flex flex-col items-start gap-4">
                <p className="m-0 text-sm text-secondary">
                  The timing company&apos;s spreadsheet, .xlsx or .csv. Each sheet maps to one category
                  {event.resultsOnly ? ', or makes its own from the sheet name' : ' of this race'}. Runners
                  can look up their times on the public results once it is in.
                </p>
                <ResultsUploaderClient event={event} />
              </div>
            </section>

            {certificate}
          </>
        ) : (
          <>
            <EventDetailsPanel event={event} editHref={editHref} />
            <ResultsTableClient results={tagged} event={event} />
            {certificate}
          </>
        )}
      </div>
    </>
  );
}
