"use client";

import type { RefObject } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { supportMailto } from '@/lib/site-contact';
import { useContactEmail } from '@/components/SiteContactProvider';
import type { FormState } from './apply-steps';

/**
 * What a sent application is replaced with: what happens next, rather than a
 * green ribbon, and the address the reply will go to — which is what stops
 * somebody applying twice an hour later.
 */
export default function ThankYouPanel({
  form,
  headingRef,
}: {
  form: Pick<FormState, 'contactFirstName' | 'name' | 'email'>;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const contactEmail = useContactEmail();

  return (
    <div className="apply-done">
      <span className="apply-done__mark" aria-hidden="true">
        <CheckCircle2 size={28} />
      </span>

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-bold text-white outline-none"
      >
        We have your application, {form.contactFirstName || 'thank you'}.
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-secondary">
        It is in the queue for review under{' '}
        <strong className="text-white">{form.name}</strong>. We will write to{' '}
        <strong className="text-white">{form.email}</strong>, so keep an eye on
        that inbox — the spam folder included.
      </p>

      <ol className="apply-next">
        <li>
          <span className="apply-next__num" aria-hidden="true">1</span>
          <span>
            <strong>We read it.</strong> The Run As One team checks your
            organization and the event you described, usually within two
            business days.
          </span>
        </li>
        <li>
          <span className="apply-next__num" aria-hidden="true">2</span>
          <span>
            <strong>We may call or email you</strong> on the number and address
            you gave, to agree on the event, the fees and how registrations are
            settled with you.
          </span>
        </li>
        <li>
          <span className="apply-next__num" aria-hidden="true">3</span>
          <span>
            <strong>You get your sign-in.</strong> When we are ready to run your
            race, we email a link to set a password. Your dashboard then shows
            each of your events and how many runners have registered.
          </span>
        </li>
      </ol>

      <div className="apply-nav apply-nav--end">
        <Link href="/" className="btn-gradient text-white">
          Back to Run As One
        </Link>
      </div>

      <p className="mt-6 text-xs text-secondary">
        Something to add, or a question in the meantime? Write to{' '}
        <a href={supportMailto(contactEmail)} className="auth-link">
          {contactEmail}
        </a>
        .
      </p>
    </div>
  );
}
