"use client";

import React, { useState } from 'react';
import { Check } from 'lucide-react';

/**
 * The "before you send" checklist, for the person reading on screen. It is a
 * memory aid, not a record: nothing is saved, and a reload starts it over.
 *
 * The box is drawn rather than native (PROJECT_GUIDE §8.2): the real checkbox
 * sits invisibly over it, so the keyboard, the label and a screen reader all
 * get the browser's own control. The count is one atomic status line, so it is
 * announced as "3 of 7 checked" rather than a bare number.
 */
export default function GuideChecklist({ items }: { items: string[] }) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const done = checked.filter(Boolean).length;

  return (
    <>
      <ul className="cert-guide-checklist">
        {items.map((item, index) => (
          <li key={item}>
            <label className="cert-guide-check">
              <input
                type="checkbox"
                checked={checked[index]}
                onChange={e =>
                  setChecked(prev => prev.map((value, i) => (i === index ? e.target.checked : value)))
                }
              />
              <span className="cert-guide-box" aria-hidden="true">
                <Check size={14} strokeWidth={3} />
              </span>
              <span>{item}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="cert-guide-progress" role="status" aria-atomic="true">
        {done === items.length ? (
          <>
            <strong>All set.</strong> The template is ready to send.
          </>
        ) : (
          <>
            <strong>
              {done} of {items.length}
            </strong>{' '}
            checked
          </>
        )}
      </p>
    </>
  );
}
