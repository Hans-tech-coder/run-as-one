/**
 * The liability, media, and data-privacy waiver every runner agrees to.
 *
 * The default wording comes from the organizer's own registration form — the
 * "Disclaimer, Consent & Data Privacy Waiver" section of the Tarlac Meet and
 * Run 2026 Google Form — so an event that says nothing still states the
 * commitments the organizer already put in writing. The one line that named
 * that specific event is parameterized, and an organizer who needs different
 * terms can replace the whole thing per event from the admin form.
 */

/** The wording an event falls back to when the organizer has not written its own. */
export function defaultConsentWaiverParagraphs(eventTitle: string): string[] {
  const name = eventTitle?.trim() || 'this event';
  return [
    `By registering for ${name}, the participant acknowledges and understands the nature of the activity and confirms that all information provided is given willingly.`,
    'Participants are expected to be in good health and physically fit to join. By registering, each participant accepts full responsibility for their own safety and well-being during the event. The organizers, sponsors, and partners shall not be held liable for any injury, loss, or incident that may occur before, during, or after the run.',
    'Risks may include physical exhaustion, heat stress, slips and falls, muscle strain, cardiac events, environmental hazards, loss of personal belongings, and unforeseen incidents beyond the organizers’ control.',
    'By submitting the registration form, the participant affirms awareness of these risks and agrees to participate at their own discretion, releasing the organizers from any liability for outcomes arising from participation.',
    'The participant also consents to the use of photos and videos taken during the event for documentation and promotional purposes, without expectation of compensation.',
    'In compliance with the Data Privacy Act of 2012 (RA 10173), the participant agrees that personal information provided during registration may be collected, stored, and processed solely for event administration, safety, and communication purposes. Data will be kept confidential and will not be shared with unauthorized parties. Participants may request access, correction, or deletion of their data by contacting the organizers.',
  ];
}

/**
 * Editor text to the paragraphs that get stored.
 *
 * Two ways of separating paragraphs are accepted, because organizers write
 * both. Pasting from a document usually brings blank lines between paragraphs,
 * so a blank line splits. Typing straight into the box, people tend to press
 * Enter once per paragraph, so when there is no blank line anywhere, each line
 * is its own paragraph instead. Line breaks inside a paragraph collapse to
 * spaces, which is how the browser would render them anyway.
 */
export function parseWaiverParagraphs(text: string): string[] {
  if (typeof text !== 'string') return [];
  const normalized = text.replace(/\r\n?/g, '\n');
  const hasBlankLine = /\n[ \t]*\n/.test(normalized);
  const blocks = hasBlankLine ? normalized.split(/\n[ \t]*\n+/) : normalized.split('\n');
  return blocks.map(block => block.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Stored paragraphs back into editor text, one blank line between each. */
export function formatWaiverParagraphs(
  list: readonly string[] | null | undefined
): string {
  return (list ?? []).join('\n\n');
}

/**
 * Whatever the request body carried, as clean paragraphs.
 *
 * Accepts both shapes on purpose: the admin form posts the raw textarea
 * string, while a caller holding an already-split list can post that instead.
 */
export function asWaiverParagraphs(value: unknown): string[] {
  if (typeof value === 'string') return parseWaiverParagraphs(value);
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * The waiver a runner actually sees for this event.
 *
 * The organizer's own wording when they wrote some, and the standard wording
 * otherwise — an event must never present an empty waiver above a checkbox
 * that claims the runner read one.
 */
export function resolveConsentWaiver(event: {
  title?: string | null;
  consentWaiver?: readonly string[] | null;
}): string[] {
  const stored = asWaiverParagraphs(event?.consentWaiver);
  if (stored.length > 0) return stored;
  return defaultConsentWaiverParagraphs(event?.title ?? '');
}

/** The checkbox's own label, next to the waiver text rather than inside it. */
export const CONSENT_CHECKBOX_LABEL =
  'I have read and agree to the Disclaimer, Consent & Data Privacy Waiver above.';
