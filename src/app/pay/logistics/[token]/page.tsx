import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { CalendarX, ChevronRight, CircleCheck, Clock, Hourglass, Link2Off, Mail, Truck, XCircle } from 'lucide-react';
import { IconBadge, StatusPanel } from '@/components/StatusPanel';
import { SITE_NAME, supportMailto } from '@/lib/site-contact';
import { getSiteSettings } from '@/lib/site-settings';
import { formatPesos } from '@/lib/money';
import { formatEventDay, formatEventInstant } from '@/lib/event-schedule';
import { paymentMethodLabel } from '@/lib/registration-codes';
import { transactionFeeFor } from '@/lib/free-checkout';
import { PAY_LINK_RULE, allowRequest } from '@/lib/rate-limit';
import { readSwitchPaymentToken } from '@/lib/resume-payment';
import { onlineChangeMethod, type ChangePayableState } from '@/lib/category-change-hold';
import {
  readSwitchForPayment,
  receiptOf,
  settleSwitchOnline,
  switchPayableStateOf,
} from '@/lib/logistics-change-payment';
import { lookUpPaymongoPayment } from '@/lib/online-payment';
import { ensureEventHost } from '@/lib/site-client';
import { parseDeliveryAddress } from '@/app/events/[slug]/register/delivery-address';
import PayNowButton from '../../[token]/PayNowButton';

export const metadata: Metadata = {
  title: `Pay for Kit Delivery | ${SITE_NAME}`,
  // A link that pays for somebody's delivery is not a page for a search engine.
  robots: { index: false, follow: false },
};

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

/**
 * A delivery switch's payment page (LOGISTICS_CHANGE_PLAN.md Session 3): where
 * the person who asked for their kits to be shipped lands from the link staff
 * sent, to see the fee and pay it through PayMongo with the transaction fee on
 * top (L7). A copy of `/pay/change/[token]`.
 *
 * **What it shows is decided by who can end up holding the link**: the race,
 * the order and switch references, the number of kits and the money. Never an
 * email, a whole name, a whole phone or the street the kits ship to: the link
 * is pasted into Messenger and forwarded. Where the kits go is shown only as
 * far as the barangay, and a receiver other than Runner 1 by first name and
 * initial and a masked mobile (`shipsToRows`), enough for the payer to know it
 * is their delivery; the email carries the whole address.
 *
 * **Back from PayMongo (`?paid=1`) it asks PayMongo first**, since a webhook
 * can be late and never reaches a developer's machine: a switch still waiting
 * is looked up and, if PayMongo says it was paid, settled here through the
 * same `settleSwitchOnline` the webhook takes.
 *
 * Every way the link can stop working has its own designed panel (PROJECT_GUIDE
 * §8 rule 1): applied, cancelled, expired, a link that is not valid, and too
 * many tries. The rule behind them is `switchPayableStateOf`.
 */
