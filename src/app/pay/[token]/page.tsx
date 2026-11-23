import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { CalendarX, ChevronRight, CircleCheck, Clock, CreditCard, Link2Off, Mail, XCircle } from 'lucide-react';
import prisma from '@/lib/db';
import { IconBadge, StatusPanel } from '@/components/StatusPanel';
import { SITE_NAME, supportMailto } from '@/lib/site-contact';
import { getSiteSettings } from '@/lib/site-settings';
import { formatPesos } from '@/lib/money';
import { formatEventDay, formatEventInstant } from '@/lib/event-schedule';
import { paymentMethodLabel } from '@/lib/registration-codes';
import { expiresBy } from '@/lib/pending-expiry';
import { PAY_LINK_RULE, allowRequest } from '@/lib/rate-limit';
import { payableState, readResumePaymentToken, type PayableState } from '@/lib/resume-payment';
import { EVENT_SITE_CLIENT, ensureEventHost } from '@/lib/site-client';
import PayNowButton from './PayNowButton';

export const metadata: Metadata = {
  title: `Finish Your Registration | ${SITE_NAME}`,
  // A link that pays for somebody's order is not a page for a search engine.
  robots: { index: false, follow: false },
};

/**
 * The resume-payment page (UNPAID_FOLLOWUP_PLAN.md Batch 3): where a runner
 * lands from the payment link staff sent them, to finish paying an order they
 * abandoned without registering again.
 *
 * **What it shows is decided by who can end up holding the link.** It gets
 * pasted into Messenger and forwarded, so it shows the race, how many runners,
 * the amount and the payment method — enough for the runner to recognise
 * their order — and never an email, a phone number, a birthdate or a name.
 *
 * Every way the link can stop working gets its own designed panel (PROJECT_GUIDE
 * §8 rule 1): paid, cancelled, expired, a method no longer offered, a link that
 * is not valid, and too many tries. Each says what happened and what the runner
 * can do next. The rule behind them is `payableState` (lib/resume-payment.ts),
 * the same one Pay now and the staff side apply.
 */
export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Throttled here as well as on Pay now: opening the page reads the database.
  const requestHeaders = await headers();
  const caller =
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    requestHeaders.get('x-real-ip')?.trim() ||
    'unknown';
  if (!allowRequest('checkout-notice', caller, PAY_LINK_RULE)) {
    return (
      <Notice
        icon={<Clock size={30} aria-hidden="true" />}
        eyebrow="Please Wait"
        title="Too Many Tries"
        body="This link was opened many times from your connection in the last minute. Wait a minute, then open it again."
      />
    );
  }

  const registrationId = await readResumePaymentToken(token);
  const order = registrationId
    ? await prisma.registration.findUnique({
        where: { id: registrationId },
        select: {
          orderRef: true,
          status: true,
          paymentMethod: true,
          totalAmount: true,
          createdAt: true,
          holdUntil: true,
          deletedAt: true,
          event: { select: { title: true, slug: true, date: true, client: EVENT_SITE_CLIENT } },
          runners: { select: { deletedAt: true } },
        },
      })
    : null;

  if (!order) {
    const { contactEmail } = await getSiteSettings();
    return (
      <Notice
        icon={<Link2Off size={30} aria-hidden="true" />}
        eyebrow="Payment Link"
        title="This Link Has Expired"
        body="Payment links last only as long as the order holds its slot. If you still want to run, register again, or email us and we will help you finish."
        actions={
          <>
            <PrimaryLink href="/events">Browse Events</PrimaryLink>
            <SecondaryLink href={supportMailto(contactEmail)} icon={<Mail size={18} aria-hidden="true" className="shrink-0" />}>
              Email Us
            </SecondaryLink>
          </>
        }
      />
    );
  }

  // On the order's own site, so the page wears the organizer's branding and
  // not that of whichever subdomain the link was opened on.
  await ensureEventHost(order.event);

  const runners = order.runners.filter(runner => !runner.deletedAt).length;
  const state = payableState({
    ...order,
    liveRunners: runners,
    removedRunners: order.runners.length - runners,
  });
  const eventLink = `/events/${order.event.slug}`;

  if (state !== 'payable') {
    return <Closed state={state} orderRef={order.orderRef} eventTitle={order.event.title} eventLink={eventLink} />;
  }

  const rows: [string, string][] = [
    ['Race', order.event.title],
    ['Race Day', formatEventDay(order.event.date)],
    ['Runners', `${runners} runner${runners === 1 ? '' : 's'}`],
    ['Payment Method', paymentMethodLabel(order.paymentMethod)],
    ['Order', order.orderRef],
    ['Pay By', formatEventInstant(expiresBy(order.createdAt, order.holdUntil))],
  ];

  return (
    <Frame>
      <StatusPanel>
        <div className="flex flex-col items-center text-center">
          <IconBadge>
            <CreditCard size={30} aria-hidden="true" />
          </IconBadge>
          <p className="mb-2 mt-6 text-sm font-semibold text-site-accent">
            Finish Your Registration
          </p>
          <h1 className="site-h2 mb-3">
            Your Slot Is Still Held
          </h1>
          <p className="m-0 max-w-md text-base leading-relaxed text-site-muted">
            Your registration was saved, but the payment was not finished. Pay
            below to confirm it. Your receipt comes by email once PayMongo
            confirms the payment.
          </p>
        </div>

        <dl className="mx-auto mt-8 grid w-full max-w-md grid-cols-1 gap-0 overflow-hidden rounded-[14px] border border-site-line bg-site-card">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 border-b border-site-line px-4 py-3 last:border-b-0">
              <dt className="shrink-0 text-sm text-site-muted">{label}</dt>
              <dd className="m-0 min-w-0 break-words text-right text-sm font-semibold text-site-ink">{value}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 bg-site-surface px-4 py-4">
            <dt className="text-sm font-semibold text-site-ink">Amount Due</dt>
            <dd className="m-0 text-xl font-semibold text-site-ink">₱{formatPesos(order.totalAmount)}</dd>
          </div>
        </dl>

        <div className="mx-auto mt-8 flex w-full max-w-md flex-col items-stretch gap-3">
          <PayNowButton token={token} amount={`₱${formatPesos(order.totalAmount)}`} />
          <p className="m-0 text-center text-xs leading-relaxed text-site-muted">
            You will be taken to PayMongo to pay. Any payment page opened for
            this order before stops working once you press Pay now.
          </p>
        </div>
      </StatusPanel>
    </Frame>
  );
}

