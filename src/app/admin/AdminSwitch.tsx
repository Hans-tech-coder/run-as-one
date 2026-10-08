'use client';

/**
 * The admin form's switch: a `.admin-switch-row` (see Admin.css) built from
 * props, so a form does not hand-write the button, the track and the thumb
 * each time. The whole row is the control, and a disabled row keeps its hint
 * readable, because the hint is where the reason it is disabled goes.
 *
 * Lifted out of LogisticsPanel when the event form's "Results only" switch
 * needed the same control with a disabled state.
 */
export default function AdminSwitch({
  on,
  label,
  hint,
  onToggle,
  disabled = false,
}: {
  on: boolean;
  label: string;
  hint: React.ReactNode;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={disabled}
      className="admin-switch-row"
    >
      <span className="admin-switch-label">
        <span>{label}</span>
        <span className="admin-switch-hint">{hint}</span>
      </span>
      <span className="t-toggle admin-switch" data-on={on} aria-hidden="true">
        <span className="t-toggle-thumb" />
      </span>
    </button>
  );
}
