import { NextResponse } from 'next/server';
import { getActor } from '@/lib/actor';
import { asStepUpAction, asStepUpTarget, stepUpMethods, verifyStepUp } from '@/lib/step-up';
import { ownAccount } from '@/lib/two-factor';

/**
 * Step-up confirmation for the signed-in person (lib/step-up.ts,
 * PAYMENT_CORRECTION_PLAN.md C2a).
 *
 * GET — which proofs this account can give (`methods`), so StepUpDialog shows
 * only those. POST — `{ method: 'code' | 'password', code | password, action,
 * targetId }`; a right one answers `{ token, expiresAt }`, a five-minute,
 * one-use token the guarded route spends with `consumeStepUp`. "Confirm with
 * Google" goes through `/api/auth/google/step-up` instead.
 *
 * Neither changes the session. Who may do the action itself is the guarded
 * route's question, asked again there; this proves only who is pressing.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const account = await ownAccount(actor);
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ methods: stepUpMethods(account) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const action = asStepUpAction(body.action);
    const targetId = asStepUpTarget(body.targetId);
    const method = body.method === 'code' || body.method === 'password' ? body.method : null;
    if (!action || !targetId || !method) {
      return NextResponse.json({ error: 'This confirmation is not complete. Close it and try again.' }, { status: 400 });
    }
    const raw = method === 'code' ? body.code : body.password;
    const secret = typeof raw === 'string' ? raw : '';

    const result = await verifyStepUp(actor, { method, secret, action, targetId });
    if (!result.ok) {
      return NextResponse.json(
        result.field ? { errors: { [result.field]: result.error } } : { error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json(
      { token: result.token, expiresAt: result.expiresAt },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Step-up confirmation failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
