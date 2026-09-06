import type { Prisma } from '@prisma/client';
import { Resend } from 'resend';
import { CONTACT_EMAIL, SITE_NAME } from './site-contact';
import { formatPesos } from './money';
import { formatEventDay } from './event-schedule';
import { runnerRef } from './order-ref';
import { PICKUP_FALLBACK, pickupDetails } from './pickup';
import {
  LOGISTICS_METHODS,
  asLogisticsMethod,
  deliveryZoneLabel,
  isBankTransfer,
  paymentMethodLabel,
} from './registration-codes';

/**
 * Transactional email, sent through Resend from the verified
 * info@cresendorunningcommunity.com mailbox (site-contact.ts owns the
 * address; this module owns what gets sent from it).
 *
 * Two emails go out per registration, never one:
 *  1. sendRegistrationReceivedEmail — fired the moment a registration row is
 *     created (checkout/route.ts for online methods, checkout/manual/route.ts
 *     for bank transfer), before any payment is confirmed. It exists so a
 *     runner immediately sees the details they submitted are correct, before
 *     they've even finished paying.
 *  2. sendRegistrationConfirmationEmail — fired only once status reaches
 *     PAID: from the PayMongo webhook for online payments, or from the admin
 *     status route once an admin has actually looked at a bank transfer's
 *     proof and confirmed it. A bank-transfer runner therefore never receives
 *     a receipt at submission time — only the "received" email — and gets
 *     the receipt exclusively once a human has verified their money arrived.
 *
 * Neither call needs to wait for the other on purpose: the online PayMongo
 * webhook is itself an asynchronous callback that only fires once PayMongo
 * has actually processed the payment, so "received" is always sent first —
 * at submission, before the runner has even reached PayMongo's page — and
 * the webhook's confirmation email necessarily lands after. No artificial
 * delay is needed or wanted; adding one would only tie up a serverless
 * function for no benefit.
 *
 * A failed send never fails the caller — registration and payment state must
 * never depend on Resend being up. sendEmail() below logs and swallows every
 * error rather than throwing.
 */

const FROM_ADDRESS = `${SITE_NAME} <${CONTACT_EMAIL}>`;
const BRAND_ORANGE = '#FF6B00';
const BRAND_BLUE = '#007AFF';

/**
 * Uploaded once to the public Blob store (see blob.ts) from the site's own
 * public/run-as-one-logo.png. An email client fetches images over the open
 * internet, not from this app's filesystem, so the logo needs a durable
 * public URL rather than a local /public path — Blob's URL works regardless
 * of whatever the custom domain's DNS is doing.
 */
const LOGO_URL = 'https://7yksnqfk5t2ii6xo.public.blob.vercel-storage.com/email-assets/run-as-one-logo.png';

let client: Resend | null = null;

/** Null when RESEND_API_KEY is unset, so local dev without it just skips sending. */
function resendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY is not set — skipping email send.');
    return null;
  }
  if (!client) client = new Resend(apiKey);
  return client;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const resend = resendClient();
  if (!resend) return;

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      // One recipient, deliberately. Resend meters its free tier by
      // *recipient*, not by message, and counts a bcc as one of them — so the
      // archive copy this used to carry doubled the quota cost of every send,
      // putting a registration's two emails at four units against a ceiling of
      // a hundred a day. Resend's own dashboard already keeps a log of
      // everything sent, which is what the archive mailbox was for.
      to,
      replyTo: CONTACT_EMAIL,
      subject,
      html,
    });
    if (error) console.error('Resend send failed:', error);
  } catch (err) {
    console.error('Resend send threw:', err);
  }
}

/** The exact shape every call site already queries: Registration + event + runners + category. */
type RegistrationWithDetails = Prisma.RegistrationGetPayload<{
  include: { event: true; runners: { include: { category: true } } };
}>;

function peso(centavos: number): string {
  return `&#8369;${formatPesos(centavos)}`;
}

/** The money line's own wording, built from the shared zone label. */
function deliveryFeeLabel(zone: string | null): string {
  const label = deliveryZoneLabel(zone);
  return label ? `Delivery — ${label}` : 'Delivery Fee';
}

