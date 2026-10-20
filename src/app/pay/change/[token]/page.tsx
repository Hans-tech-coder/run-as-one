import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ArrowRight, CalendarX, ChevronRight, CircleCheck, Clock, Hourglass, Link2Off, Mail, Shuffle, XCircle } from 'lucide-react';
import { IconBadge, StatusPanel } from '@/components/StatusPanel';
import { SITE_NAME, supportMailto } from '@/lib/site-contact';
import { getSiteSettings } from '@/lib/site-settings';
import { formatPesos } from '@/lib/money';
import { formatEventDay, formatEventInstant } from '@/lib/event-schedule';
import { paymentMethodLabel } from '@/lib/registration-codes';
import { transactionFeeFor } from '@/lib/free-checkout';
import { PAY_LINK_RULE, allowRequest } from '@/lib/rate-limit';
import { readChangePaymentToken } from '@/lib/resume-payment';
import { changeProofSubmitted, isOutsidePayment, onlineChangeMethod, type ChangePayableState } from '@/lib/category-change-hold';
import { payableStateOf, readChangeForPayment, settleChangeOnline } from '@/lib/category-change-payment';
import { lookUpPaymongoPayment } from '@/lib/online-payment';
import { ensureEventHost } from '@/lib/site-client';
import PayNowButton from '../../[token]/PayNowButton';
import ChangeBankProof from './ChangeBankProof';

export const metadata: Metadata = {
  title: `Pay for Your Category Change | ${SITE_NAME}`,
  // A link that pays for somebody's change is not a page for a search engine.
  robots: { index: false, follow: false },
};

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

/**
 * A category change's payment page (CATEGORY_CHANGE_PLAN.md Session 3): where a
 * runner lands from the link staff sent for an upgrade, to see what they are
 * moving from and to, the breakdown to the centavo, and pay it through
 * PayMongo with the transaction fee on top (D13).
 *
 * **A GCash or bank change is paid here too** (the owner, 2026-10-20): the
 * event's accounts, then the screenshot and reference for staff to validate
 * (`ChangeBankProof`, `category-change-runner.ts`). Once the proof is in the
 * page says so, the *Pay by* line goes (the hold no longer runs out,
 * `changeHeldUntil`), and the runner can replace it.
 *
 * **What it shows is decided by who can end up holding the link**, as on an
 * order's page (`/pay/[token]`): the race, the two categories, the change
 * reference and the money — never the runner's name, email or phone.
 *
 * **Back from PayMongo (`?paid=1`) it asks PayMongo first.** A webhook can be
 * late, and on a developer's machine it never arrives at all, so a change
 * still waiting is looked up and, if PayMongo says it was paid, settled here
 * through the same `settleChangeOnline` the webhook takes. Otherwise the
 * runner is told the payment is being confirmed.
 *
 * Every way the link can stop working has its own designed panel (PROJECT_GUIDE
 * §8 rule 1): applied, cancelled, expired, a link that is not valid, and too
 * many tries. The rule behind them is `changePayableState`.
 */
