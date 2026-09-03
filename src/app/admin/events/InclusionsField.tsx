"use client";

import React, { useId } from 'react';
import { parseInclusions } from '@/lib/inclusions';

/**
 * What one category or package includes, edited as one item per line.
 *
 * A row of inputs with an "Add item" button would be the obvious control, but
 * an organizer entering five short things — Singlet, Medal, Bib, Lootbag —
 * wants to type them and press Enter, not click between each one. This is also
 * usually copied straight off the poster they already made, so pasting a
 * bulleted block has to just work: parseInclusions strips the bullets.
 *
 * The chips below the box exist because free text hides what was actually
 * understood. They show the parsed result live, so a stray blank line or a
 * pasted "- " reads as harmless rather than as something that might be stored.
 *
 * Optional, like the poster. An event with none simply shows no inclusions.
 */
export default function InclusionsField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  const id = useId();
  const items = parseInclusions(value);

  return (
    <div className="form-group form-group-full">
      <label className="form-label" htmlFor={id}>
        Inclusions <span className="text-xs opacity-70">- optional, one per line</span>
      </label>
      <textarea
        id={id}
        className="form-input"
        rows={4}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {items.length > 0 && (
        <div className="inclusion-chips" aria-live="polite">
          {items.map((item, idx) => (
            <span key={idx} className="inclusion-chip">
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
