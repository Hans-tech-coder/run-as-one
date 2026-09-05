"use client";

import React, { useEffect, useId, useRef, useState } from 'react';
import FieldError from '@/components/ui/FieldError';

/**
 * A text field that suggests, but does not restrict.
 *
 * Both the running-community field and the shirt-size field need the same
 * thing: a list to pick from that is not the whole story, so the runner can
 * type something the list has never heard of. A <select> cannot do that, and
 * two hand-rolled copies of the keyboard and ARIA handling would drift apart
 * the first time one of them was fixed.
 *
 * Fully controlled: the input's text *is* `value`, and the parent turns that
 * text into `rows`. There is no second copy of the query to fall out of sync.
 */

export interface ComboboxRow {
  /** React key, and the identity used to compare rows. */
  key: string;
  /** What lands in the field when this row is chosen. */
  value: string;
  label: React.ReactNode;
  /** Styles the row as an action rather than a plain choice. */
  emphasis?: boolean;
  /** Marks the row as the current answer. */
  selected?: boolean;
  /** Extra work the parent wants done when this row is chosen. */
  onSelect?: () => void;
}

export default function Combobox({
  label,
  value,
  rows,
  placeholder,
  maxLength,
  hint,
  headerRight,
  listboxLabel,
  onChange,
  onNormalize,
  id,
  error,
}: {
  label: string;
  value: string;
  rows: ComboboxRow[];
  placeholder?: string;
  maxLength?: number;
  /** Small print under the field. */
  hint?: React.ReactNode;
  /** Sits opposite the label — the shirt field puts its size guide link here. */
  headerRight?: React.ReactNode;
  listboxLabel: string;
  onChange: (next: string) => void;
  /**
   * Tidies what the runner typed once they leave the field — trimming, casing,
   * snapping to a listed spelling. Returning the input unchanged is fine.
   */
  onNormalize?: (typed: string) => string;
  /** Overrides the generated id so validation can send the caret here. */
  id?: string;
  /** What the field still wants, or nothing when it is satisfied. */
  error?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // The wizards render one of these per runner, so every id has to be unique or
  // runner two's listbox would be labelled by runner one's input.
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const inputId = id ?? `${baseId}-input`;
  const errorId = `${inputId}-error`;

  const close = () => {
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const commit = (row: ComboboxRow) => {
    row.onSelect?.();
    onChange(row.value);
    close();
  };

  // Clicking elsewhere dismisses the list. Whatever is typed stays as the
  // answer — that is the point of a combobox over a select.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  // Keep the highlighted row inside the scroll box on long lists.
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(0);
        return;
      }
      if (rows.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(prev => {
        // Nothing highlighted yet: down starts at the top, up at the bottom.
        // Wrapping arithmetic alone would land one short on the way up.
        if (prev < 0) return step === 1 ? 0 : rows.length - 1;
        return (prev + step + rows.length) % rows.length;
      });
      return;
    }

    if (e.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && rows[activeIndex]) {
        // Only swallow the key when it actually picked something, so Enter on a
        // closed field behaves the way it does in the rest of the form.
        e.preventDefault();
        commit(rows[activeIndex]);
      }
      return;
    }

    if (e.key === 'Escape') {
      if (isOpen) {
        e.stopPropagation();
        close();
      }
      return;
    }

    if (e.key === 'Tab') close();
  };

  const handleBlur = () => {
    if (!onNormalize) return;
    const next = onNormalize(value);
    if (next !== value) onChange(next);
  };

  return (
    <div className="input-group full-width">
      {headerRight ? (
        <div className="flex justify-between items-center mb-1">
          <label htmlFor={inputId} className="mb-0">
            {label}
          </label>
          {headerRight}
        </div>
      ) : (
        <label htmlFor={inputId}>{label}</label>
      )}

      <div ref={wrapperRef} className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-activedescendant={
            isOpen && activeIndex >= 0 ? `${baseId}-row-${activeIndex}` : undefined
          }
          maxLength={maxLength}
          value={value}
          placeholder={placeholder}
          onChange={e => {
            onChange(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          style={{ width: '100%' }}
        />

        {isOpen && rows.length > 0 && (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={listboxLabel}
            className="absolute z-30 left-0 right-0 mt-2 max-h-64 overflow-y-auto rounded-[12px] border border-white/15 bg-[#0d0d0f] shadow-[0_16px_40px_rgba(0,0,0,0.6)] py-1"
          >
            {rows.map((row, index) => (
              <li
                key={row.key}
                id={`${baseId}-row-${index}`}
                data-index={index}
                role="option"
                aria-selected={Boolean(row.selected)}
                // pointerdown, not click: the input's blur would otherwise close
                // the list before a click ever landed.
                onPointerDown={e => {
                  e.preventDefault();
                  commit(row);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex items-center gap-2 px-4 py-3 cursor-pointer text-sm transition-colors ${
                  index === activeIndex ? 'bg-white/10' : ''
                } ${row.emphasis ? 'text-accent-orange font-semibold' : 'text-white'}`}
              >
                {row.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <FieldError id={errorId} message={error} />

      {hint && <p className="text-xs text-secondary">{hint}</p>}
    </div>
  );
}
