import prisma from '@/lib/db';
import { can, requireActor } from '@/lib/actor';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ResultsUploaderClient from './ResultsUploaderClient';
import ResultsTableClient from './ResultsTableClient';
import AdminNotFound from '../../../AdminNotFound';
import { EVENT_NOT_FOUND } from '../../event-not-found';
import { CATEGORY_ORDER } from '@/lib/category-order';

export default async function AdminResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();

  // Scoped to the actor's own organizer's events: the session check above
  // only proves *someone* is signed in, and an id in the URL is not proof the
  // event belongs to them. Unscoped, this screen would hand any approved
  // organizer another's category list and finishing times — and the uploader
  // below writes results against whatever event it is given. A STAFF member
  // unassigned to this race gets the same "not found".
  //
  // No super admin branch: `src/proxy.ts` sends a `SUPER_ADMIN` off `/admin/**`
  // to `/superadmin` before this page runs.
  const event = await prisma.event.findFirst({
    where: { id, organizerId: actor.orgId },
    include: {
      categories: { orderBy: CATEGORY_ORDER }
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

  return (
    <>
      <header className="admin-header flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/events" className="admin-back-link text-secondary hover:text-primary transition-colors" aria-label="Back to Events">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="admin-header-title">Race Results for {event.title}</h1>
        </div>
      </header>

      <div className="admin-content">
        <ResultsTableClient results={results} event={event} />
      </div>
    </>
  );
}
