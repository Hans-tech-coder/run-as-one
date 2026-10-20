import { formatPesos } from './money';
import { isOutsidePayment } from './category-change-hold';
import { formatEventInstant } from './event-schedule';
import { deliveryZoneLabelFor, paymentMethodLabel } from './registration-codes';
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
import { deliveryTiers } from '@/app/events/[slug]/register/delivery';

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
 * - `logisticsChangeCreatedEmail` — *confirm and pay* (Revision 3 T9): where
 *   the kits will ship as it stands, the fee to the centavo, until when, and
 *   the switch's link, where the runner confirms the address and receiver and
 *   pays online or with the GCash or bank proof. The same for both methods.
 *   The kits stay on pickup until it is paid. Stamped on `createdEmailSentAt`.
 * - `logisticsChangeProofReceivedEmail` — the GCash or bank proof the runner
 *   handed in on the link arrived (T8). Not stamped.
 * - `logisticsChangeAppliedEmail` — *switched*: the new method, where it ships
 *   or, back to pickup, where and when to collect the kits (`pickup.ts`), and
 *   what the money did. Stamped on `appliedEmailSentAt`.
 *
 * The first and last show the delivery as the runner gave it at checkout,
 * staff set it in *Ship kits*, or the runner confirmed it on the link
 * (`deliveryAddressDetails`): the address with its ZIP, the landmark, and the
 * receiver's name and mobile when someone else takes the kit.
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
    /** The tiers, listed when the switch has no address yet (Revision 3b T12). */
    logisticsDeliveryFeeInside?: number;
    logisticsDeliveryFeeOutside?: number;
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

/**
 * Sent when a switch with a fee is opened (Revision 3 T9), the same for an
 * online payment and for GCash or bank: where the kits will ship as it stands,
 * the fee, until when, and one button to the switch's link, where the runner
 * confirms the address and the receiver and pays, online or with the
 * payment's screenshot and reference. The accounts are on that page, not here.
 * `url` is that link; without one (no request to take its host from) the
 * email says to reply instead.
 */
export function logisticsChangeCreatedEmail(change: SwitchForEmail, url: string | null): Promise<EmailMessage> {
  const outside = isOutsidePayment(change.paymentMethod);
  const until = change.holdUntil ? `${formatEventInstant(change.holdUntil)}, Manila time` : null;
  // Revision 3b T12: no address yet, so no fee yet; the runner gives it on the link.
  if (!change.deliveryAddress && !change.deliverySplit) return addressFirstEmail(change, url, until);

  const action: EmailDocument['blocks'] = url
    ? [
        {
          kind: 'paragraph',
          segments: [
            'Check the address and who will receive the kit, change them if you need to, then pay',
            outside ? ' by GCash or bank transfer and upload the screenshot of your payment' : ' online',
            '. All on one page:',
          ],
        },
        // Pay and the amount, short enough for a phone (the owner, 2026-10-20).
        { kind: 'button', label: `Pay ${peso(change.totalCharged)}`, href: url },
      ]
    : [{ kind: 'paragraph', segments: ['Reply to this email and we will send you the link to confirm and pay.'] }];

  return renderMessage({
    to: change.order.customerEmail,
    // The switch reference keeps it its own thread, apart from the receipt.
    subject: `Confirm your delivery details and pay — ${change.event.title} (${change.changeRef})`,
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
      ...action,
      // Where the kits go as it stands, so the runner knows what they confirm.
      { kind: 'heading', text: 'Delivery' },
      { kind: 'card', rows: deliveryRows(change) },
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
          'Changed your mind? Do nothing, or reply to this email.',
        ],
      },
    ],
  });
}

/**
 * The *confirm and pay* email for a switch opened with no address (Runner 1 had
 * none on file): where to tell us the address, the fee by area, until when.
 */
function addressFirstEmail(change: SwitchForEmail, url: string | null, until: string | null): Promise<EmailMessage> {
  const event = change.event;
  const tiers =
    event.logisticsDeliveryFeeInside !== undefined && event.logisticsDeliveryFeeOutside !== undefined
      ? deliveryTiers({
          logisticsDeliveryFeeInside: event.logisticsDeliveryFeeInside,
          logisticsDeliveryFeeOutside: event.logisticsDeliveryFeeOutside,
        })
      : [];
  return renderMessage({
    to: change.order.customerEmail,
    subject: `Confirm your delivery details and pay — ${event.title} (${change.changeRef})`,
    status: { label: 'Payment Pending', tone: 'pending' },
    footerTopic: 'switch',
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstNameOf(change.order.customerName)}, the ${kitsLabel(change.order.kits)} on order `,
          { strong: change.order.orderRef },
          ' for ',
          { strong: event.title },
          ' can be delivered instead of picked up. Tell us where to ship them and who will receive them, then pay the delivery fee',
          ...(until ? [', by ', { strong: until }] : []),
          '.',
        ],
      },
      ...(url
        ? // No amount yet: the fee follows the address the runner gives (the owner, 2026-10-20).
          [{ kind: 'button' as const, label: 'Pay Delivery Fee', href: url }]
        : [{ kind: 'paragraph' as const, segments: ['Reply to this email and we will send you the link.'] }]),
      ...(tiers.length > 0
        ? [
            { kind: 'heading' as const, text: 'Delivery Fee' },
            {
              kind: 'card' as const,
              rows: tiers.map(tier => ({
                kind: 'info' as const,
                label: deliveryZoneLabelFor(event as Parameters<typeof deliveryZoneLabelFor>[0], tier.zone) || tier.label,
                value: peso(tier.fee),
              })),
            },
          ]
        : []),
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
                  value: isOutsidePayment(change.paymentMethod) ? 'GCash or bank transfer' : paymentMethodLabel(change.paymentMethod),
                },
              ]
            : []),
        ],
      },
      {
        kind: 'note',
        segments: [
          'Until it is paid your kits stay for pickup, and your registration and its receipt are unchanged. ',
          until ? `If it is not paid by ${until}, the switch lapses and your kits stay for pickup. ` : '',
          'Changed your mind? Do nothing, or reply to this email.',
        ],
      },
    ],
  });
}

/** What the *proof received* email reads. */
export type SwitchProofForEmail = {
  changeRef: string;
  totalCharged: number;
  transactionNumber: string;
  order: { orderRef: string; customerName: string; customerEmail: string };
  event: { title: string };
};

/**
 * Sent when the runner hands in the GCash or bank proof on the switch's link
 * (Revision 3 T8): it arrived, staff check it, and the *switched* email
 * follows. Not stamped on the switch: the proof itself is the record.
 */
export function logisticsChangeProofReceivedEmail(change: SwitchProofForEmail): Promise<EmailMessage> {
  return renderMessage({
    to: change.order.customerEmail,
    subject: `We received your payment proof — ${change.event.title} (${change.changeRef})`,
    status: { label: 'Proof Received', tone: 'pending' },
    footerTopic: 'switch',
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstNameOf(change.order.customerName)}, thank you. We received the proof of your `,
          { strong: peso(change.totalCharged) },
          ' payment for delivering the kits on order ',
          { strong: change.order.orderRef },
          ' for ',
          { strong: change.event.title },
          '. We check it against our account, then switch your kits to delivery and email you.',
        ],
      },
      {
        kind: 'card',
        rows: [
          { kind: 'info', label: 'Switch Reference', value: change.changeRef },
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
