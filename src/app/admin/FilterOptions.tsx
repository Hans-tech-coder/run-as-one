import React from 'react';

/**
 * An option is a plain value, or a value with the words shown for it — the
 * events list filters by a client's id and shows the client's name.
 */
export type FilterOption = string | { value: string; label: string; /** Small print, for two people with one name. */ hint?: string };

/**
 * One filter's options, as a list of checkboxes, drawn inside `FiltersMenu` —
 * the one Filters sheet every dashboard table uses. Shared so a filter looks
 * the same on every screen.
 */
export default function FilterOptions({
  options,
  selected,
  onToggle,
  capitalize = true,
}: {
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Category names are shown as the organizer typed them; the coded lists are capitalized. */
  capitalize?: boolean;
}) {
  return (
    <>
      {options.map(option => {
        const value = typeof option === 'string' ? option : option.value;
        const label = typeof option === 'string' ? option : option.label;
        const hint = typeof option === 'string' ? undefined : option.hint;
        const isSelected = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            role="menuitemcheckbox"
            aria-checked={isSelected}
            className={`w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--dash-hover)] cursor-pointer rounded-md text-sm text-left text-primary bg-transparent border-0 ${capitalize ? 'capitalize' : ''} ${isSelected ? 'bg-[var(--ink-05)]' : ''}`}
            onClick={() => onToggle(value)}
          >
            <span className={`w-4 h-4 shrink-0 border border-[var(--dash-border)] rounded-sm flex items-center justify-center ${isSelected ? 'bg-[var(--ink-10)]' : ''}`}>
              {isSelected && <span className="w-2 h-2 bg-[var(--ink)] rounded-sm" />}
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {label}
              {hint && <span className="block text-xs text-secondary normal-case">{hint}</span>}
            </span>
          </button>
        );
      })}
    </>
  );
}