/* ────────────────────────────────────────────────────────────────────────
 * The body is ONE table, and that is the whole layout strategy.
 *
 * Gmail's Android app renders each nested table shrink-to-fit: it sizes a
 * table to its own content and ignores the declared width, whether that
 * width is a percentage, a pixel value, an HTML attribute or a
 * `table-layout: fixed` — all four were tried and all four failed. The
 * consequence is that separate tables end up at *different* widths, so a
 * block of short money values ends well short of the right edge while a
 * block containing a long venue name reaches it, and the amounts no longer
 * line up with anything.
 *
 * Rows of one table cannot disagree that way: a table has a single set of
 * columns, so every value in the email right-aligns to the same edge by
 * construction. The long paragraphs sit in the same table as full-width
 * rows, which is what pushes that shared width out to the container. No
 * width declaration is relied on anywhere.
 * ──────────────────────────────────────────────────────────────────────── */

const LABEL_STYLE =
  'padding: 7px 12px 7px 0; font-size: 13px; color: #8b8b96; font-family: Arial, Helvetica, sans-serif; vertical-align: top;';
const VALUE_STYLE =
  'padding: 7px 0; font-size: 14px; color: #f4f4f6; font-family: Arial, Helvetica, sans-serif; font-weight: 600; text-align: right; vertical-align: top;';

/** A label on the left, its value right-aligned on the shared right edge. */
function infoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="${LABEL_STYLE}">${label}</td>
      <td align="right" style="${VALUE_STYLE}">${value}</td>
    </tr>`;
}

/** A money line. Muted, because the total below it is the number that matters. */
function amountRow(label: string, centavos: number): string {
  return `
    <tr>
      <td style="padding: 6px 12px 6px 0; font-size: 13px; color: #8b8b96; font-family: Arial, Helvetica, sans-serif;">${label}</td>
      <td align="right" style="padding: 6px 0; font-size: 13px; color: #8b8b96; font-family: Arial, Helvetica, sans-serif; text-align: right; white-space: nowrap;">${peso(centavos)}</td>
    </tr>`;
}

/** Anything that spans both columns: a paragraph, a section heading, a rule. */
function fullWidthRow(content: string, style = ''): string {
  return `
    <tr>
      <td colspan="2" style="${style}">${content}</td>
    </tr>`;
}

/**
 * A bordered block, nested inside a full-width row of the body table.
 *
 * Only blocks whose values are long — an event title, a venue, an email
 * address, a phone number — are allowed in here. A nested table is sized to
 * its content by Gmail's Android app (see the note above), so a block of
 * short values would shrink and stop aligning with everything else; those
 * stay as plain rows of the one body table. These blocks fill the width on
 * their own content, which is why they always rendered correctly.
 */
function cardRow(rowsHtml: string): string {
  return fullWidthRow(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px 20px;">
        ${rowsHtml}
      </table>`,
    'padding: 2px 0 0;'
  );
}

function sectionHeading(text: string): string {
  return fullWidthRow(
    text,
    'padding: 30px 0 6px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; color: #8b8b96; text-transform: uppercase;'
  );
}

function ruleRow(marginTop = 10): string {
  return fullWidthRow(
    `<div style="border-top: 1px solid rgba(255,255,255,0.1); font-size: 0; line-height: 0;">&nbsp;</div>`,
    `padding-top: ${marginTop}px; font-size: 0; line-height: 0;`
  );
}

function paragraphRow(html: string, style = 'padding: 0 0 8px;'): string {
  return fullWidthRow(
    `<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.6; color: #c8c8d0;">${html}</p>`,
    style
  );
}

