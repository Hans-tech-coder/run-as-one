import db from '@/lib/db';
import { can, reachableEvents, requireTeamActor } from '@/lib/actor';
import { mostRecentFirst, today } from '@/lib/event-schedule';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { toPesos } from '@/lib/money';
import { DEFAULT_PLATFORM_FEE } from '@/lib/platform-fee';
import AdminNotFound from '../../AdminNotFound';
import DashboardHeader from '@/app/admin/DashboardHeader';
import { certificateDraft } from '../[id]/certificate-draft';
import NewResultsClient from './NewResultsClient';

/**
 * /admin/results/new (RESULTS_NAV_PLAN.md Batch 3, R2): the first question
 * before any results go up — is this race already in the system? — and then
 * the whole job on this one page: 1. the race, 2. its results, 3. its
 * e-certificate, the last two optional, all saved by one Save at the foot.
 *
 * - **Already in the system**: step 1 is picking the race. Its categories and
 *   current certificate ride along in the list, so steps 2 and 3 open on the
 *   page without another request.
 * - **Results only**: step 1 is the short form, saved through the ordinary
 *   `POST /api/admin/events` as a results-only race with no categories; the
 *   upload makes them from its sheet names.
 *
 * Gated on `event:create`, the verb that POST asks: a staff member works the
 * races they were given and never starts one, and is told so by the admin's
 * own 404 rather than a form that would be refused on save.
 */
export default async function NewResultsPage() {
  const actor = await requireTeamActor();
  if (!can(actor, 'event:create', { organizerId: actor.orgId })) {
    return <AdminNotFound homeHref="/admin/results" homeLabel="Back to Results" />;
  }

  // R6: only a race already run or being run today can have results, and only
  // one without them belongs here; a race that has results is opened from the
  // Results list instead. Results-only races are left out too: they are on the
  // list from the moment they are created.
  const [pickable, organizer] = await Promise.all([
    db.event.findMany({
      where: {
        AND: [
          reachableEvents(actor),
          { resultsOnly: false },
          { raceResults: { none: {} } },
          { date: { lte: today() } },
        ],
      },
      select: {
        id: true,
        title: true,
        date: true,
        location: true,
        client: { select: { name: true } },
        categories: { select: { id: true, name: true, distance: true }, orderBy: CATEGORY_ORDER },
        certificateTemplate: true,
        certificateCoordinates: true,
      },
      orderBy: mostRecentFirst,
    }),
    // The Admin Fee a results-only race is stored with, as on the create form:
    // it charges nothing while results-only, but a race moved back to Events
    // later should start from the default platform fee, not from zero.
    db.organizer.findUnique({ where: { id: actor.orgId }, select: { adminFee: true } }),
  ]);

  return (
    <>
      <DashboardHeader title="Add Results" crumbs={[{ label: 'Results', href: '/admin/results' }]} />

      <div className="admin-content max-w-4xl mx-auto">
        <NewResultsClient
          events={pickable.map(({ certificateTemplate, certificateCoordinates, ...event }) => ({
            ...event,
            client: event.client?.name ?? null,
            certificate: certificateDraft({ certificateTemplate, certificateCoordinates }),
          }))}
          defaultAdminFee={toPesos(organizer?.adminFee ?? DEFAULT_PLATFORM_FEE)}
        />
      </div>
    </>
  );
}
