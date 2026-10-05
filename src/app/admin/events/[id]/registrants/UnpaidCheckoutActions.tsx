"use client";

/**
 * One unpaid order's ⋮ menu on the Unpaid checkouts tab
 * (UNPAID_FOLLOWUP_PLAN.md Batch 1), split out of `UnpaidCheckoutsList.tsx`
 * with the handlers behind it. It replaced the row's two buttons, Check
 * payment and Copy contact, because the follow-up batches keep adding to what
 * staff can do with an order, and a row of buttons had already pushed the
 * table past its frame.
 *
 * **In the order staff need it.** Check payment comes first: a QRPh payment can
 * land while its webhook never does, and chasing a runner who already paid is
 * the worst outcome. Then the ways to reach the runner — Call, Text and Email
 * open the phone's dialer, messaging app or mail app straight from a phone on
 * race-week, and Copy contact is kept for pasting into Messenger or Viber. Log
 * follow-up… records how it went, so the next staff member does not call the
 * same runner again.
 *
 * **Check payment is shown only to the roles that may settle a payment**
 * (`registration:validate`), since a check that finds the money marks the
 * order PAID; the route refuses the rest. A found payment reloads the page,
 * which moves the order to the Registrants tab.
 *
 * **Cancel order… comes last, in the danger tone** (UNPAID_FOLLOWUP_PLAN.md
 * Batch 2), for the same roles, since the status route asks
 * `registration:validate` for any status change (decision D3). It is offered
 * only while the order is awaiting payment: an expired one already gave its
 * slot and promo back. A cancelled order keeps only the ways to reach the
 * runner, for the day a cancel turns out to be a mistake; there is nothing
 * left on it to check or follow up.
 */