/** The single table every row above is written into. */
function bodyTable(rows: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${rows}
    </table>`;
}

/* ──────────────────────────────────────────────────────────────────────── */

/** The order block both emails open with; each adds a row or two of its own. */
function orderRows(registration: RegistrationWithDetails, extraRows: string): string {
  const { event } = registration;
  return `
    ${infoRow('Order Reference', registration.orderRef)}
    ${infoRow('Event', event.title)}
    ${infoRow('Date', formatEventDay(event.date))}
    ${infoRow('Location', event.location)}
    ${infoRow('Payment Method', paymentMethodLabel(registration.paymentMethod))}
    ${extraRows}`;
}

/**
 * Pickup or delivery, as order rows.
 *
 * Pickup carries the organizer's address and hours (lib/pickup.ts) rather than
 * the bare word "Pickup": this email is what the runner still has in their
 * inbox on race week, and "Pickup at Venue" does not tell them which venue.
 * When the organizer has not settled it yet, the fallback sentence says so —
 * an empty row would read as though we simply forgot.
 */
function logisticsRow(registration: RegistrationWithDetails): string {
  if (asLogisticsMethod(registration.logisticsMethod) !== LOGISTICS_METHODS.DELIVERY) {
    const { location, schedule } = pickupDetails(registration.event);
    return `
    ${infoRow('Logistics', 'Race Kit Pickup')}
    ${location || schedule ? '' : infoRow('Pickup Details', PICKUP_FALLBACK)}
    ${location ? infoRow('Pickup Location', location) : ''}
    ${schedule ? infoRow('Pickup Schedule', schedule) : ''}`;
  }
  const zoneLabel = deliveryZoneLabel(registration.deliveryZone) || 'Delivery';
  const value = registration.deliveryAddress ? `${zoneLabel} — ${registration.deliveryAddress}` : zoneLabel;
  return infoRow('Delivery', value);
}

/** The compact runner line the receipt uses: who ran, in what, at what size. */
function runnerRows(registration: RegistrationWithDetails): string {
  // By position on the order, not by whatever order the query returned them
  // in: the reference printed beside each name has to match the one in the
  // received email and in the organizer's registrants table.
  const runners = byRunnerNo(registration);
  return runners
    .map((runner, i) => {
      const border = i === runners.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.08)';
      // Fun-run packages carry no shirt size (see shirt-size.ts), so an empty
      // singletSize means "not applicable" — not a value worth printing blank.
      const size = runner.singletSize
        ? `<div style="font-size: 12px; color: #8b8b96;">SIZE</div>
           <div style="font-size: 13px; font-weight: 600; color: #f4f4f6; margin-top: 2px;">${runner.singletSize}</div>`
        : '&nbsp;';
      return `
    <tr>
      <td style="padding: 10px 12px 10px 0; border-bottom: ${border}; font-family: Arial, Helvetica, sans-serif;">
        <div style="font-size: 14px; font-weight: 600; color: #f4f4f6;">${runner.firstName} ${runner.lastName}</div>
        <div style="font-size: 12px; color: #8b8b96; margin-top: 3px;">${runnerRef(registration.orderRef, runner.runnerNo)} &middot; ${runner.category.name}</div>
        ${
          runner.runningCommunity
            ? `<div style="font-size: 12px; color: #8b8b96; margin-top: 2px;">${runner.runningCommunity}</div>`
            : ''
        }
      </td>
      <td align="right" style="padding: 10px 0; border-bottom: ${border}; font-family: Arial, Helvetica, sans-serif; text-align: right; vertical-align: top; white-space: nowrap;">${size}</td>
    </tr>`;
    })
    .join('');
}

/**
 * The runners in their order-reference order.
 *
 * A Prisma include gives no ordering guarantee, and these rows are labelled
 * with a number a runner will quote back at us — so the list is sorted by the
 * stored position rather than by however the rows arrived.
 */
function byRunnerNo(registration: RegistrationWithDetails) {
  return [...registration.runners].sort((a, b) => a.runnerNo - b.runnerNo);
}

/**
 * Every field a runner typed into the wizard, one block each. This is what
 * the "received" email shows — the receipt keeps the compact line above,
 * since by then the runner has already had a chance to catch a typo here.
 */
function runnerDetailRows(registration: RegistrationWithDetails): string {
  const runners = byRunnerNo(registration);
  return runners
    .map((runner, index) => {
      const heading =
        runners.length > 1
          ? `Runner ${runner.runnerNo} — ${runner.firstName} ${runner.lastName}`
          : `${runner.firstName} ${runner.lastName}`;

      return `
    ${fullWidthRow(
      heading,
      `padding: ${index === 0 ? 4 : 22}px 0 6px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 700; color: #f4f4f6;`
    )}
    ${infoRow('Runner Reference', runnerRef(registration.orderRef, runner.runnerNo))}
    ${infoRow('Category', runner.category.name)}
    ${runner.singletSize ? infoRow('Shirt Size', runner.singletSize) : ''}
    ${infoRow('Gender', runner.gender)}
    ${infoRow('Birthdate', runner.birthdate)}
    ${infoRow('Email', runner.email)}
    ${infoRow('Phone', runner.phone)}
    ${infoRow('Emergency Contact', `${runner.emergencyContactName} (${runner.emergencyContactPhone})`)}
    ${runner.medicalConditions ? infoRow('Medical Conditions', runner.medicalConditions) : ''}
    ${infoRow('Running Community', runner.runningCommunity)}`;
    })
    .join('');
}

/** The cost breakdown and its total. Only the last line's wording differs. */
function summaryRows(registration: RegistrationWithDetails, totalLabel: string): string {
  return `
    ${amountRow('Subtotal', registration.subtotal)}
    ${registration.deliveryFee > 0 ? amountRow(deliveryFeeLabel(registration.deliveryZone), registration.deliveryFee) : ''}
    ${registration.platformFee > 0 ? amountRow('Platform Fee', registration.platformFee) : ''}
    ${registration.transactionFee > 0 ? amountRow('Transaction Fee', registration.transactionFee) : ''}
    ${ruleRow()}
    <tr>
      <td style="padding: 14px 12px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 700; color: #ffffff;">${totalLabel}</td>
      <td align="right" style="padding: 14px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 800; color: ${BRAND_ORANGE}; text-align: right; white-space: nowrap;">${peso(registration.totalAmount)}</td>
    </tr>`;
}

type StatusTone = 'pending' | 'success';

/**
 * Two tones, not one label style: "pending" (blue-tinted) reads as an
 * in-progress state — Registration Received, still awaiting payment or
 * verification — and "success" (green-tinted) reads as done — the receipt,
 * once money is actually confirmed. Colored text glyphs (●, ✓) are used
 * instead of an icon font or SVG: icon fonts don't render in email at all,
 * and SVG support is inconsistent (Outlook desktop in particular), while a
 * plain text character always renders and can be colored like any text.
 */
const STATUS_STYLES: Record<StatusTone, { bg: string; border: string; color: string; icon: string }> = {
  pending: { bg: 'rgba(0,122,255,0.14)', border: 'rgba(0,122,255,0.4)', color: '#6cb2ff', icon: '&#9679;' },
  success: { bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.4)', color: '#4ade80', icon: '&#10003;' },
};

/**
 * The chrome every email shares: logo on a dark header (never on the brand
 * gradient — the logo's own wordmark is already orange-and-blue, so a
 * gradient behind it would fight it for contrast instead of framing it),
 * a thin gradient bar as the one accent touch, a status pill, and the same
 * footer. `status` is the one thing each email varies in the header.
 */
function emailShell(status: { label: string; tone: StatusTone }, bodyHtml: string): string {
  const style = STATUS_STYLES[status.tone];

  return `
<!DOCTYPE html>
<html>
  <body style="margin: 0; padding: 0; background-color: #050505;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #050505;">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width: 600px; max-width: 100%; background-color: #0c0c10; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">

            <!-- Header -->
            <tr>
              <td style="background-color: ${BRAND_ORANGE}; background-image: linear-gradient(90deg, ${BRAND_ORANGE} 0%, ${BRAND_BLUE} 100%); font-size: 0; line-height: 0;">&nbsp;</td>
            </tr>
            <tr>
              <td align="center" style="background-color: #050505; padding: 28px 32px 26px;">
                <img src="${LOGO_URL}" alt="${SITE_NAME}" width="140" style="width: 140px; max-width: 40%; height: auto; display: block; margin: 0 auto;" />
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 16px auto 0;">
                  <tr>
                    <td style="background-color: ${style.bg}; border: 1px solid ${style.border}; border-radius: 999px; padding: 7px 16px;">
                      <span style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1px; color: ${style.color}; text-transform: uppercase; white-space: nowrap;">
                        ${style.icon}&nbsp; ${status.label}
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 30px 32px 32px;">
                ${bodyHtml}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.08);">
                <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.6; color: #6b6b76; text-align: center;">
                  Questions about this order? Reply to this email or reach us at
                  <a href="mailto:${CONTACT_EMAIL}" style="color: ${BRAND_BLUE}; text-decoration: none;">${CONTACT_EMAIL}</a>.<br/>
                  &copy; ${new Date().getFullYear()} ${SITE_NAME}. All rights reserved.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Sent the moment a registration is created — before any payment is
 * confirmed. Shows the runner exactly what they submitted (so a typo in a
 * name or a wrong category jumps out immediately) and what happens next; it
 * deliberately does not claim the money has been received, only that the
 * registration has.
 */
