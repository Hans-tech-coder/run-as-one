import prisma from '@/lib/db';
import { requireTeamActor } from '@/lib/actor';
import { toPesos } from '@/lib/money';
import { DEFAULT_PLATFORM_FEE } from '@/lib/platform-fee';
import NewEventForm from './NewEventForm';

/**
 * /admin/events/new. A server shell around the client form so the Admin Fee
 * box can start from the **default platform fee** — `Organizer.adminFee` on
 * Run As One's row, set by the Super Admin on /admin/settings. The event
 * stores its own copy (`Event.adminFee`), so a later change to the default
 * never reprices it.
 */
export default async function NewEventPage() {
  const actor = await requireTeamActor();
  const organizer = await prisma.organizer.findUnique({
    where: { id: actor.orgId },
    select: { adminFee: true },
  });

  return <NewEventForm defaultAdminFee={toPesos(organizer?.adminFee ?? DEFAULT_PLATFORM_FEE)} />;
}
