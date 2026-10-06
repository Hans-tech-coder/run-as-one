import { Resend } from 'resend';
import { DEFAULT_CONTACT_EMAIL, SITE_NAME, SITE_URL, canSendFrom } from './site-contact';
import { getContactEmail } from './site-settings';
import { formatPesos } from './money';

/**
 * **How every email the app sends is built and sent**: the document model, its
 * two renderings, and the one Resend call. Split out of email.ts
 * (UNPAID_FOLLOWUP_PLAN.md Batch 4) so each email lives beside its own kind
 * (email.ts for the order emails, email-invitations.ts for the sign-in ones)
 * and none of them can send any other way.
 *
 * Sent through Resend from the contact address staff set at /admin/settings
 * (lib/site-settings.ts owns the address, site-contact.ts the rule for when it
 * may be the sender). Every email reads the saved address when it is built, so
 * its footer, its reply-to and its sender follow a change to the setting on
 * the next send.
 *
 * A failed send never fails the caller — registration and payment state must
 * never depend on Resend being up. sendEmail() below catches everything and
 * never throws, but it *reports*: it returns an EmailOutcome, and
 * lib/email-delivery.ts writes that outcome onto the registration. On Resend's
 * free tier (100 recipients a day, which stops rather than bills) a send can
 * simply not happen, and a swallowed failure left a runner unconfirmed with
 * nothing on the row to show for it.
 *
 * **Each email is one document rendered twice.** The block list below is what
 * an email *is*; renderHtml() produces what Resend sends, renderText() the
 * plain-text rendering the admin's manual-send modal drops into a mailto:.
 * Two renderings of one source rather than two templates, because a second
 * template is a second thing to keep in step and it would drift the first
 * time a line changes in only one of them.
 */


/**
 * The sender line every email goes out under.
 *
 * The display name is **quoted**. The name comes from `SITE_NAME`, and it once
 * held a colon — one of RFC 5322's specials, at which a parser stops and drops
 * the rest of a bare display-name wherever the receiving client decides.
 * Quoting keeps the whole name one atom whatever the constant holds.
 *
 * The address is the saved contact email when Resend can send from its domain
 * (`canSendFrom`), and the verified default otherwise — replies still reach the
 * saved address through `replyTo`, so a runner never notices the difference.
 */
function fromAddress(contactEmail: string): string {
  const sender = canSendFrom(contactEmail) ? contactEmail : DEFAULT_CONTACT_EMAIL;
  return `"${SITE_NAME}" <${sender}>`;
}
const BRAND_ORANGE = '#FF6B00';
const BRAND_BLUE = '#007AFF';

/**
 * The site's own brand lockup, the same one the navbar shows, exported as a
 * PNG because Gmail strips inline SVG and no email client resolves the app's
 * CSS variables. An email client fetches images over the open internet rather
 * than from this app's filesystem, so it needs an absolute URL — but it is
 * served from `public/` on the site's own CDN rather than from the Blob store
 * it used to live in. Blob meant the logo was a file somebody had uploaded by
 * hand, versioned nowhere and updated out of band; in `public/` it ships with
 * the code that renders it and can never disagree with the site.
 *
 * Drawn at 3x (672x168) for a 224px display width, white ink on a transparent
 * ground. It relies on the header cell behind it holding its #050505: a client
 * that drops that background renders white on white. That is a deliberate
 * trade — every brand asset in this app is exported transparent — not an
 * oversight, so do not quietly bake a background plate back in.
 *
 * **The `?v=` is part of the asset, and must change whenever the PNG does.**
 * Gmail never fetches an email's images from us directly: its image proxy
 * fetches each URL once, caches it on Google's side, and serves that copy to
 * every later email that names the same URL. So re-cutting the file and
 * redeploying is not enough on its own — the old picture keeps arriving until
 * the URL itself is new. And because `SITE_URL` is the production domain, an
 * email sent from localhost or a preview deployment still shows whatever
 * production is serving: a new logo reaches inboxes only once it is on `main`.
 */
const LOGO_VERSION = '3';
const LOGO_URL = `${SITE_URL}/email/run-as-one-logo.png?v=${LOGO_VERSION}`;

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

