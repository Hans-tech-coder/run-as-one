import { formatPesos } from './money';
import { kitDifference } from './category-change';
import { isOutsidePayment } from './category-change-hold';
import { formatEventInstant } from './event-schedule';
import { paymentMethodLabel } from './registration-codes';
import {
  type EmailDocument,
  type EmailMessage,
  type EmailOutcome,
  type Row,
  renderMessage,
  sendEmail,
} from './email-document';

/**
 * **The emails about a category change** (CATEGORY_CHANGE_PLAN.md): what a
 * runner is told when staff move them to another category. Built and sent
 * through email-document.ts like every other email; kept beside email.ts, not
 * in it, because email.ts is about the order and its receipt, which a change
 * never edits (D1), and because it was already past the size the repository
 * splits files at.
 *
 * `categoryChangeAppliedEmail` is the one Session 2 sends: old → new, the money
 * (what was paid, what will be refunded, or what the race's policy keeps), and
 * the kit difference, so the runner learns of a singlet or medal that changed
 * before kit claiming rather than at the table. Its delivery is stamped on the
 * change (`appliedEmailSentAt`, `lastEmailError`); a send Resend refuses is
 * sent by hand from the runner's history, the way a registration email is.
 *
 * `categoryChangeCreatedEmail` (Session 3) is the upgrade's: what is owed and
 * why, line by line, and how to pay it — the payment link for an online
 * payment, or Run As One's GCash and bank accounts for one sent outside the
 * app, with the link to send its proof on — and until when the new seat is
 * held. Stamped on `createdEmailSentAt`, with the same by-hand fallback.
 *
 * `categoryChangeProofReceivedEmail` says the GCash or bank proof the runner
 * sent on the link arrived, as a delivery switch's does. Not stamped: the
 * proof itself is the record.
 */

/** What the applied email reads off a change, its runner and its event. */
export type AppliedChangeForEmail = {
  changeRef: string;
  status: string;
  basis: number;
  toPrice: number;
  changeFee: number;
  /** PayMongo's cut on an online upgrade (D13); 0 or absent otherwise. */
  transactionFee?: number;
  amount: number;
  totalCharged: number;
  refundAmount: number;
  fromInclusions: string[];
  toInclusions: string[];
  fromCategory: { name: string; distance: string };
  toCategory: { name: string; distance: string };
  runner: { firstName: string; lastName: string; email: string };
  registration: { orderRef: string };
  event: { title: string };
};

function peso(centavos: number): string {
  return `₱${formatPesos(centavos)}`;
}

function categoryLabel(category: { name: string; distance: string }): string {
  return category.distance && !category.name.includes(category.distance)
    ? `${category.name} (${category.distance})`
    : category.name;
}

/** The one sentence on what became of the money, in the runner's terms. */
function moneyOutcome(change: AppliedChangeForEmail): string {
  if (change.status === 'REFUND_DUE' || change.status === 'REFUNDED') {
    return `We will refund ${peso(change.refundAmount)} to you by GCash or bank transfer, and send you the reference once it is paid.`;
  }
  if (change.totalCharged > 0) return `You paid ${peso(change.totalCharged)} for this change.`;
  if (change.amount < 0) {
    return `The new category costs less, but under this race's policy the difference of ${peso(-change.amount)} is not refunded.`;
  }
  return 'There is nothing to pay for this change.';
}

/**
 * Sent once a change is applied: the runner now stands in the new category.
 * Addressed to the runner who moved, not the order's contact, because on a
 * group order it is that runner whose bib and kit changed.
 */
