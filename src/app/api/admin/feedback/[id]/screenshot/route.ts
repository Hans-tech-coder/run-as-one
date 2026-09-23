import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { signedProofUrl } from '@/lib/blob';
import { platformActor } from '../../../platform-actor';

/**
 * Opens the screenshot a sender attached to a feedback message by redirecting
 * to a short-lived signed URL, as `admin/proof/[id]` does for a deposit slip.
 *
 * The picture sits in the private store because it is a capture of somebody's
 * screen — a checkout can show a name, an amount or a bank reference — so it
 * is served only to `platform:manage`, the same people who read the inbox.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { refusal } = await platformActor();
  if (refusal) return refusal;

  const { id } = await params;
  const row = await prisma.feedback.findUnique({
    where: { id },
    select: { screenshot: true },
  });
  if (!row?.screenshot) {
    return NextResponse.json({ error: 'No screenshot on file for this message.' }, { status: 404 });
  }

  try {
    return NextResponse.redirect(await signedProofUrl(row.screenshot));
  } catch (error) {
    console.error('Failed to sign feedback screenshot URL:', error);
    return NextResponse.json({ error: 'Could not load the screenshot.' }, { status: 500 });
  }
}
