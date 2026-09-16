import React from "react";
import RunnerLoader from "./RunnerLoader";

/**
 * The label of a button that is working: the words, then the running figure.
 *
 * Every busy button in the app used to end its label in an ellipsis — "Saving…",
 * "Signing in…" — which is a loader drawn in punctuation: three dots that never
 * move cannot say the work is still going, and that is the same objection that
 * removed the dot loader from the dashboard. The owner asked for the figure
 * instead, and for it to run **after** the words rather than in front of them,
 * so the label still starts where it started when the button was idle and only
 * the trailing mark changes.
 *
 * So: `{isSaving ? <BusyLabel>Saving</BusyLabel> : 'Save Changes'}`. The label
 * is a gerund with no dots; the figure is `sm` and `tone="current"`, drawn in
 * the button's own text colour because brand blue disappears into the gradient
 * button's blue end. `label=""` keeps it silent for screen readers — the words
 * beside it already say what is happening.
 *
 * It is a wrapper rather than two loose children so the gap between the word
 * and the figure is 8px everywhere, whatever gap the button itself sets between
 * its leading icon and its label.
 */
export default function BusyLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`busy-label ${className}`.trim()}>
      {children}
      <RunnerLoader size="sm" tone="current" label="" />
    </span>
  );
}