export default async function ChangePayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const { paid } = await searchParams;

  const requestHeaders = await headers();
  const caller =
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    requestHeaders.get('x-real-ip')?.trim() ||
    'unknown';
  if (!allowRequest('change-pay-page', caller, PAY_LINK_RULE)) {
    return (
      <Notice
        icon={<Clock size={30} aria-hidden="true" />}
        eyebrow="Please wait"
        title="Too Many Tries"
        body="This link was opened many times from your connection in the last minute. Wait a minute, then open it again."
      />
    );
  }

  const changeId = await readChangePaymentToken(token);
  let change = changeId ? await readChangeForPayment(changeId) : null;

  if (!change) {
    const { contactEmail } = await getSiteSettings();
    return (
      <Notice
        icon={<Link2Off size={30} aria-hidden="true" />}
        eyebrow="Payment link"
        title="This Link Has Expired"
        body="A category change's payment link lasts only as long as your seat in the new category is held. Email us if you still want to change, and we will help you."
        actions={
          <SecondaryLink href={supportMailto(contactEmail)} icon={<Mail size={18} aria-hidden="true" className="shrink-0 text-accent-orange" />}>
            Email Us
          </SecondaryLink>
        }
      />
    );
  }

  await ensureEventHost(change.event);

  if (paid === '1' && change.status === 'AWAITING_PAYMENT' && change.checkoutSessionId) {
    const lookup = await lookUpPaymongoPayment(change.checkoutSessionId);
    if ('paid' in lookup && lookup.paid) {
      await settleChangeOnline(change.id);
      change = (await readChangeForPayment(change.id)) ?? change;
    }
  }

  const eventLink = `/events/${change.event.slug}`;
  const move = (
    <span className="inline-flex flex-wrap items-center justify-center gap-2">
      {change.fromCategory.name} <ArrowRight size={16} aria-hidden="true" /> {change.toCategory.name}
    </span>
  );
  const state = payableStateOf(change);

  if (state !== 'payable') {
    return <Closed state={state} changeRef={change.changeRef} eventTitle={change.event.title} eventLink={eventLink} move={move} />;
  }

  if (paid === '1') {
    return (
      <Notice
        icon={<Hourglass size={30} aria-hidden="true" />}
        eyebrow={change.changeRef}
        title="Confirming Your Payment"
        body={`Thank you. PayMongo has not confirmed the payment for your move to ${change.toCategory.name} yet. This usually takes a minute: open this link again shortly, and watch your email for the confirmation.`}
        actions={<PrimaryLink href={`/pay/change/${token}`}>Check Again</PrimaryLink>}
      />
    );
  }

  const outside = isOutsidePayment(change.paymentMethod);
  const proofIn = changeProofSubmitted(change);
  const method = outside ? null : onlineChangeMethod();
  const transactionFee = method ? transactionFeeFor(change.amount, method) : 0;
  const total = change.amount + transactionFee;

  const rows: [string, React.ReactNode][] = [
    ['Race', change.event.title],
    ['Race day', formatEventDay(change.event.date)],
    ['Change', change.changeRef],
    ['Move', move],
    ...(outside
      ? [['Payment method', 'GCash or bank transfer'] as [string, string]]
      : method
        ? [['Payment method', paymentMethodLabel(method)] as [string, string]]
        : []),
    // With the proof in, the hold no longer closes it (`changeHeldUntil`).
    ...(change.holdUntil && !proofIn ? [['Pay by', formatEventInstant(change.holdUntil)] as [string, string]] : []),
  ];
  const money: [string, number][] = [
    [`${change.toCategory.name} price`, change.toPrice],
    [`Already paid for ${change.fromCategory.name}`, -change.basis],
    ...(change.changeFee > 0 ? [['Change fee', change.changeFee] as [string, number]] : []),
    ...(transactionFee > 0 ? [['Transaction fee', transactionFee] as [string, number]] : []),
  ];

  return (
    <Frame>
      <StatusPanel>
        <div className="flex flex-col items-center text-center">
          <IconBadge>
            <Shuffle size={30} aria-hidden="true" />
          </IconBadge>
          <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-[0.3em] text-secondary">Category change</p>
          <h1 className="mb-3 bg-gradient-to-r from-white to-white/60 bg-clip-text text-2xl font-black uppercase tracking-wide text-transparent text-balance sm:text-3xl">
            Your New Seat Is Held
          </h1>
          <p className="m-0 max-w-md text-base leading-relaxed text-secondary">
            {outside
              ? `Send the difference below by GCash or bank transfer to move to ${change.toCategory.name}, then send us the screenshot and its reference number. You stay in ${change.fromCategory.name} until we check it, and your confirmation comes by email.`
              : `Pay the difference below to move to ${change.toCategory.name}. You stay in ${change.fromCategory.name} until it is paid, and your confirmation comes by email once PayMongo confirms the payment.`}
          </p>
        </div>

        <dl className="mx-auto mt-8 grid w-full max-w-md grid-cols-1 gap-0 overflow-hidden rounded-[16px] border border-white/[0.08]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] px-4 py-3 last:border-b-0">
              <dt className="shrink-0 text-sm text-secondary">{label}</dt>
              <dd className="m-0 min-w-0 break-words text-right text-sm font-semibold text-white">{value}</dd>
            </div>
          ))}
        </dl>

        <dl className="mx-auto mt-4 grid w-full max-w-md grid-cols-1 gap-0 overflow-hidden rounded-[16px] border border-white/[0.08]">
          {money.map(([label, centavos]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] px-4 py-3">
              <dt className="min-w-0 text-sm text-secondary">{label}</dt>
              <dd className="m-0 shrink-0 text-sm font-semibold tabular-nums text-white">
                {centavos < 0 ? `− ${peso(-centavos)}` : peso(centavos)}
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 bg-white/[0.03] px-4 py-4">
            <dt className="text-sm font-bold uppercase tracking-wide text-secondary">Amount due</dt>
            <dd className="m-0 text-xl font-black tabular-nums text-white">{peso(total)}</dd>
          </div>
        </dl>

        {outside ? (
          <div className="mx-auto mt-8 w-full max-w-md">
            <ChangeBankProof
              token={token}
              amount={peso(total)}
              toCategory={change.toCategory.name}
              bankAccounts={change.event.bankAccounts}
              submittedReference={proofIn ? change.transactionNumber : null}
            />
          </div>
        ) : (
          <div className="mx-auto mt-8 flex w-full max-w-md flex-col items-stretch gap-3">
            {method ? (
              <PayNowButton token={token} amount={peso(total)} kind="change" />
            ) : (
              <p role="alert" className="m-0 text-center text-sm font-medium text-red-400">
                Online payment is not available right now. Reply to the email we sent and we will help you pay.
              </p>
            )}
            <p className="m-0 text-center text-xs leading-relaxed text-secondary">
              You will be taken to PayMongo to pay. Any payment page opened for this change before stops working once you
              press Pay now.
            </p>
          </div>
        )}
      </StatusPanel>
    </Frame>
  );
}

