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
 * never depend on Resend being up. sendEmail() below still catches everything
 * and never throws. What changed is that it now *reports*: it returns an
 * EmailOutcome, and lib/email-delivery.ts writes that outcome onto the
 * registration. On Resend's free tier (100 recipients a day, which stops
 * rather than bills) a send can simply not happen, and a swallowed failure
 * left a runner unconfirmed with nothing on the row to show for it.
 *
 * **Each email is one document rendered twice.** The block list below is what
 * an email *is*; renderHtml() produces what Resend sends, renderText() the
 * plain-text rendering the admin's manual-send modal drops into a mailto:.
 * Two renderings of one source rather than two templates, because a second
 * template is a second thing to keep in step and it would drift the first
 * time a line changes in only one of them.
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

/** One email in both of its renderings: ready to send, or to hand to a person. */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Whether a send actually happened, and why not when it did not.
 *
 * The reason is kept in Resend's own words rather than mapped to a code of
 * ours: the distinction that matters to whoever clears the backlog is a quota
 * stop ("daily limit reached") against a bad address, and their message says
 * which without us having to enumerate their failures in advance.
 */
export type EmailOutcome = { sent: true } | { sent: false; error: string };

async function sendEmail(message: EmailMessage): Promise<EmailOutcome> {
  const resend = resendClient();
  // Not a failure being swallowed: nothing is configured, so nothing was
  // sent, and the registration should say exactly that rather than imply the
  // runner has an email they never got.
  if (!resend) {
    return { sent: false, error: 'Email is not configured (RESEND_API_KEY is unset), so nothing was sent.' };
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      // One recipient, deliberately. Resend meters its free tier by
      // *recipient*, not by message, and counts a bcc as one of them — so the
      // archive copy this used to carry doubled the quota cost of every send,
      // putting a registration's two emails at four units against a ceiling of
      // a hundred a day. Resend's own dashboard already keeps a log of
      // everything sent, which is what the archive mailbox was for.
      to: message.to,
      replyTo: CONTACT_EMAIL,
      subject: message.subject,
      html: message.html,
      // The text alternative exists anyway now that the template renders one,
      // and every spam filter that looks treats a multipart email as less
      // suspect than an HTML-only one.
      text: message.text,
    });
    if (error) {
      console.error('Resend send failed:', error);
      return { sent: false, error: error.message || String(error) };
    }
    return { sent: true };
  } catch (err) {
    console.error('Resend send threw:', err);
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The exact shape every call site already queries: Registration + event + runners + category. */
export type RegistrationWithDetails = Prisma.RegistrationGetPayload<{
  include: { event: true; runners: { include: { category: true } } };
}>;

/* ────────────────────────────────────────────────────────────────────────
 * The document model.
 *
 * Values are held plain here — an event title, a runner's name — and escaped
 * by the HTML renderer, so a club called "Tri & Run" can no longer reach an
 * inbox as broken markup. Amounts stay numbers until a renderer formats them,
 * because the peso sign is an entity in one rendering and a character in the
 * other.
 * ──────────────────────────────────────────────────────────────────────── */

/** A run of text, optionally emphasised. Bold in HTML, plain in text. */
type Segment = string | { strong: string };

type Row =
  /** A label and its value, right-aligned on the shared right edge. */
  | { kind: 'info'; label: string; value: string }
  /** A money line. Muted, because the total below it is the number that matters. */
  | { kind: 'amount'; label: string; centavos: number }
  /** The one loud number. */
  | { kind: 'total'; label: string; centavos: number }
  | { kind: 'rule' }
  /** One runner's heading in the "please verify" block. */
  | { kind: 'runnerHeading'; text: string; first: boolean }
  /**
   * The receipt's compact line: who ran, in what, at what size. The reference
   * and the category are kept apart rather than pre-joined, because the
   * separator between them differs by rendering — an entity in HTML, the
   * character itself in text.
   */
  | {
      kind: 'runner';
      name: string;
      reference: string;
      category: string;
      community: string | null;
      size: string | null;
    };

type Block =
  | { kind: 'paragraph'; segments: Segment[] }
  | { kind: 'heading'; text: string }
  /** A bordered card. **Long values only** — see cardHtml(). */
  | { kind: 'card'; rows: Row[] }
  /** Plain rows of the one body table. */
  | { kind: 'rows'; rows: Row[] }
  /** The small grey closing paragraph. */
  | { kind: 'note'; segments: Segment[] };

type StatusTone = 'pending' | 'success';

interface EmailDocument {
  to: string;
  subject: string;
  status: { label: string; tone: StatusTone };
  blocks: Block[];
}

/* ────────────────────────────────────────────────────────────────────────
 * HTML rendering.
 *
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

/** Registrant text reaches the template exactly as it was typed, so it is escaped on the way in. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pesoHtml(centavos: number): string {
  // The sign goes outside the peso symbol. A discount is the only negative
  // amount an email carries, and "₱-150.00" reads as a broken number rather
  // than as money taken off.
  const sign = centavos < 0 ? '&#8722;' : '';
  return `${sign}&#8369;${formatPesos(Math.abs(centavos))}`;
}

function segmentsHtml(segments: Segment[]): string {
  return segments
    .map(segment =>
      typeof segment === 'string'
        ? escapeHtml(segment)
        : `<strong style="color: #f4f4f6;">${escapeHtml(segment.strong)}</strong>`
    )
    .join('');
}

/** Anything that spans both columns: a paragraph, a section heading, a rule. */
function fullWidthRow(content: string, style = ''): string {
  return `
    <tr>
      <td colspan="2" style="${style}">${content}</td>
    </tr>`;
}

function rowHtml(row: Row, isLastRunner: boolean): string {
  switch (row.kind) {
    case 'info':
      return `
    <tr>
      <td style="${LABEL_STYLE}">${escapeHtml(row.label)}</td>
      <td align="right" style="${VALUE_STYLE}">${escapeHtml(row.value)}</td>
    </tr>`;
    case 'amount':
      return `
    <tr>
      <td style="padding: 6px 12px 6px 0; font-size: 13px; color: #8b8b96; font-family: Arial, Helvetica, sans-serif;">${escapeHtml(row.label)}</td>
      <td align="right" style="padding: 6px 0; font-size: 13px; color: #8b8b96; font-family: Arial, Helvetica, sans-serif; text-align: right; white-space: nowrap;">${pesoHtml(row.centavos)}</td>
    </tr>`;
    case 'total':
      return `
    <tr>
      <td style="padding: 14px 12px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 700; color: #ffffff;">${escapeHtml(row.label)}</td>
      <td align="right" style="padding: 14px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 800; color: ${BRAND_ORANGE}; text-align: right; white-space: nowrap;">${pesoHtml(row.centavos)}</td>
    </tr>`;
    case 'rule':
      return fullWidthRow(
        `<div style="border-top: 1px solid rgba(255,255,255,0.1); font-size: 0; line-height: 0;">&nbsp;</div>`,
        'padding-top: 10px; font-size: 0; line-height: 0;'
      );
    case 'runnerHeading':
      return fullWidthRow(
        escapeHtml(row.text),
        `padding: ${row.first ? 4 : 22}px 0 6px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 700; color: #f4f4f6;`
      );
    case 'runner': {
      const border = isLastRunner ? 'none' : '1px solid rgba(255,255,255,0.08)';
      // Fun-run packages carry no shirt size (see shirt-size.ts), so an empty
      // singletSize means "not applicable" — not a value worth printing blank.
      const size = row.size
        ? `<div style="font-size: 12px; color: #8b8b96;">SIZE</div>
           <div style="font-size: 13px; font-weight: 600; color: #f4f4f6; margin-top: 2px;">${escapeHtml(row.size)}</div>`
        : '&nbsp;';
      return `
    <tr>
      <td style="padding: 10px 12px 10px 0; border-bottom: ${border}; font-family: Arial, Helvetica, sans-serif;">
        <div style="font-size: 14px; font-weight: 600; color: #f4f4f6;">${escapeHtml(row.name)}</div>
        <div style="font-size: 12px; color: #8b8b96; margin-top: 3px;">${escapeHtml(row.reference)} &middot; ${escapeHtml(row.category)}</div>
        ${
          row.community
            ? `<div style="font-size: 12px; color: #8b8b96; margin-top: 2px;">${escapeHtml(row.community)}</div>`
            : ''
        }
      </td>
      <td align="right" style="padding: 10px 0; border-bottom: ${border}; font-family: Arial, Helvetica, sans-serif; text-align: right; vertical-align: top; white-space: nowrap;">${size}</td>
    </tr>`;
    }
  }
}

/** The last runner line in a block loses its divider, so the block ends on the card's own edge. */
function rowsHtml(rows: Row[]): string {
  const lastRunner = rows.map(row => row.kind).lastIndexOf('runner');
  return rows.map((row, index) => rowHtml(row, index === lastRunner)).join('');
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
function cardHtml(rows: Row[]): string {
  return fullWidthRow(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px 20px;">
        ${rowsHtml(rows)}
      </table>`,
    'padding: 2px 0 0;'
  );
}

function blockHtml(block: Block, index: number): string {
  switch (block.kind) {
    case 'paragraph':
      return fullWidthRow(
        `<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.6; color: #c8c8d0;">${segmentsHtml(block.segments)}</p>`,
        'padding: 0 0 14px;'
      );
    case 'heading':
      return fullWidthRow(
        escapeHtml(block.text),
        'padding: 30px 0 6px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; color: #8b8b96; text-transform: uppercase;'
      );
    case 'card':
      return cardHtml(block.rows);
    case 'rows':
      return rowsHtml(block.rows);
    case 'note':
      return fullWidthRow(
        `<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.6; color: #8b8b96;">${segmentsHtml(block.segments)}</p>`,
        `padding: ${index === 0 ? 0 : 30}px 0 0;`
      );
  }
}

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
 * footer. The status is the one thing each email varies in the header.
 */
function renderHtml(doc: EmailDocument): string {
  const style = STATUS_STYLES[doc.status.tone];
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${doc.blocks.map(blockHtml).join('')}
    </table>`;

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
                        ${style.icon}&nbsp; ${escapeHtml(doc.status.label)}
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 30px 32px 32px;">
                ${body}
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

/* ────────────────────────────────────────────────────────────────────────
 * Plain-text rendering.
 *
 * This is the body a mailto: carries when a staff member sends an email by
 * hand, and the text alternative Resend attaches. A mailto: cannot carry the
 * design — its body is plain text, and URL length limits truncate a long one —
 * which is precisely why the manual-send modal also puts the HTML on the
 * clipboard. This rendering is the substance; the clipboard is the design.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * The peso sign and the separator as characters, where the HTML rendering
 * uses entities: this text goes into a mailto: body and into a plain-text
 * email part, and "&#8369;" would arrive there literally.
 */
const PESO_SIGN = '₱';
const MIDDOT = ' · ';

function segmentsText(segments: Segment[]): string {
  return segments.map(segment => (typeof segment === 'string' ? segment : segment.strong)).join('');
}

function pesoText(centavos: number): string {
  const sign = centavos < 0 ? '-' : '';
  return `${sign}${PESO_SIGN}${formatPesos(Math.abs(centavos))}`;
}

function rowText(row: Row): string[] {
  switch (row.kind) {
    case 'info':
      return [`${row.label}: ${row.value}`];
    case 'amount':
      return [`${row.label}: ${pesoText(row.centavos)}`];
    case 'total':
      // Blank line first: without the rule that separates it in the HTML, the
      // total would otherwise read as one more line of the breakdown.
      return ['', `${row.label.toUpperCase()}: ${pesoText(row.centavos)}`];
    case 'rule':
      return [];
    case 'runnerHeading':
      return [row.first ? row.text : `\n${row.text}`];
    case 'runner':
      return [
        row.name,
        `  ${row.reference}${MIDDOT}${row.category}`,
        ...(row.community ? [`  ${row.community}`] : []),
        ...(row.size ? [`  Size: ${row.size}`] : []),
        '',
      ];
  }
}

function blockText(block: Block): string {
  switch (block.kind) {
    case 'paragraph':
    case 'note':
      return segmentsText(block.segments);
    case 'heading':
      return block.text.toUpperCase();
    case 'card':
    case 'rows':
      return block.rows.flatMap(rowText).join('\n');
  }
}

function renderText(doc: EmailDocument): string {
  const body = doc.blocks
    .map(blockText)
    .join('\n\n')
    // A runner block ends on a blank line of its own and the next heading adds
    // another; three in a row reads as a gap rather than a break.
    .replace(/\n{3,}/g, '\n\n');

  return [
    `${SITE_NAME} — ${doc.status.label.toUpperCase()}`,
    '',
    body,
    '',
    '—',
    `Questions about this order? Reply to this email or reach us at ${CONTACT_EMAIL}.`,
    `(c) ${new Date().getFullYear()} ${SITE_NAME}. All rights reserved.`,
  ].join('\n');
}

function renderMessage(doc: EmailDocument): EmailMessage {
  return { to: doc.to, subject: doc.subject, html: renderHtml(doc), text: renderText(doc) };
}

/* ────────────────────────────────────────────────────────────────────────
 * The two documents.
 * ──────────────────────────────────────────────────────────────────────── */

/** The money line's own wording, built from the shared zone label. */
function deliveryFeeLabel(zone: string | null): string {
  const label = deliveryZoneLabel(zone);
  return label ? `Delivery — ${label}` : 'Delivery Fee';
}

/** The order block both emails open with; each adds a row or two of its own. */
function orderRows(registration: RegistrationWithDetails, extraRows: Row[]): Row[] {
  const { event } = registration;
  return [
    { kind: 'info', label: 'Order Reference', value: registration.orderRef },
    { kind: 'info', label: 'Event', value: event.title },
    { kind: 'info', label: 'Date', value: formatEventDay(event.date) },
    { kind: 'info', label: 'Location', value: event.location },
    { kind: 'info', label: 'Payment Method', value: paymentMethodLabel(registration.paymentMethod) },
    ...extraRows,
  ];
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
function logisticsRows(registration: RegistrationWithDetails): Row[] {
  if (asLogisticsMethod(registration.logisticsMethod) !== LOGISTICS_METHODS.DELIVERY) {
    const { location, schedule } = pickupDetails(registration.event);
    const rows: Row[] = [{ kind: 'info', label: 'Logistics', value: 'Race Kit Pickup' }];
    if (!location && !schedule) rows.push({ kind: 'info', label: 'Pickup Details', value: PICKUP_FALLBACK });
    if (location) rows.push({ kind: 'info', label: 'Pickup Location', value: location });
    if (schedule) rows.push({ kind: 'info', label: 'Pickup Schedule', value: schedule });
    return rows;
  }
  const zoneLabel = deliveryZoneLabel(registration.deliveryZone) || 'Delivery';
  const value = registration.deliveryAddress ? `${zoneLabel} — ${registration.deliveryAddress}` : zoneLabel;
  return [{ kind: 'info', label: 'Delivery', value }];
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

/** The compact runner line the receipt uses: who ran, in what, at what size. */
function runnerRows(registration: RegistrationWithDetails): Row[] {
  const runners = byRunnerNo(registration);
  return runners.map(runner => ({
    kind: 'runner' as const,
    name: `${runner.firstName} ${runner.lastName}`,
    reference: runnerRef(registration.orderRef, runner.runnerNo, runners.length),
    category: runner.category.name,
    community: runner.runningCommunity || null,
    size: runner.singletSize || null,
  }));
}

/**
 * Every field a runner typed into the wizard, one block each. This is what
 * the "received" email shows — the receipt keeps the compact line above,
 * since by then the runner has already had a chance to catch a typo here.
 */
function runnerDetailRows(registration: RegistrationWithDetails): Row[] {
  const runners = byRunnerNo(registration);
  return runners.flatMap((runner, index): Row[] => {
    const heading =
      runners.length > 1
        ? `Runner ${runner.runnerNo} — ${runner.firstName} ${runner.lastName}`
        : `${runner.firstName} ${runner.lastName}`;

    return [
      { kind: 'runnerHeading', text: heading, first: index === 0 },
      {
        kind: 'info',
        label: 'Runner Reference',
        value: runnerRef(registration.orderRef, runner.runnerNo, runners.length),
      },
      { kind: 'info', label: 'Category', value: runner.category.name },
      ...(runner.singletSize ? [{ kind: 'info' as const, label: 'Shirt Size', value: runner.singletSize }] : []),
      { kind: 'info', label: 'Gender', value: runner.gender },
      { kind: 'info', label: 'Birthdate', value: runner.birthdate },
      { kind: 'info', label: 'Email', value: runner.email },
      { kind: 'info', label: 'Phone', value: runner.phone },
      {
        kind: 'info',
        label: 'Emergency Contact',
        value: `${runner.emergencyContactName} (${runner.emergencyContactPhone})`,
      },
      ...(runner.medicalConditions
        ? [{ kind: 'info' as const, label: 'Medical Conditions', value: runner.medicalConditions }]
        : []),
      { kind: 'info', label: 'Running Community', value: runner.runningCommunity },
    ];
  });
}

/** The cost breakdown and its total. Only the last line's wording differs. */
function summaryRows(registration: RegistrationWithDetails, totalLabel: string): Row[] {
  return [
    { kind: 'amount', label: 'Subtotal', centavos: registration.subtotal },
    ...(registration.deliveryFee > 0
      ? [
          {
            kind: 'amount' as const,
            label: deliveryFeeLabel(registration.deliveryZone),
            centavos: registration.deliveryFee,
          },
        ]
      : []),
    // Directly under the goods it came off, and before the fees, because that
    // is the order the wizard's summary showed it in and this email is what
    // the runner checks the charge against.
    ...(registration.discountAmount > 0
      ? [
          {
            kind: 'amount' as const,
            label: registration.promoCode
              ? `Discount (${registration.promoCode})`
              : 'Discount',
            centavos: -registration.discountAmount,
          },
        ]
      : []),
    ...(registration.platformFee > 0
      ? [{ kind: 'amount' as const, label: 'Platform Fee', centavos: registration.platformFee }]
      : []),
    ...(registration.transactionFee > 0
      ? [{ kind: 'amount' as const, label: 'Transaction Fee', centavos: registration.transactionFee }]
      : []),
    { kind: 'rule' },
    { kind: 'total', label: totalLabel, centavos: registration.totalAmount },
  ];
}

/**
 * Sent the moment a registration is created — before any payment is
 * confirmed. Shows the runner exactly what they submitted (so a typo in a
 * name or a wrong category jumps out immediately) and what happens next; it
 * deliberately does not claim the money has been received, only that the
 * registration has.
 */
export function registrationReceivedEmail(registration: RegistrationWithDetails): EmailMessage {
  const { event } = registration;
  const paidByBankTransfer = isBankTransfer(registration.paymentMethod);
  const firstName = registration.customerName.split(' ')[0] || registration.customerName;

  const nextStep = paidByBankTransfer
    ? "Our team will verify your proof of payment and email you an official receipt once it's confirmed."
    : "Once your payment is confirmed, we'll email you an official receipt.";

  return renderMessage({
    to: registration.customerEmail,
    // The order reference keeps every email its own conversation. Without it
    // Gmail threads same-subject messages together and hides the body behind
    // "Show trimmed content" as if it were a quoted reply.
    subject: `We've received your registration — ${event.title} (${registration.orderRef})`,
    status: { label: 'Registration Received', tone: 'pending' },
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstName}, we've received your registration for `,
          { strong: event.title },
          ". Here's what you submitted — please check every detail below carefully, especially each runner's info.",
        ],
      },
      { kind: 'heading', text: 'Order Details' },
      {
        kind: 'card',
        rows: orderRows(registration, [
          { kind: 'info', label: 'Submitted By', value: registration.customerName },
          { kind: 'info', label: 'Contact Email', value: registration.customerEmail },
          ...(registration.customerPhone
            ? [{ kind: 'info' as const, label: 'Contact Phone', value: registration.customerPhone }]
            : []),
          ...logisticsRows(registration),
          ...(paidByBankTransfer && registration.transactionNumber
            ? [{ kind: 'info' as const, label: 'Transaction No.', value: registration.transactionNumber }]
            : []),
        ]),
      },
      { kind: 'heading', text: 'Runner Details — Please Verify' },
      { kind: 'card', rows: runnerDetailRows(registration) },
      { kind: 'heading', text: 'Order Summary' },
      { kind: 'rows', rows: summaryRows(registration, paidByBankTransfer ? 'Amount Due' : 'Total Amount') },
      {
        kind: 'note',
        segments: [`${nextStep} If anything above looks wrong, reply to this email right away.`],
      },
    ],
  });
}

