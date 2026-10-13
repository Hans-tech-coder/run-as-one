"use client";

import type { RefObject } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { supportMailto } from '@/lib/site-contact';
import { signInComing } from '@/lib/organizer-application';
import { useContactEmail } from '@/components/SiteContactProvider';
import type { FormState } from './apply-steps';

/**
 * What a sent application is replaced with: what happens next, rather than a
 * green ribbon, and the address the reply will go to — which is what stops
 * somebody applying twice an hour later.
 *
 * What happens next follows the services chosen (SERVICE_INQUIRY_PLAN.md S5,
 * `signInComing`). Online Registration leads to a sign-in, and the third step
 * says what that sign-in is: a view of the race, not a dashboard the organizer
 * works in, because Run As One staff run everything on it (O2). Anything else
 * is an inquiry for a service staff fulfil, so the third step says no sign-in
 * is needed. Neither promises a price or a date (S2).
 */
export default function ThankYouPanel({
  form,
  headingRef,
}: {
  form: Pick<FormState, 'contactFirstName' | 'name' | 'email' | 'services'>;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const contactEmail = useContactEmail();
  const withSignIn = signInComing(form.services);

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
        We have your inquiry, {form.contactFirstName || 'thank you'}.
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-secondary">
        It is in the queue under{' '}
        <strong className="text-white">{form.name}</strong>. We will write to{' '}
        <strong className="text-white">{form.email}</strong>, so keep an eye on
        that inbox — the spam folder included.
      </p>

      <ol className="apply-next">
        <li>
          <span className="apply-next__num" aria-hidden="true">1</span>
          <span>
            <strong>We read it.</strong> The Run As One team looks at your
            organization and the event you described, usually within two
            business days.
          </span>
        </li>
        <li>
          <span className="apply-next__num" aria-hidden="true">2</span>
          <span>
            <strong>We call or email you</strong> on the number and address
            you gave, to agree on the details and the price
            {withSignIn ? ', and how registrations are settled with you' : ''}.
          </span>
        </li>
        <li>
          <span className="apply-next__num" aria-hidden="true">3</span>
          {withSignIn ? (
            <span>
              <strong>You get your sign-in.</strong> Before registration opens,
              we email a link to set a password. It gives you a view of your
              race&apos;s registrations and results; our team runs the rest,
              from validating payments to uploading results.
            </span>
          ) : (
            <span>
              <strong>No sign-in needed.</strong> Our team handles the services
              you chose and keeps you posted by email and phone. If you add
              Online Registration later, we set up a sign-in then.
            </span>
          )}
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
