import React from 'react';
import { CalendarX, ChevronRight, CircleCheck, Clock, CreditCard, Hourglass, Undo2, XCircle } from 'lucide-react';
import type { TrackStatusKind, TrackView } from '@/lib/track';
import { formatPesos } from '@/lib/money';

/**
 * The status card (TRACK_PAGE_PLAN.md §3): what is true about the order now and
 * what happens next, in one sentence each — never a bare "Processing". A bank
 * transfer reads *For validation* or *Validated*, because "is my transfer
 * validated?" is the message staff get most. An unpaid online order inside its
 * hold carries *Complete payment* (D5), the resume-payment link.
 *
 * Under it, any upgrade or delivery switch still waiting on money, with what is
 * owed and its own pay link.
 */

type Tone = 'success' | 'pending' | 'danger' | 'muted';

const TONES: Record<Tone, string> = {
  success: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  pending: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  danger: 'border-red-400/25 bg-red-400/10 text-red-300',
  muted: 'border-white/10 bg-white/[0.06] text-secondary',
};

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

function copyFor(status: TrackView['status'], registerHref: string | null): {
  tone: Tone;
  badge: string;
  icon: React.ReactNode;
  title: string;
  body: string;
} {
  const at = status.at;
  const by = status.registeredBy;
  const iconProps = { size: 22, 'aria-hidden': true } as const;
  const cases: Record<TrackStatusKind, () => ReturnType<typeof copyFor>> = {
    validated: () => ({
      tone: 'success',
      badge: 'Validated',
      icon: <CircleCheck {...iconProps} />,
      title: 'Payment validated',
      body: `${by ? `${by}'s bank transfer` : 'Your bank transfer'} was confirmed${at ? ` on ${at}` : ''}. You are officially registered.`,
    }),
    paid: () => ({
      tone: 'success',
      badge: 'Paid',
      icon: <CircleCheck {...iconProps} />,
      title: status.method === 'Complimentary' ? 'Entry confirmed' : 'Payment confirmed',
      body:
        status.method === 'Complimentary'
          ? 'This is a complimentary entry, so there is nothing to pay. You are officially registered.'
          : `${by ? `${by} paid` : 'You paid'}${status.method ? ` via ${status.method}` : ''}${at ? `, confirmed on ${at}` : ''}. You are officially registered.`,
    }),
    'for-validation': () => ({
      tone: 'pending',
      badge: 'For validation',
      icon: <Hourglass {...iconProps} />,
      title: 'Payment for validation',
      body: `We received ${by ? `${by}'s` : 'your'} proof of payment${at ? ` on ${at}` : ''} and are checking it against our bank. No need to upload it again. You will get an email once it is validated.`,
    }),
    unpaid: () => ({
      tone: 'pending',
      badge: 'Not paid yet',
      icon: <CreditCard {...iconProps} />,
      title: 'Not paid yet',
      body: `This registration is saved but not confirmed. We are holding the slot until ${status.holdUntil}, Manila time. Complete the payment to keep it.`,
    }),
    'unpaid-closed': () => ({
      tone: 'pending',
      badge: 'Not paid yet',
      icon: <Clock {...iconProps} />,
      title: 'Not paid yet',
      body: 'This registration is not paid, and it can no longer be paid online. Contact us below and we will help you finish.',
    }),
    expired: () => ({
      tone: 'danger',
      badge: 'Expired',
      icon: <CalendarX {...iconProps} />,
      title: 'Registration expired',
      body: `This registration expired because the payment was not ${status.method === 'Bank Transfer' ? 'validated' : 'completed'}${at ? ` by ${at}` : ' in time'}, and its slot was released.${registerHref ? ' If you still want to run, register again.' : ''}`,
    }),
    cancelled: () => ({
      tone: 'muted',
      badge: 'Cancelled',
      icon: <XCircle {...iconProps} />,
      title: 'Registration cancelled',
      body: 'This registration was cancelled, so it no longer holds a slot. If you think this is a mistake, contact us below.',
    }),
    refunded: () => ({
      tone: 'muted',
      badge: 'Refunded',
      icon: <Undo2 {...iconProps} />,
      title: 'Registration refunded',
      body: 'This registration was refunded and no longer holds a slot. Contact us below if you have a question about the refund.',
    }),
  };
  return cases[status.kind]();
}

export default function TrackStatusCard({ view }: { view: TrackView }) {
  const { status } = view;
  const copy = copyFor(status, view.event.registerHref);

  return (
    <section aria-labelledby="track-status-title" className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border ${TONES[copy.tone]}`}>
          {copy.icon}
        </div>
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${TONES[copy.tone]}`}>
            {copy.badge}
          </span>
          <h2 id="track-status-title" className="mb-1 mt-2 text-lg font-black uppercase tracking-wide text-white">
            {copy.title}
          </h2>
          <p className="m-0 text-sm leading-relaxed text-secondary">{copy.body}</p>
          {status.method && status.kind !== 'paid' && status.kind !== 'validated' && (
            <p className="m-0 mt-2 text-xs text-secondary">Payment method: {status.method}</p>
          )}
        </div>
      </div>

      {status.kind === 'unpaid' && status.payUrl && (
        <a
          href={status.payUrl}
          className="btn-gradient group mt-5 w-full no-underline shadow-xl shadow-accent-orange/20"
        >
          <span>Complete Payment</span>
          <ChevronRight size={18} aria-hidden="true" className="shrink-0 transition-transform group-hover:translate-x-1" />
        </a>
      )}
      {status.kind === 'expired' && view.event.registerHref && (
        <a href={view.event.registerHref} className="btn-secondary mt-5 w-full">
          Register Again
        </a>
      )}

      {view.pending.length > 0 && (
        <ul className="m-0 mt-5 flex list-none flex-col gap-3 border-t border-white/[0.06] p-0 pt-5">
          {view.pending.map(item => (
            <li key={`${item.kind}-${item.title}`} className="rounded-[14px] border border-amber-400/20 bg-amber-400/[0.05] p-4">
              <p className="m-0 text-xs font-bold uppercase tracking-wide text-amber-300">
                {item.kind === 'category' ? 'Category change' : 'Delivery switch'}
                {item.proofSubmitted ? ' · for validation' : ' · awaiting payment'}
              </p>
              <p className="m-0 mt-1 break-words text-sm font-semibold text-white">{item.title}</p>
              <p className="m-0 mt-1 text-sm text-secondary">
                {item.proofSubmitted
                  ? `We received your proof of payment for ${peso(item.amount)} and are checking it.`
                  : `${peso(item.amount)} to pay${item.payBy ? ` by ${item.payBy}, Manila time` : ''}. Until it is paid, the change is not applied.`}
              </p>
              {item.payUrl && (
                <a href={item.payUrl} className="btn-secondary mt-3 w-full">
                  Pay {peso(item.amount)}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
