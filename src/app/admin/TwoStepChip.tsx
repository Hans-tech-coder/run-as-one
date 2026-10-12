import React from 'react';
import { ShieldCheck } from 'lucide-react';

/**
 * "Two-step on", beside the name of a person who has two-step sign-in on — on
 * the Team page and in a client's Sign-ins (TWO_FACTOR_PLAN.md 4.4).
 *
 * A quiet grey pill like the Team page's "You", not a status badge: it is a
 * fact about the account, not a state the row is in, and a second coloured
 * pill beside Active would read as a second status. Its absence is what an
 * admin looks for — who has not turned it on yet — so nothing is drawn for
 * "off".
 */
export default function TwoStepChip() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[var(--ink-10)] px-2 py-0.5 text-[11px] font-semibold text-secondary">
      <ShieldCheck size={12} aria-hidden="true" />
      Two-step on
    </span>
  );
}