/** Each way a change's link stops working, in the runner's words. */
function Closed({
  state,
  changeRef,
  eventTitle,
  eventLink,
  move,
}: {
  state: Exclude<ChangePayableState, 'payable'>;
  changeRef: string;
  eventTitle: string;
  eventLink: string;
  move: React.ReactNode;
}) {
  if (state === 'applied') {
    return (
      <Notice
        icon={<CircleCheck size={30} aria-hidden="true" />}
        eyebrow={changeRef}
        title="Category Changed"
        body={<>Your change for {eventTitle} is done: {move}. There is nothing left to pay, and the confirmation was sent by email; check your spam folder if you cannot find it.</>}
        actions={<PrimaryLink href={eventLink}>View the Race</PrimaryLink>}
      />
    );
  }
  if (state === 'cancelled') {
    return (
      <Notice
        icon={<XCircle size={30} aria-hidden="true" />}
        eyebrow={changeRef}
        title="This Change Was Cancelled"
        body={`This category change for ${eventTitle} was cancelled, so it can no longer be paid. Your registration stays as it was. Reply to our email if you still want to change.`}
        actions={<PrimaryLink href={eventLink}>View the Race</PrimaryLink>}
      />
    );
  }
  return (
    <Notice
      icon={<CalendarX size={30} aria-hidden="true" />}
      eyebrow={changeRef}
      title="This Change Has Expired"
      body={`The time to pay for this category change for ${eventTitle} has run out, and the seat held for you was released. Your registration stays as it was. Reply to our email if you still want to change.`}
      actions={<PrimaryLink href={eventLink}>View the Race</PrimaryLink>}
    />
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden">
      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center">{children}</div>
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
  body: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Frame>
      <StatusPanel>
        <div className="flex flex-col items-center text-center">
          <IconBadge>{icon}</IconBadge>
          <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-[0.3em] text-secondary">{eyebrow}</p>
          <h1 className="mb-3 bg-gradient-to-r from-white to-white/60 bg-clip-text text-2xl font-black uppercase tracking-wide text-transparent text-balance sm:text-3xl">
            {title}
          </h1>
          <p className="m-0 max-w-md text-base leading-relaxed text-secondary">{body}</p>
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
      className="btn-gradient group w-full shrink-0 justify-center whitespace-nowrap rounded-[16px] px-8 py-4 text-center text-base no-underline shadow-xl shadow-accent-orange/20 sm:w-auto"
    >
      <span>{children}</span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

function SecondaryLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <a href={href} className="btn-secondary w-full shrink-0 whitespace-nowrap text-center sm:w-auto">
      {icon}
      {children}
    </a>
  );
}