export async function sendRegistrationReceivedEmail(
  registration: RegistrationWithDetails
): Promise<void> {
  const { event } = registration;
  const paidByBankTransfer = isBankTransfer(registration.paymentMethod);
  const firstName = registration.customerName.split(' ')[0] || registration.customerName;

  const nextStep = paidByBankTransfer
    ? "Our team will verify your proof of payment and email you an official receipt once it's confirmed."
    : "Once your payment is confirmed, we'll email you an official receipt.";

  const body = bodyTable(`
    ${paragraphRow(
      `Hi ${firstName}, we've received your registration for
       <strong style="color: #f4f4f6;">${event.title}</strong>. Here's what you submitted —
       please check every detail below carefully, especially each runner's info.`,
      'padding: 0 0 14px;'
    )}

    ${sectionHeading('Order Details')}
    ${cardRow(
      orderRows(
        registration,
        `${infoRow('Submitted By', registration.customerName)}
         ${infoRow('Contact Email', registration.customerEmail)}
         ${registration.customerPhone ? infoRow('Contact Phone', registration.customerPhone) : ''}
         ${logisticsRow(registration)}
         ${paidByBankTransfer && registration.transactionNumber ? infoRow('Transaction No.', registration.transactionNumber) : ''}`
      )
    )}

    ${sectionHeading('Runner Details — Please Verify')}
    ${cardRow(runnerDetailRows(registration))}

    ${sectionHeading('Order Summary')}
    ${summaryRows(registration, paidByBankTransfer ? 'Amount Due' : 'Total Amount')}

    ${fullWidthRow(
      `<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.6; color: #8b8b96;">
        ${nextStep} If anything above looks wrong, reply to this email right away.
      </p>`,
      'padding: 30px 0 0;'
    )}`);

  // The order reference keeps every email its own conversation. Without it
  // Gmail threads same-subject messages together and hides the body behind
  // "Show trimmed content" as if it were a quoted reply.
  await sendEmail(
    registration.customerEmail,
    `We've received your registration — ${event.title} (${registration.orderRef})`,
    emailShell({ label: 'Registration Received', tone: 'pending' }, body)
  );
}