/** Each way a link stops working, in the runner's words. */
function Closed({
  state,
  orderRef,
  eventTitle,
  eventLink,
}: {
  state: Exclude<PayableState, 'payable'>;
  orderRef: string;
  eventTitle: string;
  eventLink: string;
}) {
  if (state === 'paid') {
    return (
      <Notice
        icon={<CircleCheck size={30} aria-hidden="true" />}
        eyebrow={orderRef}
        title="Already Paid"
        body={`This order for ${eventTitle} is paid, so there is nothing left to pay. The receipt was sent by email; check your spam folder if you cannot find it.`}
        actions={<PrimaryLink href={eventLink}>View the Race</PrimaryLink>}
      />
    );
  }
  if (state === 'cancelled') {
    return (
      <Notice
        icon={<XCircle size={30} aria-hidden="true" />}
        eyebrow={orderRef}
        title="This Order Was Cancelled"
        body={`This order for ${eventTitle} was cancelled, so it can no longer be paid. If you still want to run, register again.`}
        actions={<PrimaryLink href={`${eventLink}/register`}>Register Again</PrimaryLink>}
      />
    );
  }
  if (state === 'expired') {
    return (
      <Notice
        icon={<CalendarX size={30} aria-hidden="true" />}
        eyebrow={orderRef}
        title="This Order Has Expired"
        body={`The time to pay for this order for ${eventTitle} has run out, and its slot was released. If you still want to run, register again.`}
        actions={<PrimaryLink href={`${eventLink}/register`}>Register Again</PrimaryLink>}
      />
    );
  }
  return (
    <Notice
      icon={<Link2Off size={30} aria-hidden="true" />}
      eyebrow={orderRef}
      title="Online Payment Unavailable"
      body={`This order for ${eventTitle} can no longer be paid online. Register again to pay with a method the race takes now.`}
      actions={<PrimaryLink href={`${eventLink}/register`}>Register Again</PrimaryLink>}
    />
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="checkout-notice flex w-full flex-col items-center py-10 sm:py-16">
      <div className="flex w-full max-w-2xl flex-col items-center">{children}</div>
    </div>
  );
}

function Notice({
  icon,
  eyebrow,
  title,
  body,
  actions,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  actions?: React.ReactNode;
}) {
  return (
    <Frame>
      <StatusPanel>
        <div className="flex flex-col items-center text-center">
          <IconBadge>{icon}</IconBadge>
          <p className="mb-2 mt-6 text-sm font-semibold text-site-accent">{eyebrow}</p>
          <h1 className="site-h2 mb-3">
            {title}
          </h1>
          <p className="m-0 max-w-md text-base leading-relaxed text-site-muted">{body}</p>
        </div>
        {actions && (
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap">{actions}</div>
        )}
      </StatusPanel>
    </Frame>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="site-btn site-btn--action group w-full shrink-0 whitespace-nowrap no-underline sm:w-auto"
    >
      <span>{children}</span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

function SecondaryLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <a href={href} className="site-btn site-btn--quiet w-full shrink-0 whitespace-nowrap sm:w-auto">
      {icon}
      {children}
    </a>
  );
}
