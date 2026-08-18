import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { runnerIds } = body;

    if (!Array.isArray(runnerIds) || runnerIds.length === 0) {
      return NextResponse.json({ error: 'Invalid runner IDs' }, { status: 400 });
    }

    // Verify organizer owns the events these runners belong to
    const runners = await db.runner.findMany({
      where: { 
        id: { in: runnerIds } 
      },
      include: {
        registration: {
          include: {
            event: true
          }
        }
      }
    });

    if (runners.length === 0) {
      return NextResponse.json({ error: 'Runners not found' }, { status: 404 });
    }

    if (auth.role !== 'SUPERADMIN') {
      const unauthorizedRunners = runners.filter(runner => runner.registration.event.organizerId !== auth.id);
      if (unauthorizedRunners.length > 0) {
        return NextResponse.json({ error: 'Unauthorized to delete some runners' }, { status: 401 });
      }
    }

    await db.runner.deleteMany({
      where: { 
        id: { in: runnerIds } 
      }
    });

    return NextResponse.json({ success: true, deletedCount: runners.length });
  } catch (error: any) {
    console.error('Bulk delete runner error:', error);
    return NextResponse.json({ error: 'Failed to delete runners', details: error.message }, { status: 500 });
  }
}