/**
 * Sent once a registration reaches PAID — online via the PayMongo webhook, or
 * manual once an admin confirms a bank transfer proof. This is the official
 * receipt; sendRegistrationReceivedEmail() above already told the runner
 * their details were captured, so this one is entirely about the money.
 */
export async function sendRegistrationConfirmationEmail(
  registration: RegistrationWithDetails
): Promise<void> {
  const { event, runners } = registration;
  const paidByBankTransfer = isBankTransfer(registration.paymentMethod);
  const firstName = registration.customerName.split(' ')[0] || registration.customerName;

  const body = bodyTable(`
    ${paragraphRow(
      `Hi ${firstName}, ${
        paidByBankTransfer
          ? "we've verified your bank transfer — you're officially registered for"
          : "your payment went through — you're officially registered for"
      }
       <strong style="color: #f4f4f6;">${event.title}</strong>. Here's your receipt.`,
      'padding: 0 0 14px;'
    )}

    ${sectionHeading('Order Details')}
    ${cardRow(
      orderRows(
        registration,
        paidByBankTransfer && registration.transactionNumber
          ? infoRow('Transaction No.', registration.transactionNumber)
          : ''
      )
    )}

    ${sectionHeading(`Registered Runner${runners.length > 1 ? 's' : ''}`)}
    ${runnerRows(registration)}

    ${sectionHeading('Payment Summary')}
    ${summaryRows(registration, 'Total Paid')}

    ${fullWidthRow(
      `<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.6; color: #8b8b96;">
        Keep this email as your receipt. Results and your e-certificate will be posted here once the race is done.
      </p>`,
      'padding: 30px 0 0;'
    )}`);

  await sendEmail(
    registration.customerEmail,
    `Payment confirmed — ${event.title} (${registration.orderRef})`,
    emailShell(
      { label: paidByBankTransfer ? 'Payment Verified' : 'Payment Confirmed', tone: 'success' },
      body
    )
  );
}