/**
 * Sent once a registration reaches PAID — online via the PayMongo webhook, or
 * manual once an admin confirms a bank transfer proof. This is the official
 * receipt; the received email above already told the runner their details
 * were captured, so this one is entirely about the money.
 */
export function registrationConfirmationEmail(registration: RegistrationWithDetails): EmailMessage {
  const { event, runners } = registration;
  const paidByBankTransfer = isBankTransfer(registration.paymentMethod);
  const firstName = registration.customerName.split(' ')[0] || registration.customerName;

  return renderMessage({
    to: registration.customerEmail,
    subject: `Payment confirmed — ${event.title} (${registration.orderRef})`,
    status: { label: paidByBankTransfer ? 'Payment Verified' : 'Payment Confirmed', tone: 'success' },
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstName}, ${
            paidByBankTransfer
              ? "we've verified your bank transfer — you're officially registered for "
              : "your payment went through — you're officially registered for "
          }`,
          { strong: event.title },
          ". Here's your receipt.",
        ],
      },
      { kind: 'heading', text: 'Order Details' },
      {
        kind: 'card',
        rows: orderRows(
          registration,
          paidByBankTransfer && registration.transactionNumber
            ? [{ kind: 'info', label: 'Transaction No.', value: registration.transactionNumber }]
            : []
        ),
      },
      { kind: 'heading', text: `Registered Runner${runners.length > 1 ? 's' : ''}` },
      { kind: 'rows', rows: runnerRows(registration) },
      { kind: 'heading', text: 'Payment Summary' },
      { kind: 'rows', rows: summaryRows(registration, 'Total Paid') },
      {
        kind: 'note',
        segments: [
          'Keep this email as your receipt. Results and your e-certificate will be posted here once the race is done.',
        ],
      },
    ],
  });
}

/**
 * The two sends. Each reports whether it actually happened; lib/email-delivery.ts
 * is what writes that onto the registration, and the call sites go through it
 * rather than calling these directly.
 */
export function sendRegistrationReceivedEmail(
  registration: RegistrationWithDetails
): Promise<EmailOutcome> {
  return sendEmail(registrationReceivedEmail(registration));
}

export function sendRegistrationConfirmationEmail(
  registration: RegistrationWithDetails
): Promise<EmailOutcome> {
  return sendEmail(registrationConfirmationEmail(registration));
}
