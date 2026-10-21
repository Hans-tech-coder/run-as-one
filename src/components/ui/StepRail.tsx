import { Check } from 'lucide-react';
import './StepRail.css';

/**
 * The one step progress bar in the app: numbered dots joined by a line that
 * fills in orange as the steps are walked, a check on every finished step and
 * a short label under each dot from `sm` up.
 *
 * Used by the organizer application (`/admin/register`), both runner
 * registration wizards and a delivery switch's link (`/pay/logistics/[token]`),
 * so a multi-step form reads the same wherever it is.
 * It is a progress indicator, not a set of tabs: the dots are not buttons,
 * because a later step cannot be reached without answering the earlier ones.
 */
export default function StepRail({
  labels,
  current,
  ariaLabel,
  className,
}: {
  /** One short label per step, in order. Its length is the step count. */
  labels: string[];
  /** The step the person is on, counted from 0. */
  current: number;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <ol className={`step-rail${className ? ` ${className}` : ''}`} aria-label={ariaLabel}>
      {labels.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li
            key={label}
            className="step-rail__step"
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className="step-rail__dot" aria-hidden="true">
              {state === 'done' ? <Check size={15} strokeWidth={3} /> : index + 1}
            </span>
            <span className="step-rail__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
