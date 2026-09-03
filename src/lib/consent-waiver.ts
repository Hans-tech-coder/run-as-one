/**
 * The liability, media, and data-privacy waiver every runner agrees to.
 *
 * Wording comes from the organizer's own registration form — the "Disclaimer,
 * Consent & Data Privacy Waiver" section of the Tarlac Meet and Run 2026
 * Google Form — carried over near verbatim so every event states the same
 * commitments the organizer already put in writing. The one line that named
 * that specific event is parameterized so the same text is honest on any
 * event's registration page.
 */

/** The waiver's paragraphs, in reading order, for the given event. */
export function consentWaiverParagraphs(eventTitle: string): string[] {
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

/** The checkbox's own label, next to the waiver text rather than inside it. */
export const CONSENT_CHECKBOX_LABEL =
  'I have read and agree to the Disclaimer, Consent & Data Privacy Waiver above.';
