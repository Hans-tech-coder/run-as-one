import React from 'react';
import Link from 'next/link';
import type { ReferenceHolder } from '@/lib/payment-reference';

/**
 * A staff route's refusal, ready for an alert or a field: when the refusal is
 * "this reference is already on another payment" (lib/payment-reference.ts,
 * answered with `referenceHolder`), the holder's reference becomes a link to
 * its row on the registrants page (R5: staff see which record, nothing more).
 * Anything else is the route's own sentence, or the fallback.
 */
export function staffError(data: unknown, fallback: string): React.ReactNode {
  const body = (data ?? {}) as { error?: unknown; referenceHolder?: ReferenceHolder };
  const message = typeof body.error === 'string' && body.error ? body.error : fallback;
  const holder = body.referenceHolder;
  if (!holder?.ref || !holder.href) return message;
  const at = message.lastIndexOf(holder.ref);
  if (at < 0) return message;
  return (
    <>
      {message.slice(0, at)}
      <Link href={holder.href} className="font-semibold underline underline-offset-2">
        {holder.ref}
      </Link>
      {message.slice(at + holder.ref.length)}
    </>
  );
}