export default async function SwitchPayPage({
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
  if (!allowRequest('switch-pay-page', caller, PAY_LINK_RULE)) {
    return (
      <Notice
        icon={<Clock size={30} aria-hidden="true" />}
        eyebrow="Please wait"
        title="Too Many Tries"
        body="This link was opened many times from your connection in the last minute. Wait a minute, then open it again."
      />
    );
  }

  const changeId = await readSwitchPaymentToken(token);
  let change = changeId ? await readSwitchForPayment(changeId) : null;

  if (!change || change.orders.length === 0) {
    const { contactEmail } = await getSiteSettings();
    return (
      <Notice
        icon={<Link2Off size={30} aria-hidden="true" />}
        eyebrow="Payment link"
        title="This Link Has Expired"
        body="A kit delivery payment link lasts only as long as the switch waits for its payment. Email us if you still want your kits delivered, and we will help you."
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
      await settleSwitchOnline(change.id);
      change = (await readSwitchForPayment(change.id)) ?? change;
    }
  }

  const order = receiptOf(change);
  const eventLink = `/events/${change.event.slug}`;
  const state = switchPayableStateOf(change);

  if (state !== 'payable') {
    return <Closed state={state} changeRef={change.changeRef} orderRef={order.orderRef} eventTitle={change.event.title} eventLink={eventLink} />;
  }

  if (paid === '1') {
    return (
      <Notice
        icon={<Hourglass size={30} aria-hidden="true" />}
        eyebrow={change.changeRef}
        title="Confirming Your Payment"
        body="Thank you. PayMongo has not confirmed the payment for your kit delivery yet. This usually takes a minute: open this link again shortly, and watch your email for the confirmation."
        actions={<PrimaryLink href={`/pay/logistics/${token}`}>Check Again</PrimaryLink>}
      />
    );
  }

  const method = onlineChangeMethod();
  const transactionFee = method ? transactionFeeFor(change.fee, method) : 0;
  const total = change.fee + transactionFee;
  const kits = order.runners.length;

  const rows: [string, React.ReactNode][] = [
    ['Race', change.event.title],
    ['Race day', formatEventDay(change.event.date)],
    ['Order', order.orderRef],
    ['Switch', change.changeRef],
    ['Kits', `${kits} ${kits === 1 ? 'kit' : 'kits'}`],
    ...shipsToRows(change),
    ...(method ? [['Payment method', paymentMethodLabel(method)] as [string, string]] : []),
    ...(change.holdUntil ? [['Pay by', formatEventInstant(change.holdUntil)] as [string, string]] : []),
  ];
  const money: [string, number][] = [
    ['Delivery fee', change.fee],
    ...(transactionFee > 0 ? [['Transaction fee', transactionFee] as [string, number]] : []),
  ];

  return (
    <Frame>
      <StatusPanel>
        <div className="flex flex-col items-center text-center">
          <IconBadge>
            <Truck size={30} aria-hidden="true" />
          </IconBadge>
          <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-[0.3em] text-secondary">Kit delivery</p>
          <h1 className="mb-3 bg-gradient-to-r from-white to-white/60 bg-clip-text text-2xl font-black uppercase tracking-wide text-transparent text-balance sm:text-3xl">
            Ship Your Race Kits
          </h1>
          <p className="m-0 max-w-md text-base leading-relaxed text-secondary">
            Pay the delivery fee below to have your kits shipped instead of picked up. They stay for pickup until it is
            paid, and your confirmation comes by email once PayMongo confirms the payment.
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
              <dd className="m-0 shrink-0 text-sm font-semibold tabular-nums text-white">{peso(centavos)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 bg-white/[0.03] px-4 py-4">
            <dt className="text-sm font-bold uppercase tracking-wide text-secondary">Amount due</dt>
            <dd className="m-0 text-xl font-black tabular-nums text-white">{peso(total)}</dd>
          </div>
        </dl>

        <div className="mx-auto mt-8 flex w-full max-w-md flex-col items-stretch gap-3">
          {method ? (
            <PayNowButton token={token} amount={peso(total)} kind="switch" />
          ) : (
            <p role="alert" className="m-0 text-center text-sm font-medium text-red-400">
              Online payment is not available right now. Reply to the email we sent and we will help you pay.
            </p>
          )}
          <p className="m-0 text-center text-xs leading-relaxed text-secondary">
            You will be taken to PayMongo to pay. Any payment page opened for this switch before stops working once you
            press Pay now.
          </p>
        </div>
      </StatusPanel>
    </Frame>
  );
}

/** Each way a switch's link stops working, in the customer's words. */
/** Where the kits ship, without the street or the receiver's whole name and number. */
function shipsToRows(change: { deliveryAddress: string | null; deliverySplit: boolean }): [string, string][] {
  if (change.deliverySplit) return [['Ships to', "Each runner's home address"]];
  const parts = parseDeliveryAddress(change.deliveryAddress);
  const area = parts.city
    ? [parts.barangay, parts.city, [parts.province, parts.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : 'The address on your order';
  return [
    ['Ships to', area],
    ...(parts.otherReceiver
      ? [['Receiver', [maskName(parts.receiverName), maskPhone(parts.receiverPhone)].filter(Boolean).join(' · ')] as [string, string]]
      : []),
  ];
}

/** "MARIA SANTOS" → "MARIA S." */
function maskName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : (first ?? '');
}

/** "+639171234567" → "+63917 ••• 4567" */
function maskPhone(phone: string): string {
  const raw = phone.trim();
  return raw.length > 7 ? `${raw.slice(0, -7)} ••• ${raw.slice(-4)}` : '';
}

function Closed({
  state,
  changeRef,
  orderRef,
  eventTitle,
  eventLink,
}: {
  state: Exclude<ChangePayableState, 'payable'>;
  changeRef: string;
  orderRef: string;
  eventTitle: string;
  eventLink: string;
}) {
  if (state === 'applied') {
    return (
      <Notice
        icon={<CircleCheck size={30} aria-hidden="true" />}
        eyebrow={changeRef}
        title="Kits Switched to Delivery"
        body={`The kits on order ${orderRef} for ${eventTitle} will be delivered. There is nothing left to pay, and the confirmation was sent by email; check your spam folder if you cannot find it.`}
        actions={<PrimaryLink href={eventLink}>View the Race</PrimaryLink>}
      />
    );
  }
  if (state === 'cancelled') {
    return (
      <Notice
        icon={<XCircle size={30} aria-hidden="true" />}
        eyebrow={changeRef}
        title="This Switch Was Cancelled"
        body={`The switch to delivery for order ${orderRef} was cancelled, so it can no longer be paid. Your kits stay for pickup. Reply to our email if you still want them delivered.`}
        actions={<PrimaryLink href={eventLink}>View the Race</PrimaryLink>}
      />
    );
  }
  return (
    <Notice
      icon={<CalendarX size={30} aria-hidden="true" />}
      eyebrow={changeRef}
      title="This Switch Has Expired"
      body={`The time to pay for delivery of order ${orderRef} for ${eventTitle} has run out, or switching has closed for this race. Your kits stay for pickup. Reply to our email if you still want them delivered.`}
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
