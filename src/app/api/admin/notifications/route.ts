import { NextResponse } from 'next/server';
import { getActor } from '@/lib/actor';
import { loadNotifications } from '@/lib/notification-store';

/**
 * The bell's feed (lib/notifications.ts). Whatever the person may open, and
 * nothing else — the store asks each kind of its own permission — so the
 * route itself only needs somebody signed in. `viewerKey` is the person's id,
 * which the bell files its read marks under so two people sharing a browser
 * do not read each other's badge.
 */
export async function GET() {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const items = await loadNotifications(actor);
    return NextResponse.json(
      { items, viewerKey: actor.id, now: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Failed to load notifications:', error);
    return NextResponse.json({ error: 'Could not load notifications.' }, { status: 500 });
  }
}
