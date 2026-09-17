import { NextResponse } from 'next/server';
import { can, getActor, type Actor } from '@/lib/actor';

/**
 * The door to Run As One's own screens that belong to no race — organizer
 * applications, the club list and the feedback inbox (`platform:manage`).
 *
 * These routes were `/api/superadmin/**` and each compared the cookie's role
 * to `SUPER_ADMIN` itself. With one dashboard (ADMIN_MERGE_PLAN.md, Batch 2)
 * they belong to Run As One's owner and admins, and the question is a
 * permission rather than a role string, asked in one place so the nine
 * handlers cannot drift apart. A client viewer and a per-event staff member
 * are refused here, whatever the sidebar showed them.
 */
export async function platformActor(): Promise<{ actor: Actor; refusal: null } | { actor: null; refusal: NextResponse }> {
  const actor = await getActor();
  if (!actor) {
    return { actor: null, refusal: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!can(actor, 'platform:manage', { organizerId: actor.orgId })) {
    return {
      actor: null,
      refusal: NextResponse.json({ error: 'You do not have access to this screen.' }, { status: 403 }),
    };
  }
  return { actor, refusal: null };
}
