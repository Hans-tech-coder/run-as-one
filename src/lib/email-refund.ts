import { renderMessage, type EmailMessage } from './email-document';

/**
 * The runner's email once a refund is recorded as paid (REFUND_PLAN.md D6): the
 * amount and the reference to look for. Refunds are paid by hand, so this is
 * the runner's only word that the money went out. Beside `email.ts`, like the
 * category change's, because it is about one runner and not the order's receipt.
 */
export function runnerRefundedEmail(refund: {
  runner: { firstName: string; email: string };
  eventTitle: string;
  orderRef: string;
  amount: number;
  reference: string | null;
}): Promise<EmailMessage> {
  const firstName = refund.runner.firstName.split(' ')[0] || refund.runner.firstName;
  return renderMessage({
    to: refund.runner.email,
    subject: `Refund sent — ${refund.eventTitle} (${refund.orderRef})`,
    status: { label: 'Refunded', tone: 'success' },
    footerTopic: 'refund',
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstName}, your entry for `,
          { strong: refund.eventTitle },
          ' has been refunded, and you no longer hold a slot in this race. The platform, transaction and delivery fees are not refundable.',
        ],
      },
      { kind: 'heading', text: 'Refund Details' },
      {
        kind: 'card',
        rows: [
          { kind: 'info', label: 'Order Reference', value: refund.orderRef },
          ...(refund.reference ? [{ kind: 'info' as const, label: 'Refund Reference', value: refund.reference }] : []),
          { kind: 'rule' as const },
          { kind: 'total' as const, label: 'Refunded', centavos: refund.amount },
        ],
      },
    ],
  });
}
