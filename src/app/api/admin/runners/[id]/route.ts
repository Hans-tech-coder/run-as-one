import { NextResponse } from 'next/server';
import { asRunnerCommunity } from '@/lib/running-community';
import db from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify organizer owns the event this runner belongs to
    const runner = await db.runner.findUnique({
      where: { id },
      include: {
        registration: {
          include: {
            event: true
          }
        }
      }
    });

    if (!runner) {
      return NextResponse.json({ error: 'Runner not found' }, { status: 404 });
    }

    if (auth.role !== 'SUPERADMIN' && runner.registration.event.organizerId !== auth.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      gender,
      birthdate,
      singletSize,
      emergencyContactName,
      emergencyContactPhone,
      medicalConditions,
      runningCommunity
    } = body;

    const updatedRunner = await db.runner.update({
      where: { id },
      data: {
        firstName,
        lastName,
        email,
        phone,
        gender,
        birthdate,
        singletSize,
        emergencyContactName,
        emergencyContactPhone,
        medicalConditions,
        // Blank clears back to the default rather than storing an empty
        // string, so a club tally still adds up to the head count.
        runningCommunity: asRunnerCommunity(runningCommunity)
      },
      include: {
        category: true // To match the return type expected by UI
      }
    });

    return NextResponse.json(updatedRunner);
  } catch (error: any) {
    console.error('Update runner error:', error);
    return NextResponse.json({ error: 'Failed to update runner', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const runner = await db.runner.findUnique({
      where: { id },
      include: {
        registration: {
          include: {
            event: true
          }
        }
      }
    });

    if (!runner) {
      return NextResponse.json({ error: 'Runner not found' }, { status: 404 });
    }

    if (auth.role !== 'SUPERADMIN' && runner.registration.event.organizerId !== auth.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await db.runner.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete runner error:', error);
    return NextResponse.json({ error: 'Failed to delete runner', details: error.message }, { status: 500 });
  }
}
