/**
 * The answer the "Confirm with Google" popup hands back to the dialog that
 * opened it (lib/step-up.ts, StepUpDialog). Free of server code so both sides
 * import one shape.
 *
 * **Sent on a BroadcastChannel, and to `window.opener` when there is one.**
 * Google's sign-in pages may cut the popup off from its opener on the way
 * through, so the opener cannot be relied on; a same-origin channel reaches
 * the dialog either way. Every tab of this origin hears it, which is why the
 * answer carries the dialog's own random `ref` and a dialog takes only the
 * one that matches — and why what it carries is worth little alone: a token
 * good for five minutes, once, for one person, action and order.
 */

export const STEP_UP_CHANNEL = 'rao-step-up';

export type StepUpMessage =
  | { type: 'step-up'; ref: string; ok: true; token: string; expiresAt: number }
  | { type: 'step-up'; ref: string; ok: false; error: string };

export function isStepUpMessage(value: unknown): value is StepUpMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'step-up' &&
    typeof (value as { ref?: unknown }).ref === 'string'
  );
}
