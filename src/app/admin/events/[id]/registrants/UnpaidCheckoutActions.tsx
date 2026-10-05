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
 */

import React, { useState } from 'react';
import { Copy, Mail, MessageSquareText, NotebookPen, Phone, SearchCheck } from 'lucide-react';
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
  canCheckPayment,
  onLogFollowUp,
  className,
}: {
  order: UnpaidCheckout;
  /** `registration:validate`: a check that finds the money settles the order. */
  canCheckPayment: boolean;
  onLogFollowUp: (order: UnpaidCheckout) => void;
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
  const actions: RowAction[] = [
    ...(canCheckPayment
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
    { key: 'follow-up', label: 'Log follow-up…', icon: <NotebookPen size={16} aria-hidden="true" />, onSelect: () => onLogFollowUp(order) },
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
