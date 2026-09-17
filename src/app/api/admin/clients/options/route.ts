import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { platformActor } from '../../platform-actor';

/**
 * The event form's Client picker: every client, by name, with its status.
 *
 * Its own route rather than the full list, because the form needs three short
 * columns and not every applicant's phone number. Archived clients are sent
 * too, so an edit form can still name the client a race is already linked to;
 * the picker offers them for nothing else. `platform:manage` only — a 403 is
 * how the form knows not to draw the picker (lib/client-store.ts explains why
 * the link is Run As One's call).
 */
export async function GET() {
  try {
    const { refusal } = await platformActor();
    if (refusal) return refusal;

    const clients = await prisma.client.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, status: true },
    });

    return NextResponse.json({ clients });
  } catch (error) {
    console.error('Failed to fetch client options:', error);
    return NextResponse.json({ error: 'The clients could not be loaded.' }, { status: 500 });
  }
}
