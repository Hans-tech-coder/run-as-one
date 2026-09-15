import React from 'react';

/**
 * A toolbar chip that can be on: a filter that finds rows, never one that
 * sorts them, so a row never moves out from under the person working it.
 *
 * `.btn-filter` has no active state of its own — most screens' chips open a
 * menu rather than toggling — so the "on" look is added here: the dashboard's
 * light fill, the same inversion `.btn-light` uses to mark the one thing worth
 * pressing. Pressing an active chip clears it, which is why each one carries
 * aria-pressed rather than pretending to be a link.
 *
 * It began inside the feedback inbox and moved here when the organizer list
 * needed the same status chips, so the two screens cannot drift. 44px tall
 * below `lg`, where it is tapped.
 */
export default function FilterChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="btn-filter max-lg:min-h-11"
      style={
        active
          ? { background: '#e4e4e7', borderColor: '#e4e4e7', color: '#09090b' }
          : undefined
      }
    >
      {icon}
      {label}
    </button>
  );
}
