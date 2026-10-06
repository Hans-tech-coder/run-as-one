"use client";

/**
 * **Send payment link to N**, the Unpaid checkouts toolbar's bulk send
 * (UNPAID_FOLLOWUP_PLAN.md Batch 4). Shown with rows marked, counting only
 * the marked orders still awaiting payment, since only those can be sent a
 * link.
 *
 * **It asks first, naming the quota** (decision D7): each email is one of the
 * 100 a day Resend's free tier allows, the same allowance the registration
 * receipts draw on, so the confirm says how many it will use and how many
 * marked rows it skips.
 *
 * **One order at a time**, the way a staff member would send them, so
 * Resend's rate limit is never hit and each order is refused or sent on its
 * own; the route records each one (lib/payment-link.ts). What did not go out
 * is named at the end, to send by hand from its own row's menu.
 */

import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import BusyLabel from '@/components/ui/BusyLabel';
import { requestPaymentLinkEmail } from './UnpaidCheckoutActions';
import type { UnpaidCheckout } from './UnpaidCheckoutsList';

export default function SendLinksButton({
  selected,
  onDone,
}: {
  /** The marked orders, whatever their status. */
  selected: UnpaidCheckout[];
  /** Clears the marks and reads the page again, so each row shows "Link sent". */
  onDone: () => void;
}) {
  const { alert, confirm } = useAlert();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const targets = selected.filter(order => order.status === 'PENDING');

  if (targets.length === 0 && !progress) return null;

  const send = async () => {
    const n = targets.length;
    const skipped = selected.length - n;
    const go = await confirm({
      variant: 'info',
      title: `Email the payment link to ${n} ${n === 1 ? 'runner' : 'runners'}?`,
      message: `Each gets an email with a link to finish paying. This uses ${n} of the 100 emails the site can send a day, the same allowance registration receipts use.${
        skipped > 0 ? ` ${skipped} marked ${skipped === 1 ? 'order is' : 'orders are'} not awaiting payment and will be skipped.` : ''
      }`,
      confirmLabel: `Send ${n} ${n === 1 ? 'Email' : 'Emails'}`,
    });
    if (!go) return;

    const notSent: string[] = [];
    setProgress({ done: 0, total: n });
    for (const [index, order] of targets.entries()) {
      const reply = await requestPaymentLinkEmail(order.id, 'email');
      if (!reply.ok) notSent.push(`${order.orderRef}: ${reply.error}`);
      else if (!reply.sent) notSent.push(`${order.orderRef}: ${reply.error ?? 'Resend did not send it.'}`);
      setProgress({ done: index + 1, total: n });
    }
    setProgress(null);
    onDone();

    const sentCount = n - notSent.length;
    await alert({
      variant: notSent.length === 0 ? 'success' : sentCount === 0 ? 'error' : 'info',
      title: notSent.length === 0 ? 'Payment links sent' : `Sent ${sentCount} of ${n}`,
      message: notSent.length === 0
        ? `Emailed the payment link to ${n} ${n === 1 ? 'runner' : 'runners'}. Their rows now read "Link sent".`
        : (
          <>
            <span className="block">Not sent, so send these by hand from each row&apos;s menu:</span>
            {notSent.map(line => (
              <span key={line} className="block mt-1 [overflow-wrap:anywhere]">{line}</span>
            ))}
          </>
        ),
    });
  };

  return (
    <button onClick={send} className="btn-light" disabled={progress !== null}>
      {progress ? (
        <BusyLabel>{`Sending ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`}</BusyLabel>
      ) : (
        <>
          <Send size={16} /> Send payment link to {targets.length}
        </>
      )}
    </button>
  );
}
