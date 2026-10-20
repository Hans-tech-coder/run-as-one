import { formatPesos } from './money';
import { isOutsidePayment } from './category-change-hold';
import { formatEventInstant } from './event-schedule';
import { paymentMethodLabel } from './registration-codes';
import { PICKUP_FALLBACK, pickupDetails, pickupLabel } from './pickup';
import {
  type EmailDocument,
  type EmailMessage,
  type EmailOutcome,
  type Row,
  renderMessage,
  sendEmail,
} from './email-document';
import { deliveryAddressDetails } from '@/app/events/[slug]/register/delivery-address';

/**
 * **The emails about a delivery switch** (LOGISTICS_CHANGE_PLAN.md Session 3):
 * what the person who paid for a receipt is told when staff move its kits
 * between pickup and delivery. Built and sent through email-document.ts like
 * every other email, beside `email-category-change.ts` and for the same
 * reason: the receipt is never edited (L4), so these are not receipt emails.
 *
 * Addressed to the order's contact (`customerEmail`), not a runner: a switch
 * moves a whole receipt, and its contact is who paid for it and who asked.
 *
 * - `logisticsChangeCreatedEmail` — *payment needed*: where the kits will ship,
 *   the fee to the centavo, how to pay it (the payment link for an online
 *   payment, or Run As One's GCash and bank accounts and a reply with the
 *   payment's screenshot and reference), and until when. The kits stay on
 *   pickup until it is paid. Stamped on `createdEmailSentAt`.
 * - `logisticsChangeAppliedEmail` — *switched*: the new method, where it ships
 *   or, back to pickup, where and when to collect the kits (`pickup.ts`), and
 *   what the money did. Stamped on `appliedEmailSentAt`.
 *
 * Both show the delivery as the runner gave it at checkout or staff typed it
 * in *Ship kits* (`deliveryAddressDetails`): the address with its ZIP, the
 * landmark, and the receiver's name and mobile when someone else takes the kit.
 *
 * A send Resend refuses goes to `lastEmailError`, and staff send it by hand
 * from the receipt's card, as for a category change.
 */

/** What both emails read off a switch, its receipt and its event. */
export type SwitchForEmail = {
  changeRef: string;
  direction: string;
  deliveryAddress: string | null;
  deliverySplit: boolean;
  fee: number;
  transactionFee: number;
  totalCharged: number;
  paymentMethod: string | null;
  holdUntil: Date | null;
  /** The paid receipt whose parcel this one joined at ₱0 (L6). */
  ridesOn: { orderRef: string } | null;
  order: { orderRef: string; customerName: string; customerEmail: string; kits: number };
  event: {
    title: string;
    format?: string | null;
    pickupLocation?: string | null;
    pickupSchedule?: string | null;
    bankAccounts: { bankName: string; accountName: string; accountNumber: string; qrImageUrl?: string | null }[];
  };
};