export function categoryChangeAppliedEmail(change: AppliedChangeForEmail): Promise<EmailMessage> {
  const firstName = change.runner.firstName.split(' ')[0] || change.runner.firstName;
  const kit = kitDifference(change.fromInclusions, change.toInclusions);

  const money: Row[] = [
    { kind: 'amount', label: 'Paid for your entry', centavos: change.basis },
    { kind: 'amount', label: `${change.toCategory.name} price`, centavos: change.toPrice },
    ...(change.changeFee > 0
      ? [{ kind: 'amount' as const, label: 'Change fee', centavos: change.changeFee }]
      : []),
    // Without it an online upgrade's rows would not add up to what was paid.
    ...((change.transactionFee ?? 0) > 0
      ? [{ kind: 'amount' as const, label: 'Transaction fee', centavos: change.transactionFee ?? 0 }]
      : []),
    { kind: 'rule' },
    change.status === 'REFUND_DUE' || change.status === 'REFUNDED'
      ? { kind: 'total', label: 'To Refund', centavos: change.refundAmount }
      : { kind: 'total', label: 'To Pay', centavos: Math.max(0, change.totalCharged) },
  ];

  const kitRows: Row[] = [
    ...(kit.added.length > 0 ? [{ kind: 'info' as const, label: 'Now included', value: kit.added.join(', ') }] : []),
    ...(kit.removed.length > 0
      ? [{ kind: 'info' as const, label: 'No longer included', value: kit.removed.join(', ') }]
      : []),
  ];

  return renderMessage({
    to: change.runner.email,
    // The change reference keeps it its own thread, apart from the receipt.
    subject: `Category changed — ${change.event.title} (${change.changeRef})`,
    status: { label: 'Category Changed', tone: 'success' },
    footerTopic: 'change',
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstName}, your category for `,
          { strong: change.event.title },
          ' has been changed from ',
          { strong: categoryLabel(change.fromCategory) },
          ' to ',
          { strong: categoryLabel(change.toCategory) },
          '. Your registration and its receipt stay as they were; this email is the record of the change.',
        ],
      },
      { kind: 'heading', text: 'Change Details' },
      {
        kind: 'card',
        rows: [
          { kind: 'info', label: 'Change Reference', value: change.changeRef },
          { kind: 'info', label: 'Order Reference', value: change.registration.orderRef },
          { kind: 'info', label: 'Runner', value: `${change.runner.firstName} ${change.runner.lastName}` },
          { kind: 'info', label: 'From', value: categoryLabel(change.fromCategory) },
          { kind: 'info', label: 'To', value: categoryLabel(change.toCategory) },
        ],
      },
      ...(kitRows.length > 0
        ? [
            { kind: 'heading' as const, text: 'Your Race Kit' },
            { kind: 'card' as const, rows: kitRows },
          ]
        : []),
      { kind: 'heading', text: 'Money' },
      { kind: 'rows', rows: money },
      { kind: 'note', segments: [`${moneyOutcome(change)} If anything here looks wrong, reply to this email.`] },
    ],
  });
}

/** What the created email reads: the applied email's fields, plus how it is paid. */
export type CreatedChangeForEmail = AppliedChangeForEmail & {
  paymentMethod: string | null;
  transactionFee: number;
  holdUntil: Date | null;
  event: {
    title: string;
    bankAccounts: { bankName: string; accountName: string; accountNumber: string; qrImageUrl?: string | null }[];
  };
};

/**
 * Sent when an upgrade is opened and is waiting for its payment: old → new,
 * the breakdown to the centavo the runner will pay, how to pay it, and until
 * when the new seat is held. `url` is the change's link: for an online payment
 * the page that pays it; for GCash or bank the accounts come first, and the
 * same page is where the runner sends the screenshot and reference for staff
 * to validate (`category-change-runner.ts`). Without a link the runner is
 * asked to reply with them instead.
 */
export function categoryChangeCreatedEmail(change: CreatedChangeForEmail, url: string | null): Promise<EmailMessage> {
  const firstName = change.runner.firstName.split(' ')[0] || change.runner.firstName;
  const kit = kitDifference(change.fromInclusions, change.toInclusions);
  const outside = isOutsidePayment(change.paymentMethod);
  const until = change.holdUntil ? `${formatEventInstant(change.holdUntil)}, Manila time` : null;

  const money: Row[] = [
    { kind: 'amount', label: 'Paid for your entry', centavos: change.basis },
    { kind: 'amount', label: `${change.toCategory.name} price`, centavos: change.toPrice },
    ...(change.changeFee > 0 ? [{ kind: 'amount' as const, label: 'Change fee', centavos: change.changeFee }] : []),
    ...(change.transactionFee > 0
      ? [{ kind: 'amount' as const, label: 'Transaction fee', centavos: change.transactionFee }]
      : []),
    { kind: 'rule' },
    { kind: 'total', label: 'To Pay', centavos: change.totalCharged },
  ];

  // One card per account, its QR under it when one was uploaded — the runner
  // scans the one for the app they pay with. Only a public https address is
  // drawn: a mail client fetches the picture itself.
  const accounts: EmailDocument['blocks'] = change.event.bankAccounts.flatMap(account => [
    {
      kind: 'card' as const,
      rows: [{ kind: 'info' as const, label: account.bankName, value: `${account.accountName} · ${account.accountNumber}` }],
    },
    ...(account.qrImageUrl?.startsWith('https://')
      ? [
          {
            kind: 'image' as const,
            src: account.qrImageUrl,
            alt: `${account.bankName} QR code`,
            caption: `Scan with ${account.bankName}`,
          },
        ]
      : []),
  ]);

  const howToPay: EmailDocument['blocks'] = outside
    ? [
        { kind: 'heading', text: 'How to Pay' },
        ...(accounts.length > 0
          ? [
              {
                kind: 'paragraph' as const,
                segments: [`Send exactly `, { strong: peso(change.totalCharged) }, ' by GCash or bank transfer to one of these accounts:'],
              },
              ...accounts,
            ]
          : []),
        {
          kind: 'paragraph',
          segments: [
            accounts.length === 0
              ? 'Reply to this email and we will send you where to pay by GCash or bank transfer. '
              : url
                ? 'Then send us the screenshot of your payment and its reference number on your payment page. '
                : 'Then reply to this email with the reference number of your payment and its screenshot. ',
            'We move you to the new category once we have checked it.',
          ],
        },
        ...(url && accounts.length > 0 ? [{ kind: 'button' as const, label: 'Send Your Payment Proof', href: url }] : []),
      ]
    : url
      ? [{ kind: 'button', label: `Pay ${peso(change.totalCharged)}`, href: url }]
      : [];

  return renderMessage({
    to: change.runner.email,
    subject: `Pay for your category change — ${change.event.title} (${change.changeRef})`,
    status: { label: 'Payment Pending', tone: 'pending' },
    footerTopic: 'change',
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstName}, your move for `,
          { strong: change.event.title },
          ' from ',
          { strong: categoryLabel(change.fromCategory) },
          ' to ',
          { strong: categoryLabel(change.toCategory) },
          ' is ready. It applies once ',
          { strong: peso(change.totalCharged) },
          ' is paid',
          ...(until ? ['. Your seat in the new category is held until ', { strong: until }] : []),
          '.',
        ],
      },
      ...howToPay,
      { kind: 'heading', text: 'Change Details' },
      {
        kind: 'card',
        rows: [
          { kind: 'info', label: 'Change Reference', value: change.changeRef },
          { kind: 'info', label: 'Order Reference', value: change.registration.orderRef },
          { kind: 'info', label: 'Runner', value: `${change.runner.firstName} ${change.runner.lastName}` },
          { kind: 'info', label: 'From', value: categoryLabel(change.fromCategory) },
          { kind: 'info', label: 'To', value: categoryLabel(change.toCategory) },
          ...(change.paymentMethod
            ? [{ kind: 'info' as const, label: 'Payment', value: outside ? 'GCash or bank transfer' : paymentMethodLabel(change.paymentMethod) }]
            : []),
        ],
      },
      ...(kit.changed
        ? [
            { kind: 'heading' as const, text: 'Your Race Kit' },
            {
              kind: 'card' as const,
              rows: [
                ...(kit.added.length > 0 ? [{ kind: 'info' as const, label: 'Now included', value: kit.added.join(', ') }] : []),
                ...(kit.removed.length > 0
                  ? [{ kind: 'info' as const, label: 'No longer included', value: kit.removed.join(', ') }]
                  : []),
              ],
            },
          ]
        : []),
      { kind: 'heading', text: 'What You Pay' },
      { kind: 'rows', rows: money },
      {
        kind: 'note',
        segments: [
          `Until it is paid you stay in ${change.fromCategory.name}, and your registration and its receipt are unchanged. `,
          until
            ? `If it is not paid by ${until}, the seat is released and you stay in ${change.fromCategory.name}. `
            : '',
          'Already paid, or changed your mind? Reply to this email.',
        ],
      },
    ],
  });
}