export async function sendEmail(message: EmailMessage): Promise<EmailOutcome> {
  const resend = resendClient();
  // Not a failure being swallowed: nothing is configured, so nothing was
  // sent, and the registration should say exactly that rather than imply the
  // runner has an email they never got.
  if (!resend) {
    return { sent: false, error: 'Email is not configured (RESEND_API_KEY is unset), so nothing was sent.' };
  }

  try {
    const contactEmail = await getContactEmail();
    const { error } = await resend.emails.send({
      from: fromAddress(contactEmail),
      // One recipient, deliberately. Resend meters its free tier by
      // *recipient*, not by message, and counts a bcc as one of them — so the
      // archive copy this used to carry doubled the quota cost of every send,
      // putting a registration's two emails at four units against a ceiling of
      // a hundred a day. Resend's own dashboard already keeps a log of
      // everything sent, which is what the archive mailbox was for.
      to: message.to,
      replyTo: contactEmail,
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
export type Segment = string | { strong: string };

export type Row =
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
      /** "MARIA DELA CRUZ (Parent)" for a minor with a guardian on file. */
      guardian: string | null;
    };

export type Block =
  | { kind: 'paragraph'; segments: Segment[] }
  | { kind: 'heading'; text: string }
  /** A bordered card. **Long values only** — see cardHtml(). */
  | { kind: 'card'; rows: Row[] }
  /** Plain rows of the one body table. */
  | { kind: 'rows'; rows: Row[] }
  /** The small grey closing paragraph. */
  | { kind: 'note'; segments: Segment[] }
  /**
   * The one thing to press. Only an email that asks the reader to *do*
   * something carries one — a receipt has nothing to press, and a button on it
   * would read as a request.
   */
  | { kind: 'button'; label: string; href: string };

export type StatusTone = 'pending' | 'success';

export interface EmailDocument {
  to: string;
  subject: string;
  status: { label: string; tone: StatusTone };
  blocks: Block[];
  /** What the footer invites questions about — "order" unless the email is about something else. */
  footerTopic?: string;
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
        ${
          row.guardian
            ? `<div style="font-size: 12px; color: #8b8b96; margin-top: 2px;">Parent/Guardian: ${escapeHtml(row.guardian)}</div>`
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
    case 'button':
      // A solid orange fill under the gradient, because Outlook desktop drops
      // background-image and would otherwise leave white text on nothing. The
      // link is the whole padded box, so a thumb anywhere on it lands.
      return fullWidthRow(
        `<a href="${escapeHtml(block.href)}" style="display: inline-block; background-color: ${BRAND_ORANGE}; background-image: linear-gradient(90deg, ${BRAND_ORANGE} 0%, ${BRAND_BLUE} 100%); color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 700; letter-spacing: 0.5px; text-decoration: none; padding: 14px 30px; border-radius: 12px;">${escapeHtml(block.label)}</a>`,
        'padding: 10px 0 8px; text-align: center;'
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
function renderHtml(doc: EmailDocument, contactEmail: string): string {
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
                <img src="${LOGO_URL}" alt="${SITE_NAME}" width="224" style="width: 224px; max-width: 62%; height: auto; display: block; margin: 0 auto;" />
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
                  Questions about this ${escapeHtml(doc.footerTopic ?? 'order')}? Reply to this email or reach us at
                  <a href="mailto:${escapeHtml(contactEmail)}" style="color: ${BRAND_BLUE}; text-decoration: none;">${escapeHtml(contactEmail)}</a>.<br/>
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
export const PESO_SIGN = '₱';
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
        ...(row.guardian ? [`  Parent/Guardian: ${row.guardian}`] : []),
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
    case 'button':
      // A text client cannot draw a button, so the address is spelled out.
      return `${block.label}:\n${block.href}`;
  }
}

function renderText(doc: EmailDocument, contactEmail: string): string {
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
    `Questions about this ${doc.footerTopic ?? 'order'}? Reply to this email or reach us at ${contactEmail}.`,
    `(c) ${new Date().getFullYear()} ${SITE_NAME}. All rights reserved.`,
  ].join('\n');
}

/** Async only for the contact address, which is a setting read from the database. */
export async function renderMessage(doc: EmailDocument): Promise<EmailMessage> {
  const contactEmail = await getContactEmail();
  return {
    to: doc.to,
    subject: doc.subject,
    html: renderHtml(doc, contactEmail),
    text: renderText(doc, contactEmail),
  };
}