function peso(centavos: number): string {
  return `₱${formatPesos(centavos)}`;
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function kitsLabel(kits: number): string {
  return `${kits} ${kits === 1 ? 'kit' : 'kits'}`;
}

/** Where a switch to delivery ships, in the customer's words: the place, the landmark, who receives it. */
function deliveryRows(change: SwitchForEmail): Row[] {
  if (change.deliverySplit) return [{ kind: 'info', label: 'Ships to', value: 'Each runner’s home address on file' }];
  if (!change.deliveryAddress) return [{ kind: 'info', label: 'Ships to', value: 'The address you gave us' }];
  const { place, landmark, receiver } = deliveryAddressDetails(change.deliveryAddress);
  return [
    { kind: 'info', label: 'Ships to', value: place },
    ...(landmark ? [{ kind: 'info' as const, label: 'Landmark', value: landmark }] : []),
    ...(receiver
      ? [
          { kind: 'info' as const, label: 'Receiver', value: receiver.name },
          { kind: 'info' as const, label: 'Receiver’s Mobile', value: receiver.phone },
        ]
      : []),
  ];
}

/** The fee, line by line, adding up to what is paid, under `total`. */
function moneyRows(change: SwitchForEmail, total = 'To Pay'): Row[] {
  return [
    { kind: 'amount', label: 'Delivery fee', centavos: change.fee },
    ...(change.transactionFee > 0
      ? [{ kind: 'amount' as const, label: 'Transaction fee', centavos: change.transactionFee }]
      : []),
    { kind: 'rule' },
    { kind: 'total', label: total, centavos: change.totalCharged },
  ];
}

/** One card per account, its QR under it when there is a public one to draw. */
function accountBlocks(change: SwitchForEmail): EmailDocument['blocks'] {
  return change.event.bankAccounts.flatMap(account => [
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
}

/**
 * Sent when a switch with a fee is opened: where the kits will ship, the fee,
 * how to pay it, and until when. `url` is the payment link for an online
 * payment; a payment sent outside the app gets the accounts instead, and is
 * asked to reply with the screenshot and reference so staff can record it,
 * and with the receiver's name and mobile when someone else takes the kit.
 */
export function logisticsChangeCreatedEmail(change: SwitchForEmail, url: string | null): Promise<EmailMessage> {
  const outside = isOutsidePayment(change.paymentMethod);
  const until = change.holdUntil ? `${formatEventInstant(change.holdUntil)}, Manila time` : null;
  const accounts = accountBlocks(change);
  // The proof reply also brings the receiver, when someone other than the
  // runner takes the kit: staff add it to the switch from that reply.
  const receiver = change.deliverySplit ? null : deliveryAddressDetails(change.deliveryAddress).receiver;
  const receiverAsk = change.deliverySplit
    ? []
    : [
        ' and, ',
        {
          strong: receiver
            ? `if someone other than ${receiver.name} will receive the kit, their name and mobile number`
            : 'if someone else will receive the kit, their name and mobile number',
        },
      ];

  const howToPay: EmailDocument['blocks'] = outside
    ? [
        { kind: 'heading', text: 'How to Pay' },
        ...(accounts.length > 0
          ? [
              {
                kind: 'paragraph' as const,
                segments: ['Send exactly ', { strong: peso(change.totalCharged) }, ' by GCash or bank transfer to one of these accounts:'],
              },
              ...accounts,
            ]
          : []),
        accounts.length > 0
          ? {
              kind: 'paragraph' as const,
              segments: [
                'Then ',
                { strong: 'reply to this email with the screenshot of your payment and its reference number' },
                ...receiverAsk,
                '. We switch your kits to delivery once we have checked it, and email you when it is done.',
              ],
            }
          : {
              kind: 'paragraph' as const,
              segments: [
                'Reply to this email and we will send you where to pay by GCash or bank transfer. ',
                'Once paid, reply with the screenshot of your payment and its reference number',
                ...receiverAsk,
                '. We switch your kits to delivery once we have checked it.',
              ],
            },
      ]
    : url
      ? [{ kind: 'button', label: `Pay ${peso(change.totalCharged)}`, href: url }]
      : [];

  return renderMessage({
    to: change.order.customerEmail,
    // The switch reference keeps it its own thread, apart from the receipt.
    subject: `Pay to ship your race kits — ${change.event.title} (${change.changeRef})`,
    status: { label: 'Payment Pending', tone: 'pending' },
    footerTopic: 'switch',
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstNameOf(change.order.customerName)}, the ${kitsLabel(change.order.kits)} on order `,
          { strong: change.order.orderRef },
          ' for ',
          { strong: change.event.title },
          ' can be delivered instead of picked up. It switches once ',
          { strong: peso(change.totalCharged) },
          ' is paid',
          ...(until ? [', by ', { strong: until }] : []),
          '.',
        ],
      },
      // Where the kits go, right before how to pay, so the runner checks it first.
      { kind: 'heading', text: 'Delivery' },
      { kind: 'card', rows: deliveryRows(change) },
      ...howToPay,
      { kind: 'heading', text: 'Switch Details' },
      {
        kind: 'card',
        rows: [
          { kind: 'info', label: 'Switch Reference', value: change.changeRef },
          { kind: 'info', label: 'Order Reference', value: change.order.orderRef },
          { kind: 'info', label: 'Kits', value: kitsLabel(change.order.kits) },
          ...(change.paymentMethod
            ? [
                {
                  kind: 'info' as const,
                  label: 'Payment',
                  value: outside ? 'GCash or bank transfer' : paymentMethodLabel(change.paymentMethod),
                },
              ]
            : []),
        ],
      },
      { kind: 'heading', text: 'What You Pay' },
      { kind: 'rows', rows: moneyRows(change) },
      {
        kind: 'note',
        segments: [
          'Until it is paid your kits stay for pickup, and your registration and its receipt are unchanged. ',
          until ? `If it is not paid by ${until}, the switch lapses and your kits stay for pickup. ` : '',
          'Already paid, or changed your mind? Reply to this email.',
        ],
      },
    ],
  });
}

/**
 * Sent once a switch applies: to delivery when its fee was paid or it rides
 * free on a paid parcel, or back to pickup (L9). Back to pickup says where and
 * when to collect the kits, in the words the registration email uses
 * (`pickup.ts`), and that nothing is refunded.
 */
export function logisticsChangeAppliedEmail(change: SwitchForEmail): Promise<EmailMessage> {
  const toDelivery = change.direction === 'TO_DELIVERY';
  const { location, schedule } = pickupDetails(change.event);
  const label = pickupLabel(change.event);

  const where: Row[] = toDelivery
    ? [
        ...deliveryRows(change),
        ...(change.ridesOn ? [{ kind: 'info' as const, label: 'Ships with', value: change.ridesOn.orderRef }] : []),
      ]
    : location || schedule
      ? [
          ...(location ? [{ kind: 'info' as const, label: 'Where', value: location }] : []),
          ...(schedule ? [{ kind: 'info' as const, label: 'When', value: schedule }] : []),
        ]
      : [{ kind: 'info', label: 'Where and when', value: PICKUP_FALLBACK }];

  const money = toDelivery
    ? change.totalCharged > 0
      ? `You paid ${peso(change.totalCharged)} for the delivery.`
      : change.ridesOn
        ? `Your kits ship in the same parcel as order ${change.ridesOn.orderRef}, which already paid for delivery to this address, so there is nothing to pay.`
        : 'There is nothing to pay for this switch.'
    : 'Nothing is refunded for the delivery fee already paid.';

  return renderMessage({
    to: change.order.customerEmail,
    subject: `${toDelivery ? 'Your race kits will be delivered' : 'Your race kits are now for pickup'} — ${change.event.title} (${change.changeRef})`,
    status: { label: toDelivery ? 'Switched to Delivery' : 'Switched to Pickup', tone: 'success' },
    footerTopic: 'switch',
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstNameOf(change.order.customerName)}, the ${kitsLabel(change.order.kits)} on order `,
          { strong: change.order.orderRef },
          ' for ',
          { strong: change.event.title },
          toDelivery ? ' will now be ' : ' are now ',
          { strong: toDelivery ? 'delivered' : `claimed at ${label.toLowerCase()}` },
          ' instead. Your registration and its receipt stay as they were; this email is the record of the switch.',
        ],
      },
      { kind: 'heading', text: toDelivery ? 'Delivery' : label },
      { kind: 'card', rows: where },
      { kind: 'heading', text: 'Switch Details' },
      {
        kind: 'card',
        rows: [
          { kind: 'info', label: 'Switch Reference', value: change.changeRef },
          { kind: 'info', label: 'Order Reference', value: change.order.orderRef },
          { kind: 'info', label: 'Kits', value: kitsLabel(change.order.kits) },
          { kind: 'info', label: 'Now', value: toDelivery ? 'Delivery' : label },
        ],
      },
      ...(toDelivery && change.totalCharged > 0
        ? [{ kind: 'heading' as const, text: 'What You Paid' }, { kind: 'rows' as const, rows: moneyRows(change, 'Paid') }]
        : []),
      { kind: 'note', segments: [`${money} If anything here looks wrong, reply to this email.`] },
    ],
  });
}

/** Sent as rendered, so the caller holds the message to hand over by hand when Resend refuses it. */
export function sendLogisticsChangeEmail(message: EmailMessage): Promise<EmailOutcome> {
  return sendEmail(message);
}