/** What the *proof received* email reads. */
export type ChangeProofForEmail = {
  changeRef: string;
  totalCharged: number;
  transactionNumber: string;
  fromCategory: { name: string };
  toCategory: { name: string };
  runner: { firstName: string; email: string };
  event: { title: string };
};

/** Sent when the runner hands in the GCash or bank proof on the change's link. */
export function categoryChangeProofReceivedEmail(change: ChangeProofForEmail): Promise<EmailMessage> {
  const firstName = change.runner.firstName.split(' ')[0] || change.runner.firstName;
  return renderMessage({
    to: change.runner.email,
    subject: `We received your payment proof — ${change.event.title} (${change.changeRef})`,
    status: { label: 'Proof Received', tone: 'pending' },
    footerTopic: 'change',
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstName}, thank you. We received the proof of your `,
          { strong: peso(change.totalCharged) },
          ' payment to move from ',
          { strong: change.fromCategory.name },
          ' to ',
          { strong: change.toCategory.name },
          ' for ',
          { strong: change.event.title },
          `. We check it against our account, then move you and email you. Your seat in ${change.toCategory.name} stays held meanwhile.`,
        ],
      },
      {
        kind: 'card',
        rows: [
          { kind: 'info', label: 'Change Reference', value: change.changeRef },
          { kind: 'info', label: 'Payment Reference', value: change.transactionNumber },
        ],
      },
      {
        kind: 'note',
        segments: ['Sent the wrong screenshot? Open the link from our earlier email and replace it, or reply to this email.'],
      },
    ],
  });
}

/** Sent as rendered, so the caller holds the message to hand over by hand when Resend refuses it. */
export function sendCategoryChangeEmail(message: EmailMessage): Promise<EmailOutcome> {
  return sendEmail(message);
}
