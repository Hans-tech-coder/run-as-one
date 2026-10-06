/**
 * Handing a rendered email to a staff member to send from their own mailbox:
 * the two ways out of a by-hand panel, shared by the registrants tab's
 * `ManualEmailModal` and the Unpaid checkouts tab's `PaymentLinkEmailModal`
 * (UNPAID_FOLLOWUP_PLAN.md Batch 4), so both behave alike.
 */

/** An email in both renderings, as the server rendered it. */
export type RenderedEmail = { to: string; subject: string; html: string; text: string };

/**
 * The design, on the clipboard.
 *
 * This is the half that actually preserves the email: pasting text/html into
 * Gmail's compose window keeps the logo, the gradient bar and the status
 * pill. A mailto: cannot — its body is plain text by definition — which is
 * why both routes out of this modal exist and neither replaces the other.
 * Some browsers refuse the rich-text write; the plain text is still worth
 * having, and saying which one landed beats a silent half-success.
 */
export async function copyFormattedEmail(message: RenderedEmail): Promise<'copied' | 'text-only' | 'blocked'> {
  try {
    const item = new ClipboardItem({
      'text/html': new Blob([message.html], { type: 'text/html' }),
      'text/plain': new Blob([message.text], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
    return 'copied';
  } catch (e) {
    console.error(e);
    try {
      await navigator.clipboard.writeText(message.text);
      return 'text-only';
    } catch (err) {
      console.error(err);
      return 'blocked';
    }
  }
}

/**
 * The addressing, in their own mail app: recipient and subject prefilled,
 * the plain-text rendering as the body. Long emails can be truncated by the
 * client's own URL limit, which the modal says out loud — the clipboard
 * button is the complete one.
 */
export function openInMailApp(message: RenderedEmail) {
  window.location.href = `mailto:${message.to}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.text)}`;
}


/** What a by-hand panel says when neither clipboard write was allowed. */
export const CLIPBOARD_BLOCKED =
  'This browser blocked the clipboard. Select the preview text and copy it by hand.';