import React, { useState } from 'react';
import { Ban, Copy, Link2, Mail, MessageSquareText, NotebookPen, Phone, SearchCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import RowActionsMenu, { type RowAction } from '../../../RowActionsMenu';
import { useAlert } from '@/components/ui/AlertProvider';
import BusyLabel from '@/components/ui/BusyLabel';
import type { UnpaidCheckout } from './UnpaidCheckoutsList';

/** A phone number as a `tel:` / `sms:` link reads it: digits and a leading +. */
function dialable(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

export default function UnpaidCheckoutActions({
  order,
  eventSlug,
  canValidate,
  canEmail,
  onLogFollowUp,
  onCancel,
  className,
}: {
  order: UnpaidCheckout;
  /** For an expired order's registration link. */
  eventSlug: string;
  /** `registration:validate`: checking the payment and cancelling both settle the order. */
  canValidate: boolean;
  /** `registration:email`: a payment link goes to the runner like any message. */
  canEmail: boolean;
  onLogFollowUp: (order: UnpaidCheckout) => void;
  onCancel: (order: UnpaidCheckout) => void;
  className?: string;
}) {
  const { alert, toast } = useAlert();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  const copyContact = async () => {
    // Name, email and phone on their own lines, with the order reference, so
    // a paste into a chat or a note says who this is and which order.
    const text = [order.contactName, order.contactEmail, order.contactPhone, order.orderRef].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied ${order.contactName}'s contact.`);
    } catch {
      await alert(
        'Your browser would not let us reach the clipboard. Select the email and phone and copy them by hand.',
      );
    }
  };

  // Browsers may refuse the clipboard; the link is then shown to copy by hand.
  const copyLink = async (url: string, done: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast(done);
    } catch {
      await alert({ title: 'Copy this link', message: url });
    }
  };

  const copyPaymentLink = async () => {
    try {
      const res = await fetch(`/api/admin/registrations/${order.id}/payment-link`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({ variant: 'error', title: 'No payment link', message: body.error ?? 'The payment link could not be made. Try again.' });
        // A paid or expired order belongs elsewhere now.
        if (res.status === 409) router.refresh();
        return;
      }
      await copyLink(body.url, `Copied the payment link for ${order.orderRef}. It works until ${body.untilLabel}.`);
      // The first link moves the hold, and the row's "Expires by" with it.
      router.refresh();
    } catch {
      await alert({ variant: 'error', title: 'No payment link', message: 'The server could not be reached. Try again.' });
    }
  };

  const copyRegistrationLink = () =>
    copyLink(
      `${window.location.origin}/events/${eventSlug}/register`,
      'Copied the registration link. The runner registers again from it.',
    );

  const checkPayment = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/admin/registrations/${order.id}/payment-check`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({ variant: 'error', title: 'Could not check', message: body.error ?? 'The check could not be finished. Try again.' });
        return;
      }
      const settled = body.result === 'marked_paid' || body.result === 'already_paid';
      await alert({
        variant: settled ? 'success' : body.result === 'paid_after_expiry' ? 'error' : 'info',
        title: settled
          ? 'Payment found'
          : body.result === 'paid_after_expiry'
            ? 'Paid after it expired'
            : 'No payment found',
        message: body.message,
      });
      // A paid order leaves this tab for the Registrants tab, and both counts
      // move, so the page is read again rather than patched here.
      if (settled) router.refresh();
    } catch {
      await alert({ variant: 'error', title: 'Could not check', message: 'PayMongo could not be reached. Try again in a minute.' });
    } finally {
      setChecking(false);
    }
  };

  const phone = dialable(order.contactPhone);
  const open = order.status !== 'CANCELLED';
  const actions: RowAction[] = [
    ...(canValidate && open
      ? [{
          key: 'check',
          label: checking ? 'Checking payment…' : 'Check payment',
          icon: <SearchCheck size={16} aria-hidden="true" />,
          onSelect: checkPayment,
          disabled: checking,
        }]
      : []),
    ...(phone
      ? [
          { key: 'call', label: 'Call', icon: <Phone size={16} aria-hidden="true" />, href: `tel:${phone}`, sameTab: true },
          { key: 'sms', label: 'Text (SMS)', icon: <MessageSquareText size={16} aria-hidden="true" />, href: `sms:${phone}`, sameTab: true },
        ]
      : []),
    {
      key: 'email',
      label: 'Email',
      icon: <Mail size={16} aria-hidden="true" />,
      // The reference in the subject, so the runner's reply names the order.
      href: `mailto:${order.contactEmail}?subject=${encodeURIComponent(`Your registration ${order.orderRef}`)}`,
      sameTab: true,
    },
    { key: 'copy', label: 'Copy contact', icon: <Copy size={16} aria-hidden="true" />, onSelect: copyContact },
    ...(canEmail && order.status === 'PENDING'
      ? [{ key: 'pay-link', label: 'Copy payment link', icon: <Link2 size={16} aria-hidden="true" />, onSelect: copyPaymentLink }]
      : []),
    ...(canEmail && order.status === 'EXPIRED'
      ? [{ key: 'register-link', label: 'Copy registration link', icon: <Link2 size={16} aria-hidden="true" />, onSelect: copyRegistrationLink }]
      : []),
    ...(open
      ? [{ key: 'follow-up', label: 'Log follow-up…', icon: <NotebookPen size={16} aria-hidden="true" />, onSelect: () => onLogFollowUp(order) }]
      : []),
    ...(canValidate && order.status === 'PENDING'
      ? [{
          key: 'cancel',
          label: 'Cancel order…',
          icon: <Ban size={16} aria-hidden="true" />,
          onSelect: () => onCancel(order),
          danger: true,
        }]
      : []),
  ];

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <RowActionsMenu label={`order ${order.orderRef}`} actions={actions} />
      {/* The menu closes when Check payment is pressed, so the wait shows
          beside it until PayMongo answers. After the ⋮, so the ⋮ stays under
          its column header. */}
      {checking && (
        <span className="text-xs text-secondary whitespace-nowrap">
          <BusyLabel>Checking</BusyLabel>
        </span>
      )}
    </div>
  );
}
