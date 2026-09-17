"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, Minus } from 'lucide-react';
import {
  MATRIX_ROLES,
  MATRIX_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_HINTS,
  ROLE_LABELS,
  roleCan,
  type Role,
} from '@/lib/permissions';

/**
 * The permission matrix as a phone reads it: one role at a time.
 *
 * Seven columns of ticks do not fit a 360px screen, and scrolling them
 * sideways would hide the very column an owner is trying to compare. So below
 * `lg` the RolesPanel swaps its table for this: a segmented control of the
 * roles, and under it the chosen role's permissions as allowed / not allowed
 * rows. It reads `permissions.ts` exactly as the table does, so the two cannot
 * disagree.
 *
 * The role's hint is shown as text. On the table it is the column header's
 * hover title, which a touch screen never shows.
 *
 * The moving highlight is transitions.dev's tabs sliding (16). Six roles wrap
 * onto more than one line on a phone, so the pill travels in both axes and
 * takes the tab's height as well as its width. It is placed without a
 * transition on first paint and on every resize, so it never slides in from
 * the corner. It stays a proper tablist: arrow keys, Home and End move the
 * selection, and only the selected tab is in the tab order.
 */
export default function RolePicker() {
  const [role, setRole] = useState<Role>(MATRIX_ROLES[0]);
  const barRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef(new Map<Role, HTMLButtonElement>());
  const hasPlaced = useRef(false);
  const baseId = useId();

  const placePill = useCallback(
    (animate: boolean) => {
      const pill = pillRef.current;
      const tab = tabRefs.current.get(role);
      if (!pill || !tab) return;
      const apply = () => {
        pill.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
        pill.style.width = `${tab.offsetWidth}px`;
        pill.style.height = `${tab.offsetHeight}px`;
      };
      if (animate) {
        apply();
        return;
      }
      const previous = pill.style.transition;
      pill.style.transition = 'none';
      apply();
      void pill.offsetWidth;
      pill.style.transition = previous;
    },
    [role],
  );

  // Before paint, so a changed role never shows the pill in its old seat.
  useLayoutEffect(() => {
    placePill(hasPlaced.current);
    hasPlaced.current = true;
  }, [placePill]);

  // The grid reflows as the screen turns or the panel widens, and a hidden
  // picker (from `lg` up) measures zero until it is shown again.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(() => placePill(false));
    observer.observe(bar);
    return () => observer.disconnect();
  }, [placePill]);

  const select = (next: Role) => {
    setRole(next);
    tabRefs.current.get(next)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = MATRIX_ROLES.indexOf(role);
    const last = MATRIX_ROLES.length - 1;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? index === last ? 0 : index + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? index === 0 ? last : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    select(MATRIX_ROLES[next]);
  };

  const allowed = MATRIX_PERMISSIONS.filter(permission => roleCan(role, permission)).length;

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={barRef}
        role="tablist"
        aria-label="Role"
        className="t-tabs role-tabs"
        onKeyDown={handleKeyDown}
      >
        <span ref={pillRef} className="t-tabs-pill" aria-hidden="true" />
        {MATRIX_ROLES.map(option => {
          const isSelected = option === role;
          return (
            <button
              key={option}
              ref={element => {
                if (element) tabRefs.current.set(option, element);
                else tabRefs.current.delete(option);
              }}
              id={`${baseId}-tab-${option}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel`}
              tabIndex={isSelected ? 0 : -1}
              className="t-tab"
              onClick={() => select(option)}
            >
              {ROLE_LABELS[option]}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${role}`}>
        <p className="m-0 text-sm text-secondary">{ROLE_HINTS[role]}</p>
        <p className="m-0 mt-3 text-xs font-semibold uppercase tracking-wider text-secondary">
          {`Allowed ${allowed} of ${MATRIX_PERMISSIONS.length}`}
        </p>

        <ul className="m-0 mt-2 p-0 list-none border border-white/10 rounded-lg">
          {MATRIX_PERMISSIONS.map(permission => {
            const yes = roleCan(role, permission);
            return (
              <li
                key={permission}
                className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-b-0"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    yes ? 'bg-accent-orange/15 text-accent-orange' : 'bg-white/5 text-white/30'
                  }`}
                  aria-hidden="true"
                >
                  {yes ? <Check size={14} strokeWidth={3} /> : <Minus size={14} />}
                </span>
                <span className={`min-w-0 flex-1 text-sm ${yes ? 'text-white' : 'text-white/45'}`}>
                  {PERMISSION_LABELS[permission]}
                </span>
                {/* Said in words as well as by the icon, so the answer never rests
                    on colour alone. */}
                <span className={`shrink-0 whitespace-nowrap text-xs ${yes ? 'text-secondary' : 'text-white/35'}`}>
                  {yes ? 'Allowed' : 'Not allowed'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
