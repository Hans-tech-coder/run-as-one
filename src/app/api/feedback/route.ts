import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import {
  MAX_FEEDBACK_EMAIL,
  MAX_FEEDBACK_MESSAGE,
  MAX_FEEDBACK_NAME,
  MAX_FEEDBACK_USER_AGENT,
  MIN_FEEDBACK_MESSAGE,
  asFeedbackKind,
  asSitePath,
  looksLikeEmail,
} from '@/lib/feedback';
import { FEEDBACK_RULE, allowRequest, callerKey } from '@/lib/rate-limit';

/**
 * Where the feedback form posts. Public, because the people most worth hearing
 * from are signed out: a runner whose checkout broke has no account here and
 * never will.
 *
 * That makes it the third route on this site anyone on the internet can call,
 * and the only one that writes a row on a stranger's say-so. Three things hold
 * it: the throttle below, the length caps from lib/feedback.ts enforced here
 * rather than only in the form, and the fact that nothing the sender writes is
 * ever rendered anywhere but the superadmin inbox, as text.
 *
 * Refusals name the field they are refusing and hand the field's own key back,
 * so the form can put the caret in the right box (§8, rule 4) instead of
 * showing a general "something went wrong" over a form the sender has to
 * re-read themselves.
 */

/** A 400 that the form can attach to one control. */
function refuse(field: string, error: string) {
  return NextResponse.json({ field, error }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    // Before the body is read: a refusal should cost this route less than the
    // request that earned it. Unlike the promo lookup — which answers a
    // throttled caller exactly as it answers a miss, so a guesser learns
    // nothing — this one says plainly that it is the rate and not the content,
    // because there is no secret here to protect and a person who genuinely
    // sent three reports in a row deserves to know which it was.
    if (!allowRequest('feedback', callerKey(request), FEEDBACK_RULE)) {
      return NextResponse.json(
        {
          error:
            'That is a few messages in a short time. Give it a couple of minutes and send the next one — we have the ones you already sent.',
        },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return refuse('message', 'We could not read that. Please try again.');
    }

    const kind = asFeedbackKind((body as Record<string, unknown>).kind);
    if (!kind) {
      return refuse('kind', 'Choose what this message is about.');
    }

    const rawMessage = (body as Record<string, unknown>).message;
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    if (!message) {
      return refuse('message', 'Tell us what happened — the message is empty.');
    }
    if (message.length < MIN_FEEDBACK_MESSAGE) {
      return refuse(
        'message',
        `A little more detail, please — at least ${MIN_FEEDBACK_MESSAGE} characters.`,
      );
    }
    if (message.length > MAX_FEEDBACK_MESSAGE) {
      return refuse(
        'message',
        `That is longer than we can store. Keep it under ${MAX_FEEDBACK_MESSAGE} characters.`,
      );
    }

    const rawName = (body as Record<string, unknown>).name;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (name.length > MAX_FEEDBACK_NAME) {
      return refuse('name', `That name is longer than ${MAX_FEEDBACK_NAME} characters.`);
    }

    const rawEmail = (body as Record<string, unknown>).email;
    // Not uppercased, and not lowercased either: the local part of an address
    // is case-sensitive on some mail servers (see lib/text-case.ts).
    const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
    if (email.length > MAX_FEEDBACK_EMAIL) {
      return refuse('email', `That address is longer than ${MAX_FEEDBACK_EMAIL} characters.`);
    }
    if (email && !looksLikeEmail(email)) {
      return refuse('email', 'That does not look like an email address. Leave it blank if you would rather not say.');
    }

    // The browser, from the request rather than from the body: a client that
    // can be asked to describe itself can also be asked to lie, and the point
    // of this column is chasing a real bug on a real device.
    const userAgent =
      request.headers.get('user-agent')?.slice(0, MAX_FEEDBACK_USER_AGENT) || null;

    await prisma.feedback.create({
      data: {
        kind,
        message,
        name: name || null,
        email: email || null,
        pagePath: asSitePath((body as Record<string, unknown>).pagePath),
        userAgent,
      },
      select: { id: true },
    });

    // The row's id is not in the answer on purpose. The sender has nothing to
    // do with it, and an id handed to an anonymous caller is an id that can be
    // guessed at against some route added later.
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to record feedback:', error);
    return NextResponse.json(
      { error: 'We could not send that just now. Please try again in a moment.' },
      { status: 500 },
    );
  }
}
